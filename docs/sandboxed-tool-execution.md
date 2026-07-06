# Sandboxed Tool Execution — Final Plan

**Branch:** `feat/sandboxed-tool-execution`

---

## Terminology

| Term | Meaning |
|---|---|
| **Core secrets** | Secrets stored in our own PostgreSQL database, encrypted with AES-256-GCM. Managed via the `/settings/secrets` UI. Three scopes: `app`, `group`, `flow`. |
| **CyberArk secrets** | Secrets stored in an external CyberArk Conjur vault. Cannot be enumerated or listed — fetched by known variable path at runtime. Coupled to a group via `group_vault_config`. |
| **Env var map** | The merged set of environment variables passed to the sandboxed bash process. Built at execution start from core secrets + CyberArk lookups. |
| **Sidecar** | A separate container in the same pod. Zero env vars, read-only rootfs, handles all sandboxed bash execution via Landlock. |

---

## Overview

| What | Why |
|---|---|
| **Sidecar container** per pod | Runs sandboxed bash commands with zero env vars — secrets can never leak |
| **Landlock helper** binary | Unprivileged OS-level filesystem restriction — agent can only write to its execution directory |
| **Scheduler** as separate service | Cron trigger logic extracted from worker — separate scaling, smaller images |
| **Shared database package** | `shared/src/db/` eliminates cross-package relative path imports |
| **`bash` tool** replaces `file_*`/`fetch` | Shell commands can do everything the dedicated tools did, less code to maintain |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Pod (worker / backend)                                           │
│                                                                  │
│  ┌──────────────────────────┐   localhost:4001 (TCP)            │
│  │  main container           │◄──────────────────────────┐      │
│  │  (worker / backend)       │  POST /exec               │      │
│  │                           │  { executionId, command,  │      │
│  │  Holds secrets            │    timeout, env }         │      │
│  │  process.env = DB_URL,    │                           │      │
│  │  API keys                 │  ← { stdout, stderr,     │      │
│  └───────────────────────────┘    exitCode, error }      │      │
│                               │                           │      │
│  ┌───────────────────────────┐──┘                           │      │
│  │  sidecar container         │                              │      │
│  │                            │                              │      │
│  │  env: NONE                 │  /var/flow-data (emptyDir)   │      │
│  │  readOnlyRootFilesystem: Y │  ├── exec_abc/              │      │
│  │  USER 1001                 │  │   ├─ home/               │      │
│  │                            │  │   ├─ tmp/                │      │
│  │  ┌──────────────────┐      │  │   ├─ .cache/             │      │
│  │  │  sandbox server    │      │  │   ├─ .config/            │      │
│  │  │  (Node.js)         │      │  │   ├─ .gitconfig          │      │
│  │  └───────┬──────────┘      │  │   └─ id_rsa (injected)    │      │
│  │          │                  │  ├── exec_def/               │      │
│  │          ▼                  │  └── exec_ghi/               │      │
│  │  ┌──────────────────┐      │                              │      │
│  │  │  landlock-helper   │      │                              │      │
│  │  │  (static C binary) │      │                              │      │
│  │  │                    │      │                              │      │
│  │  │  --ro /usr         │      │                              │      │
│  │  │  --ro /bin         │      │                              │      │
│  │  │  --ro /lib         │      │                              │      │
│  │  │  --ro /etc         │      │                              │      │
│  │  │  --rw /var/.../X   │      │                              │      │
│  │  │  -- bash -c '...'  │      │                              │      │
│  │  └──────────────────┘      │                              │      │
│  └───────────────────────────┘                              │      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐
│ Pod: scheduler            │
│                           │
│  Single container         │
│  DB access + BullMQ       │
│  Checks cron every 30s    │
│  Enqueues to flow-executions queue │
└──────────────────────────┘

┌──────────────────────────┐
│ Pod: worker (N replicas)  │
│                           │
│  main + sidecar           │
│  Pulls from queue         │
│  Executes flows           │
│  bash tool → sidecar      │
└──────────────────────────┘
```

---

## New Services

### scheduler/

Separate npm workspace with its own `package.json`, `tsconfig.json`, and `Dockerfile`. Sole responsibility: query DB for flows with cron triggers and enqueue via BullMQ.

```
scheduler/
  package.json
  tsconfig.json
  Dockerfile
  src/
    index.ts            ← entry point (was scheduler-run.ts)
    scheduler.ts        ← Scheduler class (was worker/src/scheduler.ts)
```

**Dependencies** (only what it needs):
- `core-agents-shared` — types (FlowDefinition)
- `bullmq` — enqueue jobs
- `ioredis` — BullMQ Redis client
- `drizzle-orm` + `pg` — DB access (same as shared DB package)

**Does NOT include:**
- No `@anthropic-ai/sdk`, `openai` (LLM providers)
- No `@modelcontextprotocol/sdk` (MCP tools)
- No `FlowExecutor`, `engine.ts`, `runner.ts`
- No `sandbox/`, `tools/`, `providers/`, `rag/`

**Worker changes:** Remove `scheduler-run.ts`, `scheduler.ts`, and the `dev:scheduler` script. Delete `worker/src/scheduler*` entirely.

### sidecar/

Separate npm workspace with its own `package.json`, `tsconfig.json`, and `Dockerfile`. Runs alongside worker/backend containers as a sidecar. The main container never mounts or accesses the sandbox filesystem directly — all communication goes through the sidecar's HTTP API.

```
sidecar/
  package.json
  tsconfig.json
  Dockerfile
  Dockerfile.e2e
  src/
    index.ts            ← Unix socket server
