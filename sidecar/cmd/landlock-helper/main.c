#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <sys/syscall.h>
#include <sys/prctl.h>

/*
 * Fallback __NR_* definitions for architectures whose kernel headers
 * predate Landlock (5.13).  These are the upstream x86_64 / aarch64 /
 * riscv64 numbers; other archs will need their own entry.
 */
#ifndef __NR_landlock_create_ruleset
# if defined __x86_64__
#  define __NR_landlock_create_ruleset 444
# elif defined __aarch64__
#  define __NR_landlock_create_ruleset 444
# elif defined __riscv
#  define __NR_landlock_create_ruleset 444
# else
#  error "Define __NR_landlock_create_ruleset for your architecture"
# endif
#endif

#ifndef __NR_landlock_add_rule
# if defined __x86_64__
#  define __NR_landlock_add_rule 445
# elif defined __aarch64__
#  define __NR_landlock_add_rule 445
# elif defined __riscv
#  define __NR_landlock_add_rule 445
# else
#  error "Define __NR_landlock_add_rule for your architecture"
# endif
#endif

#ifndef __NR_landlock_restrict_self
# if defined __x86_64__
#  define __NR_landlock_restrict_self 446
# elif defined __aarch64__
#  define __NR_landlock_restrict_self 446
# elif defined __riscv
#  define __NR_landlock_restrict_self 446
# else
#  error "Define __NR_landlock_restrict_self for your architecture"
# endif
#endif

/* ABI 3 (kernel 6.2) added LANDLOCK_ACCESS_FS_TRUNCATE */
#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
# define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif

/* ── helpers ──────────────────────────────────────────────────── */

static void die_errno(const char *msg) {
    fprintf(stderr, "error: %s: %s\n", msg, strerror(errno));
    exit(1);
}

/* ── Landlock ABI & access masks ──────────────────────────────── */

static int get_abi(void) {
    int abi = syscall(__NR_landlock_create_ruleset, NULL, 0,
                      LANDLOCK_CREATE_RULESET_VERSION);
    if (abi < 0) {
        if (errno == ENOSYS)
            die_errno("Landlock not supported – kernel too old or "
                      "CONFIG_SECURITY_LANDLOCK not set");
        if (errno == EOPNOTSUPP)
            die_errno("Landlock not supported – missing "
                      "security=landlock boot parameter");
        die_errno("landlock_create_ruleset(ABI)");
    }
    return abi;
}

/* Every FS access right the kernel knows about for the given ABI. */
static __u64 all_fs_access(int abi) {
    __u64 a = LANDLOCK_ACCESS_FS_EXECUTE
            | LANDLOCK_ACCESS_FS_WRITE_FILE
            | LANDLOCK_ACCESS_FS_READ_FILE
            | LANDLOCK_ACCESS_FS_READ_DIR
            | LANDLOCK_ACCESS_FS_REMOVE_DIR
            | LANDLOCK_ACCESS_FS_REMOVE_FILE
            | LANDLOCK_ACCESS_FS_MAKE_CHAR
            | LANDLOCK_ACCESS_FS_MAKE_DIR
            | LANDLOCK_ACCESS_FS_MAKE_REG
            | LANDLOCK_ACCESS_FS_MAKE_SOCK
            | LANDLOCK_ACCESS_FS_MAKE_FIFO
            | LANDLOCK_ACCESS_FS_MAKE_BLOCK
            | LANDLOCK_ACCESS_FS_MAKE_SYM;
    if (abi >= 2)
        a |= LANDLOCK_ACCESS_FS_REFER;
    if (abi >= 3)
        a |= LANDLOCK_ACCESS_FS_TRUNCATE;
    return a;
}

static __u64 ro_access(int abi) {
    (void)abi;
    return LANDLOCK_ACCESS_FS_READ_FILE
         | LANDLOCK_ACCESS_FS_READ_DIR
         | LANDLOCK_ACCESS_FS_EXECUTE;
}

static __u64 rw_access(int abi) {
    __u64 a = LANDLOCK_ACCESS_FS_READ_FILE
            | LANDLOCK_ACCESS_FS_READ_DIR
            | LANDLOCK_ACCESS_FS_EXECUTE
            | LANDLOCK_ACCESS_FS_WRITE_FILE
            | LANDLOCK_ACCESS_FS_REMOVE_FILE
            | LANDLOCK_ACCESS_FS_REMOVE_DIR
            | LANDLOCK_ACCESS_FS_MAKE_DIR
            | LANDLOCK_ACCESS_FS_MAKE_REG
            | LANDLOCK_ACCESS_FS_MAKE_SYM;
    if (abi >= 3)
        a |= LANDLOCK_ACCESS_FS_TRUNCATE;
    return a;
}

/* ── ruleset management ──────────────────────────────────────── */

static int make_ruleset(__u64 handled) {
    struct landlock_ruleset_attr attr = { .handled_access_fs = handled };
    int fd = syscall(__NR_landlock_create_ruleset, &attr, sizeof(attr), 0);
    if (fd < 0)
        die_errno("landlock_create_ruleset");
    return fd;
}

