import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, rmSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DATA_ROOT = '/var/flow-data';
const LANDLOCK_HELPER = '/usr/local/bin/landlock-helper';
const STREAM_CAP = 1_048_576; // 1 MB per stream
const ENV_ALLOWLIST = new Set([
  'PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'LANG', 'TMPDIR',
  'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'GIT_CONFIG_GLOBAL', 'GIT_SSH_COMMAND',
]);

const SIDECAR_PORT = parseInt(process.env.SIDECAR_PORT ?? '4001', 10);

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

  console.log(`sidecar: exec executionId=${executionId} command.length=${command?.length} command=${command?.slice(0, 200)} codeFile=${!!codeFile}`);

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

  // Write code file before executing
  const cwd = workdir ?? join(base, 'home');
  if (codeFile && typeof codeFile === 'string') {
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, codeFileName || 'run.js'), codeFile, 'utf-8');
  }

  // Check landlock-helper availability
  if (!existsSync(LANDLOCK_HELPER)) {
    return { status: 500, body: { error: 'Landlock not available' } };
  }

  // Build env
  const finalEnv: Record<string, string> = sanitizeEnv(env);

  // Handle SSH key
  let sshKeyPath: string | undefined;
  if (finalEnv['SSH_PRIVATE_KEY']) {
    sshKeyPath = join(base, 'id_rsa');
    writeFileSync(sshKeyPath, finalEnv['SSH_PRIVATE_KEY'], { mode: 0o600 });
    chmodSync(sshKeyPath, 0o600);
    delete finalEnv['SSH_PRIVATE_KEY'];
    finalEnv['GIT_SSH_COMMAND'] = `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no`;
  }

  finalEnv['GIT_CONFIG_GLOBAL'] = join(base, '.gitconfig');
  finalEnv['XDG_CACHE_HOME'] = join(base, '.cache');
  finalEnv['XDG_CONFIG_HOME'] = join(base, '.config');
  finalEnv['HOME'] = cwd;

  const procTimeout = (timeout && timeout > 0) ? timeout : 30_000;

  const helperArgs = [
    '--ro', '/usr', '--ro', '/bin', '--ro', '/lib', '--ro', '/etc', '--ro', '/dev',
    '--rw', base,
    '--', 'bash', '-c', command,
  ];
  const child = spawn(LANDLOCK_HELPER, helperArgs, {
    cwd, env: finalEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
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
  }, procTimeout);

  return new Promise<{ status: number; body: unknown }>((resolvePromise) => {
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
      resolvePromise({ status: 500, body: { error: err.message } });
    });
  });
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
