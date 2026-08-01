import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, rmSync, chmodSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';

const DATA_ROOT = '/var/flow-data';
const LANDLOCK_HELPER = '/usr/local/bin/landlock-helper';
const STREAM_CAP = 1_048_576; // 1 MB per stream
const EVAL_TIMEOUT = 15_000;
const ENV_ALLOWLIST = new Set([
  'PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'LANG', 'TMPDIR',
  'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'GIT_CONFIG_GLOBAL', 'GIT_SSH_COMMAND',
]);

const SIDECAR_PORT = parseInt(process.env.SIDECAR_PORT ?? '4001', 10);

// Shared-secret auth: every request must carry x-sidecar-token.
const SIDECAR_TOKEN = process.env.SIDECAR_TOKEN;
if (!SIDECAR_TOKEN) {
  console.error('sidecar: SIDECAR_TOKEN environment variable is required — refusing to start without authentication');
  process.exit(1);
}

// Never echo secrets in logs
function redactLog(text: string): string {
  return text
    .replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, '//REDACTED:REDACTED@') // URL userinfo (user:pass@)
    .replace(/Bearer\s+\S+/g, 'Bearer REDACTED')
    .replace(/Authorization:\s*[^\r\n,;]+/gi, 'Authorization: REDACTED')
    .replace(/([?&](?:password|passwd|pwd|secret|token|api[_-]?key|key)=)[^&\s]+/gi, '$1REDACTED')
    .replace(/(\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY)[A-Z0-9_]*\s*[:=]\s*)\S+/gi, '$1REDACTED')
    .replace(/(\b(?:password|passwd|pwd|secret|token|api[_-]?key|key)\s*[:=]\s*)\S+/gi, '$1REDACTED');
}

function sanitizeErrorMessage(message: string): string {
  const cleaned = redactLog(String(message));
  return cleaned.length > 200 ? `${cleaned.slice(0, 200)}...` : cleaned;
}

function isAuthorized(req: IncomingMessage): boolean {
  const header = req.headers['x-sidecar-token'];
  if (typeof header !== 'string' || !SIDECAR_TOKEN) return false;
  const a = Buffer.from(header, 'utf-8');
  const b = Buffer.from(SIDECAR_TOKEN, 'utf-8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── CLI args ──────────────────────────────────────────────────────
const ttlHours = (() => {
  const idx = process.argv.indexOf('--ttl-hours');
  if (idx !== -1 && idx + 1 < process.argv.length) {
    const val = parseInt(process.argv[idx + 1], 10);
    if (val > 0) return val;
  }
  return 168;
})();

// ── Helpers ───────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function jsonError(res: ServerResponse, status: number, message: string) {
  jsonResponse(res, status, { error: message });
}

function validateExecutionId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function sanitizeEnv(raw: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  // Always include allowlisted vars from the current process environment
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key]) out[key] = process.env[key];
  }
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (ENV_ALLOWLIST.has(k) || /^[A-Z_][A-Z0-9_]*$/.test(k)) {
      out[k] = v;
    }
  }
  return out;
}

function execBaseDir(executionId: string): string {
  return resolve(`${DATA_ROOT}/${executionId}`);
}

// workdir must resolve inside the execution sandbox dir (reject path traversal)
function resolveWorkdir(base: string, workdir?: string): string {
  if (!workdir) return join(base, 'home');
  const resolved = isAbsolute(workdir) ? resolve(workdir) : resolve(base, 'home', workdir);
  if (resolved !== base && !resolved.startsWith(`${base}/`)) {
    throw new Error('workdir must resolve inside the execution sandbox directory');
  }
  return resolved;
}

// codeFileName must be a plain filename — no separators or traversal
function validateCodeFileName(name?: string): string {
  const fileName = name || 'run.js';
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..') || fileName.includes('\0')) {
    throw new Error('codeFileName must be a plain file name');
  }
  return fileName;
}

