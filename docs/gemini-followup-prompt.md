Thanks for the detailed answer. I've distilled it into a concrete plan. A few follow-up questions before I start implementing:

## 1. Landlock availability on managed Kubernetes

How common is `CONFIG_SECURITY_LANDLOCK=y` on real-world managed K8s node images? Specifically:

- **GKE** (Container-Optimized OS / cos)
- **EKS** (Amazon Linux 2 / Bottlerocket / AL2023)
- **AKS** (Ubuntu / Azure Linux / Mariner)
- **kOps** on Ubuntu / Debian

Is there a known list or a way to probe this across clusters? I need to know whether the Landlock approach will work for >80% of clusters or if it's a niche feature. If it's unreliable, I might invest in the sidecar approach more heavily instead.

## 2. landstrip on Alpine

Does `landstrip` support Alpine Linux with musl libc? I see it's written in Rust — does it produce a fully static binary that I can drop into a `node:25-alpine` container (which has no glibc)? Or would I need to compile it against musl target?

If landstrip doesn't work on Alpine, is there a simpler alternative — maybe a 50-line C program using `linux/landlock.h` that I can compile statically with musl-gcc in a multi-stage Docker build?

## 3. The /tmp problem

Our bash tool needs to run commands like `git clone`, which writes temp files to `/tmp`. With Landlock I can make `/tmp` read-write, but then all executions share it and could interfere with each other.

Without namespace creation (blocked by seccomp), I can't mount a private tmpfs per execution. Options I see:
- Set `TMPDIR=/var/flow-data/<execId>/tmp` for each execution — would git and most tools respect this?
- Use `--bind` with Landlock to redirect `/tmp` to the execution's private tmp dir? (I don't think Landlock has mount/redirect capabilities)
- Something else?

## 4. @agentsh/secure-sandbox graceful degradation

Can you elaborate on how `@agentsh/secure-sandbox` handles graceful degradation? Specifically:
- When Landlock is unavailable, what does it fall back to?
- Does it work in Node.js 25 / Alpine?
- Is it production-ready or experimental?

## 5. Git's filesystem access patterns

Beyond `/tmp`, git also needs to:
- Create/delete files in the working directory (`.git/objects/`, etc.)
- Maybe access `~/.gitconfig` and `~/.ssh/known_hosts`
- Maybe access `~/.ssh/id_*` for authenticated clones

If we're using Landlock with read-write only on the execution directory:
- `~/.gitconfig` would be unreadable — is there an env var (`GIT_CONFIG_GLOBAL`) to point it elsewhere?
- SSH keys for auth — should we inject them via `GIT_SSH_COMMAND` pointing to a wrapped ssh that uses a specific key?

This is a general question about making CLI tools work correctly when their usual dotfiles and caches are inaccessible.
