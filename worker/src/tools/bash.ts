import type { SidecarClient } from '../sandbox/sidecar-client.js';
import { sanitizeEnvVars } from './sanitize.js';

// Tool definition sent to the LLM
export const BASH_TOOL_DEFINITION = {
  name: 'bash',
  description: 'Execute a shell command in the sandboxed environment. Has access to git, gh, glab, curl, jq, yq, node, npm, python3, make, gcc, and standard Unix tools.',
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute. Use $TMPDIR for temporary files. Work in $HOME (the working directory).',
      },
      timeout: {
        type: 'number',
        description: 'Max execution time in milliseconds (default 30000, max 300000)',
      },
      workdir: {
        type: 'string',
        description: 'Working directory relative to the sandbox home (default: $HOME)',
      },
    },
    required: ['command'],
  },
};

// System prompt snippet appended to LLM Agent prompts
export const BASH_SANDBOX_SYSTEM_PROMPT = `
You are running inside a flow execution. Each flow run has its own sandboxed
environment that is isolated from all other flows. This sandbox is destroyed
when the flow completes, fails, or is cancelled.

You have access to a bash tool that runs shell commands in the sandbox.
The sandbox has the following CLI tools available:

  git         — full version control (clone, commit, push, tag, etc.)
  gh          — GitHub CLI
  glab        — GitLab CLI
  curl        — HTTP requests
  jq          — JSON query and transformation
  yq          — YAML/JSON/XML/TOML processor
  node        — JavaScript/Node.js runtime (v25)
  npm         — Node.js package manager
  python3     — Python 3 interpreter
  pip3        — Python package installer
  make        — build tool
  gcc/g++     — C/C++ compiler
  zip/unzip   — archive tools
  tar, gzip   — compression tools
  awk, sed    — text processing
  grep, find  — file searching
  cat, less, head, tail, wc — file inspection
  ls, cp, mv, rm, mkdir, chmod — file operations
  timeout     — run a command with a time limit
  env         — print environment (will show PATH, HOME, TMPDIR, XDG_*)

AUTHENTICATION:
  - GitLab, GitHub, npm, and other tokens are available as environment variables
    (e.g. $GITLAB_TOKEN, $GH_TOKEN, $NPM_TOKEN). Use them directly in your commands.
  - SSH keys for git operations are configured automatically — no manual setup needed.

FILESYSTEM RULES:
  - The sandbox filesystem is read-only EXCEPT for your HOME directory.
  - Your HOME directory is: $HOME
  - This is the ONLY directory where you can create, modify, or delete files.
  - Use $TMPDIR for temporary files — it is automatically cleaned up after each execution.
  - All data outside $HOME and $TMPDIR is read-only (system binaries, libraries, config).

WORKING DIRECTORY:
  - The working directory starts at $HOME.
  - Store all project files, clones, builds, and artifacts under $HOME.

PERSISTENCE:
  - Files you write to $HOME persist across tool calls within this flow execution.
  - When the flow finishes (completed, cancelled, or failed), the entire $HOME directory
    is deleted. Push artifacts to an external service if they need to outlive the flow.
`;

/**
 * Execute a bash command via the sidecar.
 */
export async function executeBash(
  sidecarClient: SidecarClient,
  executionId: string,
  command: string,
  env: Record<string, string>,
  timeout?: number,
  workdir?: string,
): Promise<string> {
  const sanitizedEnv = sanitizeEnvVars(env);

  const result = await sidecarClient.exec({
    executionId,
    command,
    timeout: Math.min(timeout ?? 30000, 300000), // max 5 min
    workdir,
    env: sanitizedEnv,
  });

  if (result.error) {
    throw new Error(`Bash execution failed: ${result.error}`);
  }

  // Format the output for the LLM
  const output: string[] = [];
  if (result.stdout) output.push(result.stdout);
  if (result.stderr) output.push(`STDERR:\n${result.stderr}`);
  if (result.exitCode !== 0) output.push(`Exit code: ${result.exitCode}`);

  return output.join('\n') || '(no output)';
}

/**
 * Execute code node code via the sidecar.
 * Runs the code as a Node.js script in the sandbox.
 */
export async function executeCode(
  sidecarClient: SidecarClient,
  executionId: string,
  code: string,
  input: unknown,
  env: Record<string, string>,
  timeout?: number,
): Promise<unknown> {
  // Inject input as a variable, wrap code in an IIFE so `return` works, serialize result
  const serializedInput = JSON.stringify(input);
  const wrappedCode = `const input = ${serializedInput}; const __run = () => { ${code} }; const __result = __run(); process.stdout.write(JSON.stringify(__result));`;
  // Write code as a file on the sidecar and execute it — avoids bash quoting issues
  const fileName = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.js`;
  const nodeCommand = `node ${fileName}`;

  const sanitizedEnv = sanitizeEnvVars(env);

  const result = await sidecarClient.exec({
    executionId,
    command: nodeCommand,
    timeout: Math.min(timeout ?? 30000, 300000),
    env: sanitizedEnv,
    codeFile: wrappedCode,
    codeFileName: fileName,
  });

  if (result.error) {
    throw new Error(`Code execution failed: ${result.error}`);
  }

  // Debug: log stderr if present
  if (result.stderr?.trim()) {
    console.error(`[code stderr] ${result.stderr.trim()}`);
  }

  // Try to parse stdout as JSON (the code node usually returns structured data)
  if (result.stdout?.trim()) {
    try {
      return JSON.parse(result.stdout.trim());
    } catch {
      return { result: result.stdout.trim() };
    }
  }

  return { result: '(no output)' };
}