interface SandboxRunResult {
  status: number;
  body: { stdout: string; stderr: string; exitCode: number; error?: string };
}

function runInSandbox(opts: {
  base: string;
  cwd: string;
  env: Record<string, string>;
  command: string;
  timeout: number;
}): Promise<SandboxRunResult> {
  const helperArgs = [
    '--ro', '/usr', '--ro', '/bin', '--ro', '/lib', '--ro', '/etc',
    '--rw', '/dev',
    '--rw', opts.base,
    '--', 'bash', '-c', opts.command,
  ];
  const child = spawn(LANDLOCK_HELPER, helperArgs, {
    cwd: opts.cwd, env: opts.env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });

  let stdout = '';
  let stderr = '';

  const capStream = (stream: NodeJS.ReadableStream, buf: string[], label: 'stdout' | 'stderr') => {
    stream.on('data', (chunk: Buffer) => {
      const total = buf[0] ? buf[0].length + chunk.length : chunk.length;
      if (total > STREAM_CAP) {
        const remaining = STREAM_CAP - (buf[0]?.length ?? 0);
        if (remaining > 0) {
          buf[0] = (buf[0] ?? '') + chunk.toString('utf-8').slice(0, remaining);
        }
        if (label === 'stderr') {
          child.kill('SIGKILL');
        }
      } else {
        buf[0] = (buf[0] ?? '') + chunk.toString('utf-8');
      }
    });
  };

  const stdoutBuf: string[] = [];
  const stderrBuf: string[] = [];
  capStream(child.stdout!, stdoutBuf, 'stdout');
  capStream(child.stderr!, stderrBuf, 'stderr');

  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      // process may already be dead
    }
  }, opts.timeout);

  return new Promise<SandboxRunResult>((resolvePromise) => {
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      stdout = stdoutBuf[0] ?? '';
      stderr = stderrBuf[0] ?? '';
      resolvePromise({
        status: 200,
        body: { stdout, stderr, exitCode: exitCode ?? -1 },
      });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({ status: 500, body: { stdout: '', stderr: '', exitCode: -1, error: err.message } });
    });
  });
}

// ── Endpoint handlers ─────────────────────────────────────────────

async function handleSetup(body: Record<string, unknown>) {
  const { executionId } = body as { executionId: string };
  if (!executionId || !validateExecutionId(executionId)) {
    return { status: 400, body: { error: 'Invalid executionId' } };
  }
  const base = execBaseDir(executionId);
  for (const dir of ['home', 'tmp', '.cache', '.config']) {
    mkdirSync(join(base, dir), { recursive: true });
  }
  const gitconfig = `[user]\n\tname = Core Agents\n\temail = core@agents.local\n`;
  writeFileSync(join(base, '.gitconfig'), gitconfig);
  return { status: 200, body: { success: true } };
}