```

**Dependencies:** Zero runtime deps (uses only Node.js built-ins: `http`, `child_process`, `fs`).

**No fallback:** If Landlock is unavailable (binary missing or kernel `ENOSYS`), the sidecar returns HTTP 500. The platform does not execute unsecured commands. The operator must ensure the cluster runs a kernel with Landlock enabled.

**Container image:** Multi-stage build:
1. **Stage 1** (`alpine:3.21`): Install `build-base musl-dev linux-headers`, compile `sidecar/cmd/landlock-helper/main.c → /landlock-helper`
2. **Stage 2** (`node:25-alpine`): Install CLI tools via `apk`, copy landlock-helper, copy sidecar dist, `USER 1001`

**Startup:** `CMD ["node", "dist/index.js", "--ttl-hours=168"]` — TTL passed as CLI argument, not env var. The sidecar container maintains its zero-env-vars guarantee. K8s pod spec can override via `args:`.

**CLI tools in sidecar image:**
```
git, github-cli, gitlab-cli, curl, jq, yq,
python3, py3-pip, make, gcc, g++,
musl-dev, zip, unzip, bash, shadow
```

---

## Database Code Reuse

**Problem:** Worker currently imports `../../backend/src/db/connection.js` and `../../backend/src/db/schema.js` via relative path. Scheduler would need the same. Backend imports `../../../worker/src/executor/engine.js` in the opposite direction. This is a messy two-way dependency.

**Solution:** Move database code into `shared/src/db/` and export from `shared/src/index.ts`.

```
shared/
  src/
    index.ts            ← re-exports everything
    types/
      flow.ts
      endpoints.ts
      ...
    db/
      connection.ts     ← drizzle + pg Pool factory (was backend/src/db/connection.ts)
      schema.ts         ← all table definitions (was backend/src/db/schema.ts)