static void add_rule(int ruleset_fd, const char *path, __u64 access) {
    int pfd = open(path, O_PATH | O_CLOEXEC);
    if (pfd < 0) {
        fprintf(stderr, "error: cannot open path '%s': %s\n",
                path, strerror(errno));
        exit(1);
    }
    struct landlock_path_beneath_attr attr = {
        .allowed_access = access,
        .parent_fd      = pfd,
    };
    if (syscall(__NR_landlock_add_rule, ruleset_fd,
                LANDLOCK_RULE_PATH_BENEATH, &attr, 0)) {
        fprintf(stderr, "error: add_rule for '%s': %s\n",
                path, strerror(errno));
        exit(1);
    }
    close(pfd);
}

static void restrict_self(int ruleset_fd) {
    /* Landlock requires no_new_privs before restrict_self.
     * Without it, the kernel requires CAP_SYS_ADMIN. */
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0))
        die_errno("prctl(PR_SET_NO_NEW_PRIVS)");
    if (syscall(__NR_landlock_restrict_self, ruleset_fd, 0))
        die_errno("landlock_restrict_self");
    close(ruleset_fd);
}

/* ── argument list helper ────────────────────────────────────── */

static char **append(char **list, int *count, const char *val) {
    int n = *count;
    char **p = realloc(list, (size_t)(n + 2) * sizeof(*p));
    if (!p) {
        fprintf(stderr, "error: out of memory\n");
        exit(1);
    }
    p[n] = strdup(val);
    if (!p[n]) {
        fprintf(stderr, "error: out of memory\n");
        exit(1);
    }
    p[n + 1] = NULL;
    *count = n + 1;
    return p;
}

/* ── entry point ─────────────────────────────────────────────── */

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr,
            "usage: %s --ro <path>... --rw <path>... -- <command> [args...]\n"
            "\n"
            "Sets up Landlock filesystem sandboxing and executes <command>.\n"
            "  --ro <path>   grant read-only access (read, list, execute)\n"
            "  --rw <path>   grant read-write access "
            "(read, write, create, remove, truncate, execute)\n"
            "  --            separator before the command to run\n"
            "  --probe       probe Landlock availability and exit\n",
            argv[0]);
        return 1;
    }

    /* --probe mode: check Landlock is actually usable, not just detected */
    if (argc == 2 && strcmp(argv[1], "--probe") == 0) {
        int abi = get_abi();
        if (abi <= 0) {
            fprintf(stderr, "Landlock ABI not detected\n");
            return 1;
        }
        printf("Landlock ABI version %d detected\n", abi);
        /* Verify we can create a ruleset (but DON'T call restrict_self — that would
         * consume the unprivileged Landlock usage, causing subsequent exec calls to
         * fail without CAP_SYS_ADMIN). landlock_create_ruleset is the best we can do
         * without permanently locking the process. */
        struct landlock_ruleset_attr attr = { .handled_access_fs = all_fs_access(abi) };
        int ruleset_fd = syscall(__NR_landlock_create_ruleset, &attr, sizeof(attr), 0);
        if (ruleset_fd < 0) {
            fprintf(stderr, "landlock_create_ruleset failed: %s\n", strerror(errno));
            return 1;
        }
        close(ruleset_fd);
        printf("Landlock ruleset creation: OK\n");
        printf("NOTE: restrict_self will be tested during first exec\n");
        return 0;
    }

    char **ro_paths = NULL;
    int    ro_count = 0;
    char **rw_paths = NULL;
    int    rw_count = 0;
    char **cmd_argv = NULL;
    int    cmd_count = 0;

    int seen_ddash = 0;

    for (int i = 1; i < argc; i++) {
        if (!seen_ddash && strcmp(argv[i], "--") == 0) {
            seen_ddash = 1;
            continue;
        }
        if (!seen_ddash && strcmp(argv[i], "--ro") == 0) {
            if (++i >= argc) {
                fprintf(stderr, "error: --ro requires a path argument\n");
                return 1;
            }
            ro_paths = append(ro_paths, &ro_count, argv[i]);
            continue;
        }
        if (!seen_ddash && strcmp(argv[i], "--rw") == 0) {
            if (++i >= argc) {
                fprintf(stderr, "error: --rw requires a path argument\n");
                return 1;
            }
            rw_paths = append(rw_paths, &rw_count, argv[i]);
            continue;
        }
        /* everything else (including unknown flags before --) goes to cmd */
        cmd_argv = append(cmd_argv, &cmd_count, argv[i]);
    }

    if (cmd_count == 0) {
        fprintf(stderr, "error: no command specified after '--'\n");
        return 1;
    }

    /* ── probe Landlock ABI ─────────────────────────────────── */
    int abi = get_abi();

    /* ── create ruleset handling every right the kernel knows ─ */
    int ruleset_fd = make_ruleset(all_fs_access(abi));

    /* ── add read-only path rules ───────────────────────────── */
    for (int i = 0; i < ro_count; i++)
        add_rule(ruleset_fd, ro_paths[i], ro_access(abi));

    /* ── add read-write path rules ──────────────────────────── */
    for (int i = 0; i < rw_count; i++)
        add_rule(ruleset_fd, rw_paths[i], rw_access(abi));

    /* ── lock the sandbox ───────────────────────────────────── */
    restrict_self(ruleset_fd);

    /* ── execute the target command ─────────────────────────── */
    execvp(cmd_argv[0], cmd_argv);
    fprintf(stderr, "error: execvp '%s': %s\n", cmd_argv[0], strerror(errno));
    return 1;
}