async function handleExec(body: Record<string, unknown>) {
  const { executionId, command, timeout, workdir, env, codeFile, codeFileName } = body as {
    executionId: string;
    command: string;
    timeout?: number;
    workdir?: string;
    env?: Record<string, string>;
    codeFile?: string;
    codeFileName?: string;
  };

  console.log(`sidecar: exec executionId=${executionId} command.length=${command?.length} command=${redactLog(command?.slice(0, 200))} codeFile=${!!codeFile}`);

  if (!executionId || !validateExecutionId(executionId)) {
    return { status: 400, body: { error: 'Invalid executionId' } };
  }
  if (!command) {
    return { status: 400, body: { error: 'command is required' } };
  }

  const base = execBaseDir(executionId);
  if (!existsSync(base)) {
    return { status: 404, body: { error: 'Execution session not found. Call /setup first.' } };
  }

  // Resolve and validate workdir before touching the filesystem
  let cwd: string;
  try {
    cwd = resolveWorkdir(base, workdir);
  } catch (err) {
    return { status: 400, body: { error: err instanceof Error ? err.message : 'invalid workdir' } };
  }

  // Write code file before executing
  if (codeFile && typeof codeFile === 'string') {
    let fileName: string;
    try {
      fileName = validateCodeFileName(codeFileName);
    } catch (err) {
      return { status: 400, body: { error: err instanceof Error ? err.message : 'invalid codeFileName' } };
    }
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, fileName), codeFile, 'utf-8');
  }

  // Check landlock-helper availability
  if (!existsSync(LANDLOCK_HELPER)) {
    return { status: 500, body: { error: 'Landlock not available' } };
  }

  // Build env
  const finalEnv: Record<string, string> = sanitizeEnv(env);

  // Handle SSH key — pin known hosts per execution dir so host key changes fail instead of bypassing verification
  let sshKeyPath: string | undefined;
  if (finalEnv['SSH_PRIVATE_KEY']) {
    sshKeyPath = join(base, 'id_rsa');
    writeFileSync(sshKeyPath, finalEnv['SSH_PRIVATE_KEY'], { mode: 0o600 });
    chmodSync(sshKeyPath, 0o600);
    delete finalEnv['SSH_PRIVATE_KEY'];
    finalEnv['GIT_SSH_COMMAND'] = `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=${join(base, 'known_hosts')}`;
  }

  finalEnv['GIT_CONFIG_GLOBAL'] = join(base, '.gitconfig');
  finalEnv['XDG_CACHE_HOME'] = join(base, '.cache');
  finalEnv['XDG_CONFIG_HOME'] = join(base, '.config');
  finalEnv['HOME'] = cwd;

  const procTimeout = (timeout && timeout > 0) ? timeout : 30_000;

  return runInSandbox({ base, cwd, env: finalEnv, command, timeout: procTimeout });
}