```

**Changes:**

| Package | Before | After |
|---|---|---|
| `shared/package.json` | No runtime deps | Add `drizzle-orm`, `pg`, `drizzle-kit` as dependencies |
| `shared/tsconfig.json` | types only | Add `src/db/` to include |
| `backend/src/db/connection.ts` | `./schema.js` → `db/schema.js` | Moved to `shared/src/db/connection.ts` |
| `backend/src/db/schema.ts` | standalone | Moved to `shared/src/db/schema.ts` |
| `backend/src/db/migrate.ts` | imports from `./connection.js` | imports from `core-agents-shared` |
| `backend/src/routes/*.ts` | `../db/connection.js` | `core-agents-shared` |
| `worker/src/run.ts` | `../../backend/src/db/connection.js` | `core-agents-shared` |
| `worker/tsconfig.json` | `include: ["src", "../backend/src/db"]` | Removed the backend include |
| `worker/tsconfig.build.json` | no change needed | Works without backend include |
| `scheduler/src/index.ts` | doesn't exist | imports from `core-agents-shared` |

**Benefit:** One source of truth for DB schema. No more relative path imports across packages. Each service creates its own connection from the shared factory.

---

## Tool Set Changes

### Removed (replaced by `bash` or `{{env.*}}`)
| Tool | Replaced by |
|---|---|
| `file_read` | `cat path` in bash |
| `file_write` | `echo 'content' > path` in bash |
| `file_list` | `ls -la` in bash |
| `fetch` | `curl URL` in bash |
| `secret_get` | `{{env.VAR_NAME}}` in templates + `$VAR` in bash. No longer needed — all secrets are injected as env vars. |

### Kept (in-process, structured, no security concern)
| Tool | Reason |
|---|---|
| `store_get/set/delete/list` | In-memory KV store. Structured JSON I/O. No sandbox needed. |
| `now` | Returns structured ISO+unix+formatted JSON. Convenience. |
| `uuid` | Simpler than `uuidgen`. Zero security impact. |
| `log` | Internal logging. |

### Added
| Tool | Description |
|---|---|
| `bash` | Execute shell commands in the sandbox via sidecar |

### Code node moved to sidecar

The existing `code` node type currently runs `new Function('input', code)` in the main Node.js process, bypassing all sandboxing. It is moved to run in the sidecar instead, under Landlock:

```
POST /exec-code
  body: { executionId, code, input }
  → sidecar runs: node -e "const input = JSON.parse(process.argv[1]); <code>" <input>
  → returns { stdout, stderr, exitCode, result }
```

The sidecar's Node.js runtime has no access to `process.env` (zero env vars), no database connections, and is restricted by Landlock to the execution directory. This closes the security gap.

---

## LLM System Prompt

Appended to every LLM Agent node's system prompt when the `bash` tool is injected:

```
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
```

---

## Sandbox Lifecycle (HITL-Aware)

### API

```typescript
// sidecar/src/index.ts — exposed via HTTP on localhost:4001

POST /setup
  body: { executionId: string }
  → creates /var/flow-data/<execId>/{home, tmp, .cache, .config}
  → idempotent (safe for HITL resume)

POST /exec
  body: { executionId, command, timeout?, workdir?, env? }
  → runs landlock-helper → bash, returns { stdout, stderr, exitCode, error }
  → If landlock-helper binary missing or kernel returns ENOSYS/EOPNOTSUPP:
    HTTP 500 { error: "Landlock not available" } — no insecure fallback

POST /teardown
  body: { executionId }
  → kills remaining processes, removes /var/flow-data/<execId>/
```

### States

```
Execution starts
  │
  ├─ sidecar.setup(executionId)  → creates dir
  │
  ├─ Execution runs (N bash tool calls → sidecar.exec)
  │
  ├─ HITL pause? ──Yes──→ DO NOT teardown
  │   │                     │
  │   │                     └─ User approves (days later)
  │   │                       └─ sidecar.setup (no-op, dir exists)
  │   │                         └─ Execution resumes → completes → teardown
  │   │
  │   └─ No ──→ completes → sidecar.teardown
  │
  ├─ Fails? ──→ sidecar.teardown
  │
  └─ Cancelled? ──→ sidecar.teardown
```

### Integration points

| Location | Trigger | Action |
|---|---|---|
| `worker/src/executor/runner.ts` | Execution starts | `sidecar.setup(id)` |
| `worker/src/executor/runner.ts` | Execution completes/fails | `sidecar.teardown(id)` |
| `backend/src/routes/execution.ts` | Debug/manual execution starts | `sidecar.setup(id)` |
| `backend/src/routes/execution.ts` | `HitlPauseError` caught | **Skip teardown**, execution saved as `awaiting_approval` |
| `backend/src/routes/execution.ts` | Debug execution completes/fails | `sidecar.teardown(id)` |
| `backend/src/routes/execution.ts` | Execution cancelled | `sidecar.teardown(id)` |
| **Scheduler** (DB reaper) | Abandoned HITL past TTL | Update DB status to `cancelled`, write audit log |
| **Sidecar** (file reaper) | Orphaned directory past TTL | `rm -rf /var/flow-data/<staleId>/` |

### Reaper for abandoned HITL

Two independent reapers, each handling its own layer:

**1. DB reaper — runs in scheduler**

The scheduler already has DB access and runs continuously. It periodically cleans up abandoned HITL execution records:

```
scheduler/src/reaper.ts

setInterval (every 60 min):
  ├─ Query: executions WHERE status = 'awaiting_approval'
  │         AND updated_at < now() - INTERVAL '$HITL_TTL_HOURS hours'
  │
  ├─ For each expired execution:
  │   ├─ UPDATE status = 'cancelled',
  │   │   error = 'HITL timed out — no approval after $HITL_TTL_HOURS hours'
  │   └─ Audit log entry
  │
  └─ Log: "Cancelled N abandoned HITL executions"
```

The scheduler does NOT call sidecar.teardown() — it has no access to per-pod sidecars. This is acceptable because:

- The execution directory is on a pod-local `emptyDir` — cleaned up when the pod restarts
- The sidecar's own file-based reaper (below) handles stale dirs on long-lived pods

**2. File reaper — runs in sidecar**

The sidecar itself scans its own `/var/flow-data/` periodically and removes directories whose `mtime` exceeds TTL. No DB access needed:

```
sidecar/src/index.ts (background interval)

setInterval (every 30 min):
  ├─ readdir /var/flow-data/
  ├─ For each directory:
  │   ├─ stat(dir).mtime
  │   ├─ if age > $FLOW_DATA_TTL_HOURS hours:
  │   │   └─ rm -rf /var/flow-data/<dir>
  │   └─ else: skip
  └─ Log: "Cleaned up N stale execution directories"
```

This handles edge cases the DB reaper can't: e.g., a HITL-paused execution whose pod never restarted and whose DB record somehow got stuck.

**TTL config:**
- `HITL_TTL_HOURS` (env, default 168 = 7 days) — used by both reapers
- `FLOW_DATA_TTL_HOURS` (env, default 168 = 7 days) — used by sidecar file reaper

---

## Environment Variable Design

### Sidecar container: ZERO env vars

The Pod spec for the sidecar defines **no** environment variables. No `DATABASE_URL`, no `API_KEY`, nothing. The only env vars available in the sandbox are those explicitly sent in the `/exec` request's `env` map.

### Sandbox process: allowlist only

| Variable | Source | Example |
|---|---|---|
| `PATH` | Hardcoded | `/usr/local/bin:/usr/bin:/bin` |
| `HOME` | Set to `<baseDir>/home` | `/var/flow-data/exec_abc/home` |
| `USER` | Hardcoded | `sandbox` |
| `TMPDIR` | Set to `<baseDir>/tmp` | `/var/flow-data/exec_abc/tmp` |
| `SHELL` | Hardcoded | `/bin/bash` |
| `TERM` | Hardcoded | `dumb` |
| `LANG` | Hardcoded | `C.UTF-8` |
| `XDG_CACHE_HOME` | `<baseDir>/.cache` | `/var/flow-data/exec_abc/.cache` |
| `XDG_CONFIG_HOME` | `<baseDir>/.config` | `/var/flow-data/exec_abc/.config` |
| `GIT_CONFIG_GLOBAL` | `<baseDir>/.gitconfig` | `/var/flow-data/exec_abc/.gitconfig` |
| `GIT_SSH_COMMAND` | Wrapped ssh | `ssh -i /path/id_rsa -o StrictHostKeyChecking=no` |
| *User-injected* | Core secrets + CyberArk (fetched at runtime) | `GH_TOKEN`, `GITLAB_TOKEN`, `NPM_TOKEN`, `SSH_PRIVATE_KEY` |

---

## Env Var Injection System

Two separate concepts:

| Concept | What it is | UI |
|---|---|---|
| **Core secrets** | Encrypted values stored in our DB. Created once, reusable. | Existing `/settings/secrets` page |
| **Env var definitions** | A list of env vars per group/flow. Each entry has a name, a type, and a value reference. Resolved at execution start. | New section in flow editor + group settings |

### Custom env vars

The env var name is free-text — users can set any name they want. The reference table below is a helpful guide for the built-in CLI tools, but you are not limited to these names. Use whatever env vars your scripts, tools, and workflows expect.

**Security note (shown as a banner in the env var editor):** Always use the least-privilege token or PAT for the task. A read-only deploy token scoped to a single repository is safer than a full-scope personal access token. Tokens should have the minimum permissions and shortest reasonable expiry.

### CLI tool env var reference

Shown as an info panel in the env var editor so users know what to configure:

| Env var | CLI tool | Purpose |
|---|---|---|
| `GH_TOKEN` / `GITHUB_TOKEN` | `gh` | GitHub authentication |
| `GITLAB_TOKEN` | `glab` | GitLab authentication |
| `NPM_TOKEN` / `NODE_AUTH_TOKEN` | `npm` | npm registry authentication (publish, private packages) |
| `SSH_PRIVATE_KEY` | `git`, `ssh` | SSH-based git operations (written to `id_rsa` in sandbox) |

### Env var definition format

Each env var entry has three fields:

| Field | Description |
|---|---|
| `name` | Env var name, e.g. `GITLAB_TOKEN` |
| `type` | One of: `static`, `core_secret`, `cyberark` |
| `value` | Depends on type (see below) |

Stored as JSONB array:

**Group level** — new `env_vars` column on `group_vault_config`:

```sql
ALTER TABLE group_vault_config ADD COLUMN env_vars jsonb DEFAULT '[]';
```

**Flow level** — new `env_vars` field in `flows.config`:

```json
{
  "envVars": [
    { "name": "GITLAB_TOKEN", "type": "core_secret", "value": "my-gitlab-token" },
    { "name": "NPM_TOKEN", "type": "static", "value": "npm_xxx..." },
    { "name": "DEPLOY_KEY", "type": "cyberark", "value": "/apps/myapp/deploy/key" }
  ]
}
```

### Env var types

**`static`** — plain text value entered directly in the UI. Simple, no indirection.

**`core_secret`** — value references an existing core secret by name. UI shows a dropdown filtered by the level's scope:

| Level | Secrets shown in dropdown |
|---|---|
| App | Only `scope=app` secrets |
| Group | `scope=app` + `scope=group` secrets |
| Flow | `scope=app` + `scope=group` + `scope=flow` secrets |

When resolved, the core secret is decrypted using AES-256-GCM.

**`cyberark`** — value is a CyberArk variable path (e.g. `/apps/myapp/deploy/key`). Fetched live from Conjur at execution start. Only available at group level if a vault is configured, or at flow level if the flow's group has a vault. UI shows a text field with a hint about the CyberArk path format.

### Where env vars are configured

| Level | Storage | Who configures | UI location |
|---|---|---|---|
| **App** | New `app_env_vars` table (singleton row) | Admin | `/settings/secrets` — same page, same scope toggle pattern |
| **Group** | `group_vault_config.env_vars` | Group admin | `/settings/secrets` — same page, filter by group |
| **Flow** | `flows.config.envVars` | Flow author | Flow editor |

<<<<<<< HEAD
### Subflow env var inheritance

Subflows inherit the parent flow's env vars automatically (same execution directory, same `sandboxEnv`). Additionally, a subflow flow definition can define its own `envVars` — these override the parent's values for keys that overlap.

The full override chain:
```
app → group → flow → subflow
```

A flow that is used as a subflow can set env vars just like any other flow. When executed as a subflow, its env vars merge on top of the parent's resolved env vars. The subflow's env vars only apply within that subflow's scope — they don't leak back to the parent.

**UI note:** In the subflow's flow editor env var section, show a hint: *"When used as a subflow, env vars override the parent flow's values with the same name. Leave empty to inherit from the parent."*

### App-level env vars
=======
### UI: Env vars alongside secrets
>>>>>>> bca33d9 (feat: env var management UI — app, group, and flow level)

Env vars follow the **exact same UI pattern** as the secrets page:

- **Scope toggle** at the top: "Secrets" tab / "Environment Variables" tab (or filterable within the same page)
- **App level**: shown when no group is selected (same as app-scoped secrets)
- **Group level**: shown when a specific group is selected (same as group-scoped secrets)
- **List rendering**: each env var shows name, type badge, scope badge, inline edit/delete
- **Create form**: name + type selector (`static` / `core_secret` / `cyberark`) + value/reference field
  - `static`: plain text input
  - `core_secret`: dropdown of available secrets at that scope (reuses existing secret list)
  - `cyberark`: text input for Conjur path (only shown when group has a vault)

The secrets page already has all the infrastructure: group loading, scope filtering, permission checks, form validation. The env var editor component reuses the same patterns.

### Storage

**App level** — new `app_env_vars` table:
```sql
CREATE TABLE app_env_vars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_vars jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp NOT NULL DEFAULT now()
);
```

**Group level** — `group_vault_config.env_vars` JSONB column:
```sql
ALTER TABLE group_vault_config ADD COLUMN env_vars jsonb DEFAULT '[]';
```

**Flow level** — `flows.config.envVars` JSONB field (stored in existing `flows.config`).

### Runtime resolution (at execution start)

```
1. Collect env var definitions:
   ├─ App env_vars (from app_env_vars table)
   ├─ Group env_vars (from group_vault_config for the flow's group)
   └─ Flow env_vars (from flows.config.envVars)

2. For each definition, resolve by type:
   ├─ type=static        → use value as-is
   ├─ type=core_secret   → decrypt core secret by name from DB
   └─ type=cyberark      → fetch from Conjur live

3. Merge: app → group → flow (flow overrides group, group overrides app)
   → Result: single env var map

4. Special handling for SSH_PRIVATE_KEY:
   ├─ Pass the key value in the /exec request body (not as env var)
   ├─ Sidecar writes /var/flow-data/<execId>/id_rsa before spawning bash
   ├─ chmod 600 inside the sandbox
   └─ GIT_SSH_COMMAND env var automatically points to the file path

### Template resolution: {{env.VAR_NAME}}

In addition to the existing `{{secrets.core.NAME}}` and `{{secrets.cyberark.PATH}}` syntax, we add `{{env.VAR_NAME}}` for resolving merged env vars in any template field (system prompts, node inputs, conditions, etc.).

| Template | Resolves to |
|---|---|
| `{{env.GITLAB_TOKEN}}` | Merged value (app → group → flow, most specific wins) |
| `{{env.app.GITLAB_TOKEN}}` | App-level value only |
| `{{env.group.GITLAB_TOKEN}}` | Group-level value only |
| `{{env.flow.GITLAB_TOKEN}}` | Flow-level value only |
| `{{secrets.core.GITLAB_TOKEN}}` | Same merged lookup (searches flow → group → app) |
| `{{secrets.core.app:GITLAB_TOKEN}}` | App-level core secret only |
| `{{secrets.cyberark.PATH}}` | CyberArk secret (fetched live) |

Implementation: the merged env var map is passed to `resolveTemplate()` alongside the existing `getSecret()`/`getCyberArkSecret()` callbacks. The resolver checks `{{env.*}}` patterns against the map, and `{{secrets.*}}` patterns through the existing callbacks. Both syntaxes work everywhere templates are supported.
```

### Same-name override chain

Env vars follow the same app → group → flow chain as secrets:

```
1. App env vars        ← lowest priority (overridden by anything below)
2. Group env vars      ← overrides app
3. Flow env vars       ← overrides app + group (highest priority)
```

For example: a `GITLAB_TOKEN` set at group level is automatically available to all flows in that group. If a specific flow needs a different token, the flow author sets `GITLAB_TOKEN` at flow level — it overrides the group value without changing the group configuration.

### Core secrets and CyberArk template resolution override

When `{{secrets.core.NAME}}` or `{{secrets.cyberark.PATH}}` is used without an explicit scope, the engine follows the override chain:

```
{{secrets.core.GITLAB_TOKEN}}
  → searches: scope=flow first, then scope=group, then scope=app
  → returns the most specific match

{{secrets.cyberark.DEPLOY_KEY}}
  → searches: flow mappings first, then group mappings
  → returns the most specific match (no app-level CyberArk)

{{secrets.core.app:GITLAB_TOKEN}}     ← explicit: only app scope
{{secrets.core.group:GITLAB_TOKEN}}   ← explicit: only group scope
```

Explicit scope syntax (`app:`, `group:`) continues to work for cases where you want to pin to a specific level.

### `secret_get` tool removal

With all secrets available as `{{env.*}}` in templates and `$NAME` in bash, `secret_get` no longer serves a purpose. Removed from auto-injected tools and from `engine.ts`.

---

## Docker Compose (Local Dev + E2E)

### docker-compose.yml changes

Add two new services:

```yaml
scheduler:
  build:
    context: ./scheduler
    dockerfile: Dockerfile
  container_name: core-agents-scheduler
  environment:
    - DATABASE_URL=postgres://coreagents:coreagents@postgres:5432/coreagents
    - VALKEY_HOST=valkey
    - VALKEY_PASSWORD=${VALKEY_PASSWORD:-dev-valkey}
  depends_on:
    postgres:
      condition: service_healthy
    valkey:
      condition: service_started

sidecar:
  build:
    context: ./sidecar
    dockerfile: Dockerfile
  container_name: core-agents-sidecar
  # No env vars — zero secrets
  volumes:
    - flow-data:/var/flow-data
```

Worker and backend get the sidecar as a dependency and share the `flow-data` volume:

```yaml
worker:
  depends_on:
    - valkey
    - sidecar
  volumes:
    - flow-data:/var/flow-data
  environment:
    - SIDECAR_URL=http://sidecar:4001
    - VALKEY_HOST=valkey
    - VALKEY_PASSWORD=${VALKEY_PASSWORD:-dev-valkey}

volumes:
  pgdata:
  qdrant_data:
  flow-data:  # NEW — shared with sidecar
```

For local dev without Docker (directly on host), `SIDECAR_URL` can point to a locally running sidecar process, or a mock.

### docker-compose.e2e.yml changes

Same pattern with `-e2e` suffixed services, but no named volumes — everything ephemeral:

```yaml
sidecar-e2e:
  build:
    context: ./sidecar
    dockerfile: Dockerfile.e2e
  tmpfs: /var/flow-data  # fresh empty dir every start, no persistence
```

Worker-e2e and backend-e2e get `depends_on: sidecar-e2e` and the `/var/flow-data` tmpfs mount.

---

## Helm Chart Updates

### New template: `templates/scheduler.yaml` (replace existing)

Current `scheduler.yaml` uses the worker image with a custom command. Change it to use the dedicated scheduler image:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "core-agents.fullname" . }}-scheduler
  labels:
    {{- include "core-agents.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.scheduler.replicaCount }}
  selector:
    matchLabels:
      app: {{ include "core-agents.fullname" . }}-scheduler
  template:
    metadata:
      labels:
        app: {{ include "core-agents.fullname" . }}-scheduler
    spec:
      containers:
        - name: scheduler
          image: "{{ .Values.image.repository }}-scheduler:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          env:
            - name: VALKEY_HOST
              value: {{ include "core-agents.fullname" . }}-valkey
          envFrom:
            - secretRef:
                name: {{ include "core-agents.fullname" . }}-secret
          resources:
            {{- toYaml .Values.scheduler.resources | nindent 12 }}
```

### Modified: `templates/worker.yaml` — add sidecar

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "core-agents.fullname" . }}-worker
  labels:
    {{- include "core-agents.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.worker.replicaCount }}
  selector:
    matchLabels:
      app: {{ include "core-agents.fullname" . }}-worker
  template:
    metadata:
      labels:
        app: {{ include "core-agents.fullname" . }}-worker
    spec:
      volumes:
        - name: flow-data
          emptyDir: {}
      containers:
        - name: worker
          image: "{{ .Values.image.repository }}-worker:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          env:
            - name: VALKEY_HOST
              value: {{ include "core-agents.fullname" . }}-valkey
            - name: SIDECAR_URL
              value: "http://localhost:4001"
          envFrom:
            - secretRef:
                name: {{ include "core-agents.fullname" . }}-secret
          resources:
            {{- toYaml .Values.worker.resources | nindent 12 }}
        - name: sidecar
          image: "{{ .Values.image.repository }}-sidecar:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: 4001
              name: sidecar
          args: ["--ttl-hours=168"]
          volumeMounts:
            - name: flow-data
              mountPath: /var/flow-data
          securityContext:
            readOnlyRootFilesystem: true
            runAsUser: 1001
            runAsNonRoot: true
            capabilities:
              drop: ["ALL"]
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 256Mi
```

### Modified: `templates/backend.yaml` — add sidecar

Same pattern: add `flow-data` emptyDir volume, sidecar container with `securityContext`, and `SIDECAR_URL` env var on the backend container.

### Modified: `values.yaml` — add image names

```yaml
image:
  repository: ghcr.io/kees/core-agents
  tag: latest
  pullPolicy: IfNotPresent
  # Each service appends its suffix:
  #   -backend, -frontend, -worker, -scheduler, -sidecar
```

Add sidecar resource defaults:

```yaml
sidecar:
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 256Mi
```

---

## Files to Create

| File | Purpose |
|---|---|
| `scheduler/package.json` | npm workspace for scheduler service |
| `scheduler/tsconfig.json` | TypeScript config |
| `scheduler/Dockerfile` | Production image (multi-stage, minimal deps) |
| `scheduler/Dockerfile.e2e` | E2E variant with tsx |
| `scheduler/src/index.ts` | Entry point: DB poll + Scheduler class |
| `scheduler/src/scheduler.ts` | Scheduler class (extracted from worker) |
| `sidecar/package.json` | npm workspace for sidecar service |
| `sidecar/tsconfig.json` | TypeScript config |
| `sidecar/Dockerfile` | Multi-stage: build landlock-helper, then sidecar + CLI tools |
| `sidecar/Dockerfile.e2e` | E2E variant |
| `sidecar/src/index.ts` | HTTP server: /setup, /exec, /teardown |
| `sidecar/cmd/landlock-helper/main.c` | Landlock ruleset + restrict_self + exec |
| `sidecar/cmd/landlock-helper/Makefile` | `cc -static -o helper main.c` |
| `worker/src/sandbox/manager.ts` | `setupSandbox(id)`, `teardownSandbox(id)` |
| `worker/src/sandbox/sidecar-client.ts` | HTTP client to sidecar |
| `worker/src/sandbox/reaper.ts` | HITL TTL reaper (runs in worker process) |
| `worker/src/tools/bash.ts` | Bash tool definition |
| `worker/src/tools/sanitize.ts` | Environment variable allowlist |

---

## Files to Modify

| File | Changes |
|---|---|
| `package.json` | Add `scheduler` and `sidecar` to workspaces array. Add `dev:scheduler` and `dev:sidecar` scripts. |
| `shared/package.json` | Add `drizzle-orm`, `pg`, `drizzle-kit` as dependencies |
| `shared/tsconfig.json` | Add `src/db/` to include |
| `shared/src/index.ts` | Add exports for db connection + schema |
| `shared/src/db/connection.ts` | **Moved from** `backend/src/db/connection.ts`. Factory function: `createDb(url)` returns Drizzle instance. |
| `shared/src/db/schema.ts` | **Moved from** `backend/src/db/schema.ts`. All table definitions. |
| `backend/src/db/connection.ts` | Remove or re-export from shared |
| `backend/src/db/schema.ts` | Remove or re-export from shared |
| `backend/src/routes/*.ts` | Import db/schema from `core-agents-shared` instead of relative paths |
| `backend/src/routes/execution.ts` | Add `sidecar.setup()` on debug start, `sidecar.teardown()` on completion/failure, **skip teardown** on HITL pause |
| `backend/Dockerfile` | Remove CLI tools (moved to sidecar). Keep minimal. |
| `backend/Dockerfile.e2e` | Same |
| `worker/package.json` | Remove `dev:scheduler` script. Remove `scheduler-run.ts` reference. |
| `worker/tsconfig.json` | Remove `include: ["src", "../backend/src/db"]` — no longer needs backend DB files |
| `worker/src/run.ts` | Import from `core-agents-shared` instead of `../../backend/src/db/`. Start reaper on boot. |
| `worker/src/executor/runner.ts` | Wrap execution with sandbox lifecycle (setup/teardown) |
| `worker/src/executor/engine.ts` | Inject `bash` tool. Remove `file_*`/`fetch` injection. Add sandbox CLI list to system prompt. |
| `worker/src/tools/built-in.ts` | Remove `file_*` and `fetch` handlers. Keep `store_*`, `now`, `uuid`, `log`. |
| `worker/Dockerfile` | Remove CLI tools (moved to sidecar). Keep minimal. |
| `worker/Dockerfile.e2e` | Same |
| `shared/src/types/flow.ts` | Add `bash` to auto-injected tool set. Add sandbox system prompt template. |
| `docker-compose.yml` | Add `scheduler` service, `sidecar` service, `flow-data` volume. Wire sidecar to worker + backend. |
| `docker-compose.e2e.yml` | Same pattern with `-e2e` suffix |
| `helm/core-agents/Chart.yaml` | Bump version |
| `helm/core-agents/values.yaml` | Add `sidecar.resources`, update `scheduler` section |
| `helm/core-agents/templates/worker.yaml` | Add sidecar container, flow-data volume, SIDECAR_URL env |
| `helm/core-agents/templates/backend.yaml` | Add sidecar container, flow-data volume, SIDECAR_URL env |
| `helm/core-agents/templates/scheduler.yaml` | Use dedicated scheduler image instead of worker image |

---

## Files to Delete

| File | Reason |
|---|---|
| `worker/src/scheduler.ts` | Moved to `scheduler/src/scheduler.ts` |
| `worker/src/scheduler-run.ts` | Moved to `scheduler/src/index.ts` |

---

## No-Root Guarantee

| Component | User | Capabilities | Rootfs |
|---|---|---|---|
| Worker/backend | `USER node` (UID 1000) | none | writable (app needs to write) |
| Sidecar | `USER 1001` | none, dropped all | `readOnlyRootFilesystem: true` |
| Landlock helper | runs as UID 1001 | none (unprivileged syscalls) | n/a |
| Shared volume | `emptyDir` writable by UID 1001 | n/a | n/a |
| Scheduler | `USER node` (UID 1000) | none | writable |

---

## Image Build Architecture

Each service gets its own image via a naming convention:

```
ghcr.io/kees/core-agents-worker:latest     ← worker/src/
ghcr.io/kees/core-agents-backend:latest    ← backend/src/
ghcr.io/kees/core-agents-frontend:latest   ← frontend/
ghcr.io/kees/core-agents-scheduler:latest  ← scheduler/
ghcr.io/kees/core-agents-sidecar:latest    ← sidecar/
```

Each has its own `Dockerfile` at the service root. The monorepo root `package.json` and `shared/` are COPY'd in during build for workspace resolution.

---

## Admin Page: Pending HITL Executions

A new page for admins to monitor and manage stalled executions.

### Backend

New endpoint: `GET /api/executions?status=awaiting_approval`

Returns paginated list of executions in `awaiting_approval` state with:
- `id`, `flow_id`, `flow_name`
- `created_at`, `updated_at`, elapsed time
- `assigned_user_id`, `assigned_role_id`, `assigned_group_id`
- `hitl_prompt`, `hitl_buttons`
- `action`: link to approve/reject

New action endpoints:
- `POST /api/executions/:id/cancel` — force-cancel a stuck execution (calls `sidecar.teardown(id)` + updates DB)
- `POST /api/executions/:id/approve` — already exists (HITL resume)

### Frontend

New page: `/settings/executions` (or `/admin/executions`)

- Table of `awaiting_approval` executions
- Columns: Flow name, Started, Waiting for (elapsed), Assigned to, Actions (Approve / Cancel)
- Auto-refresh every 30 seconds
- Highlight executions past a warning threshold (e.g., > 24h in yellow, > 72h in red)
- Link to the flow editor or execution detail page

### Files to create/modify

| File | Change |
|---|---|
| `backend/src/routes/execution.ts` | Add `GET /executions?status=` filter. Add `POST /executions/:id/cancel`. |
| `frontend/pages/settings/executions.tsx` | New page: pending HITL executions table |
| `frontend/src/lib/api-client.ts` | Add `getExecutions()`, `cancelExecution()` methods |
| `shared/src/types/flow.ts` | Add `CancelledByAdmin` status variant if needed |

---

## Implementation Order

| Step | Description |
|---|---|
| 1 | `sidecar/cmd/landlock-helper/main.c` + `Makefile` — write and test the C helper |
| 2 | **Move DB to shared:** Move `connection.ts` and `schema.ts` from backend to `shared/src/db/`. Add `drizzle-orm` and `pg` to shared deps. Update all imports across backend, worker. |
| 3 | **Create scheduler workspace:** `scheduler/package.json`, `tsconfig.json`. Copy `scheduler.ts` from worker. Write `src/index.ts`. |
| 4 | **Remove scheduler from worker:** Delete `worker/src/scheduler.ts` and `worker/src/scheduler-run.ts`. Remove `dev:scheduler` from worker package.json. |
| 5 | `sidecar/` — scaffold workspace, package.json, tsconfig |
| 6 | `sidecar/src/index.ts` — HTTP server with /setup, /exec, /teardown |
| 7 | `sidecar/Dockerfile` — multi-stage build (landlock-helper + CLI tools) |
| 8 | `worker/src/tools/sanitize.ts` — env allowlist |
| 9 | `worker/src/sandbox/manager.ts` — execution directory lifecycle |
| 10 | `worker/src/sandbox/sidecar-client.ts` — HTTP client to sidecar |
| 11 | `worker/src/sandbox/reaper.ts` — HITL TTL reaper |
| 12 | `worker/src/tools/bash.ts` — bash tool definition |
| 13 | `shared/src/types/flow.ts` — add bash tool, add sandbox system prompt |
| 14 | `worker/src/tools/built-in.ts` — remove file_* and fetch handlers |
| 15 | `worker/src/executor/engine.ts` — inject bash tool, remove file/fetch tools, add system prompt |
| 16 | `worker/src/executor/runner.ts` — sandbox lifecycle wrapper |
| 17 | `worker/src/run.ts` — import from shared, start reaper |
| 18 | `backend/src/routes/execution.ts` — sandbox lifecycle for debug runs |
| 19 | Dockerfiles — update worker/backend to remove CLI tools (sidecar handles them) |
| 20 | Dockerfiles — scheduler Dockerfile |
| 21 | Scheduler Dockerfile.e2e |
| 22 | Sidecar Dockerfile.e2e |
| 23 | `docker-compose.yml` — add scheduler, sidecar, flow-data volume |
| 24 | `docker-compose.e2e.yml` — same pattern |
| 25 | Helm — new scheduler.yaml, updated worker.yaml + backend.yaml with sidecar |
| 26 | Helm — values.yaml updates |
| 27 | E2E tests — bash tool, sandbox isolation, git, env isolation |
| 28 | Verify: `npm run build`, `npm test`, E2E suite |
