I'm building a sandboxed tool execution system for an LLM agent platform (Node.js/TypeScript, Express/Next.js, PostgreSQL), and I need advice on achieving OS-level process isolation in a constrained Kubernetes environment.

## Context

- **Runtime:** Node.js 25 in Docker containers on Kubernetes
- **Constraint:** Containers run as non-root (`USER node`), cannot add capabilities (`CAP_SYS_ADMIN`, etc.), and cannot modify the default seccomp profile. No root access at runtime.
- **Goal:** When a flow execution starts, I want every bash command run by an LLM agent to be sandboxed such that it:
  - Can only write to its own per-execution directory (e.g., `/var/data/exec_123/`)
  - Can read but not modify system binaries (`/usr/bin/git`, `/usr/bin/gh`, etc.)
  - Cannot read/write other executions' directories
  - Cannot read app secrets (DB URLs, API keys — these are in `process.env`)
  - Can still access the network (git clone, curl, etc.)
- **Scale:** Not high-throughput — maybe 5-20 concurrent executions per pod

## What I've considered and why each has issues

1. **OS users per execution (`useradd`/`sudo -u`):** Requires root inside container — not available.
2. **Bubblewrap (user namespaces):** Requires `--security-opt seccomp=unconfined` or `--cap-add SYS_ADMIN` in Docker because default seccomp blocks `clone()` with namespace flags. We likely can't change these in our K8s cluster.
3. **Kubernetes Job per execution:** Would work but adds significant complexity (startup latency, orchestration, state passing). I'd prefer an in-process solution first.
4. **Landlock LSM (Linux 5.13+):** This looks promising — unprivileged processes can restrict their own filesystem access. But I'm unsure about:
   - How commonly `CONFIG_SECURITY_LANDLOCK=y` is enabled on K8s node kernels
   - Whether the `landlock` npm package (v0.0.1, 30 stars) is production-ready
   - How Landlock interacts with container filesystem mounts (overlayfs, etc.)

5. **Seccomp-only approach:** Could I write a custom seccomp filter that restricts file writes to a specific directory path? I've heard this is extremely difficult because seccomp operates on syscall args, not paths.

6. **LSM BPF (BPF-based security):** Would need `CAP_BPF` which we likely don't have.

## What I'm looking for

I need practical, production-tested approaches for **unprivileged filesystem sandboxing inside a Kubernetes container** that satisfy:

- **Strong filesystem isolation** — processes cannot escape their designated directory
- **Read access to system binaries** — tools like `git`, `gh`, `python3` must be usable
- **Network access** — no network restriction needed
- **No root / no special K8s security context** — must work with a standard restricted Pod Security Standard (Restricted profile)
- **Runs in Alpine Linux** (or Debian-slim — can switch base image if needed)
- **Low overhead** — must be fast enough to invoke per-command (not just per-execution)

## Specific questions

1. For Landlock:
   - How do I check at runtime if the kernel supports it (`/sys/kernel/security/lsm`)?
   - Can I use it from Node.js without a native addon (via `fs.open()` with special flags, or a tiny C helper that I compile)?
   - Is there a production-grade wrapper, or should I write a small setuid/position-independent C binary that applies Landlock rules and then exec's the target command?
   - Will Landlock rules apply correctly inside a Docker container with overlayfs mounts?

2. Are there any **other Linux kernel features** I'm missing that allow unprivileged filesystem access control? (e.g., `openat2()` with `RESOLVE_*` flags, `io_uring` with restrictions, etc.)

3. Are there **existing open-source projects** that solve this exact problem (unprivileged per-execution sandbox for LLM agent tools)? I'm aware of:
   - OpenAI's sandbox (uses Firecracker microVMs — too heavy for us)
   - E2B.dev (cloud-based — not self-hosted)
   - Modal.com (proprietary)
   - gVisor (needs `ptrace` capability or KVM — not available without root)
   Anything simpler that runs in-process?

4. Would you recommend a **different architecture entirely** for this use case on K8s? For example:
   - Running a sidecar container per pod with a restrictive security context that the main container delegates sandboxed work to via Unix socket?
   - Using a DaemonSet that exposes a sandboxing API over Unix sockets (so the sandboxing runs outside the constrained container)?

5. If no kernel-level solution is practical in our constrained environment, what's the **best defense-in-depth approach** using application-level isolation (chroot-like path enforcement, dropped environment variables, process group isolation, resource limits)?

## Environment details

- Base image: `node:25-alpine` (can switch to `node:25-slim` or `debian:bookworm-slim` if needed)
- Orchestration: Kubernetes 1.28+, restricted Pod Security Standards
- Kernel: Likely 5.15+ (varies by node image provider — GKE, EKS, AKS)
- Runtime: containerd
- The platform is an internal tool, not a public SaaS — the threat model is accidental data leakage between executions of different flows, not a determined attacker.