// Evaluate a flow condition expression inside the sandbox.
// The code runs as `(function(input){ return <code> })(input)` and the result is JSON-serialized.
async function handleEval(body: Record<string, unknown>) {
  const { executionId, code, input } = body as { executionId: string; code: string; input?: unknown };
  if (!executionId || !validateExecutionId(executionId)) {
    return { status: 400, body: { error: 'Invalid executionId' } };
  }
  if (typeof code !== 'string' || !code.trim()) {
    return { status: 400, body: { error: 'code is required' } };
  }

  const base = execBaseDir(executionId);
  if (!existsSync(base)) {
    return { status: 404, body: { error: 'Execution session not found. Call /setup first.' } };
  }
  if (!existsSync(LANDLOCK_HELPER)) {
    return { status: 500, body: { error: 'Landlock not available' } };
  }

  const cwd = join(base, 'home');
  mkdirSync(cwd, { recursive: true });

  let serializedInput: string;
  try {
    serializedInput = JSON.stringify(input ?? {});
  } catch {
    serializedInput = '{}';
  }
  const wrappedCode = `const input = ${serializedInput};\n` +
    `let __result;\n` +
    `try {\n` +
    `  __result = (function(input){ return ${code} })(input);\n` +
    `} catch (__e) {\n` +
    `  process.stdout.write('__COND_ERR__' + String(__e && __e.message ? __e.message : __e));\n` +
    `  process.exit(2);\n` +
    `}\n` +
    `let __out;\n` +
    `try {\n` +
    `  __out = JSON.stringify(__result === undefined ? 'undefined' : __result);\n` +
    `} catch {\n` +
    `  __out = JSON.stringify('undefined');\n` +
    `}\n` +
    `process.stdout.write(__out);`;

  const fileName = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.js`;
  writeFileSync(join(cwd, fileName), wrappedCode, 'utf-8');

  // No secrets are passed — only the process allowlist (PATH, HOME, ...)
  const runResult = await runInSandbox({
    base, cwd, env: sanitizeEnv(undefined), command: `node ${fileName}`, timeout: EVAL_TIMEOUT,
  });

  if (runResult.body.error) {
    return { status: 500, body: { ok: false, error: sanitizeErrorMessage(runResult.body.error) } };
  }
  const stdout = runResult.body.stdout ?? '';
  const stderr = runResult.body.stderr ?? '';
  if (stdout.startsWith('__COND_ERR__')) {
    return { status: 200, body: { ok: false, error: sanitizeErrorMessage(stdout.slice('__COND_ERR__'.length)) } };
  }
  if ((runResult.body.exitCode ?? -1) !== 0) {
    return { status: 200, body: { ok: false, error: sanitizeErrorMessage(stderr || stdout || `exit code ${runResult.body.exitCode}`) } };
  }
  try {
    const result = JSON.parse(stdout.trim());
    return { status: 200, body: { ok: true, result } };
  } catch {
    return { status: 200, body: { ok: false, error: 'condition produced non-JSON output' } };
  }
}

async function handleTeardown(body: Record<string, unknown>) {
  const { executionId } = body as { executionId: string };
  if (!executionId || !validateExecutionId(executionId)) {
    return { status: 400, body: { error: 'Invalid executionId' } };
  }
  const base = execBaseDir(executionId);
  if (existsSync(base)) {
    rmSync(base, { recursive: true, force: true });
  }
  return { status: 200, body: { success: true } };
}

// ── Background file reaper ────────────────────────────────────────

function reapOldDirectories() {
  if (!existsSync(DATA_ROOT)) return;
  const cutoff = Date.now() - ttlHours * 60 * 60 * 1000;
  for (const entry of readdirSync(DATA_ROOT)) {
    const full = join(DATA_ROOT, entry);
    try {
      const s = statSync(full);
      if (s.isDirectory() && s.mtimeMs < cutoff) {
        rmSync(full, { recursive: true, force: true });
      }
    } catch {
      // race — skip
    }
  }
}

// ── HTTP Router ───────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  if (!isAuthorized(req)) {
    jsonError(res, 401, 'Unauthorized');
    return;
  }

  try {
    const rawBody = await readBody(req);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      jsonError(res, 400, 'Invalid JSON body');
      return;
    }

    let result: { status: number; body: unknown };

    if (method === 'POST' && url === '/setup') {
      result = await handleSetup(body);
    } else if (method === 'POST' && url === '/exec') {
      result = await handleExec(body);
    } else if (method === 'POST' && url === '/eval') {
      result = await handleEval(body);
    } else if (method === 'POST' && url === '/teardown') {
      result = await handleTeardown(body);
    } else {
      jsonError(res, 404, 'Not found');
      return;
    }

    jsonResponse(res, result.status, result.body);
  } catch (err) {
    jsonError(res, 500, err instanceof Error ? err.message : 'Internal server error');
  }
});

// ── Startup ───────────────────────────────────────────────────────

// Probe Landlock availability at startup
if (existsSync(LANDLOCK_HELPER)) {
  try {
    const probe = spawnSync(LANDLOCK_HELPER, ['--probe'], { timeout: 5000 });
    if (probe.status !== 0) {
      const stderr = probe.stderr?.toString() || 'unknown error';
      console.error(`sidecar: Landlock helper probe failed: ${stderr.trim()}`);
      console.error('sidecar: bash tool execution will fail — ensure Landlock is enabled in the kernel');
    } else {
      console.log('sidecar: Landlock detected and available');
    }
  } catch (err) {
    console.error('sidecar: Landlock probe error:', err);
  }
} else {
  console.error(`sidecar: landlock-helper not found at ${LANDLOCK_HELPER}`);
  console.error('sidecar: bash tool execution will fail — rebuild the sidecar image');
}

server.listen(SIDECAR_PORT, () => {
  console.log(`sidecar: listening on port ${SIDECAR_PORT}, ttl=${ttlHours}h`);
});

setInterval(reapOldDirectories, 30 * 60 * 1000);
