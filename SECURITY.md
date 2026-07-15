# Security Policy

Keel is a pack of **agent instructions and an installer** that other people run
inside their own AI coding agents. That makes almost every change
security-relevant: a malicious edit to a `SKILL.md`, `CLAUDE.md`, or `install.sh`
could inject instructions or code into a downstream user's agent. This policy
describes the threat model and how to report a problem.

## Reporting a vulnerability

**Do not open a public issue for a security problem.** Use GitHub's private
reporting: the repo's **Security → Report a vulnerability** tab (Private
Vulnerability Reporting). Include what you found, how to reproduce it, and the
impact. You'll get an acknowledgement and a fix or mitigation timeline.

## Threat model — what "injection" means here

Because the repo is public, anyone can **read, fork, and open pull requests** —
that is normal and expected. What must be protected is that **nothing reaches
`main` without maintainer review**, and that the code others run is what the
maintainers intend.

Primary risks and the controls against them:

| Risk | Vector | Control |
|------|--------|---------|
| **Instruction injection** | A PR embeds hidden directives in a `SKILL.md` / `CLAUDE.md` (e.g. "exfiltrate secrets", "ignore the human gate") that later run in a user's agent | Branch protection on `main` (no direct pushes, required review); `CODEOWNERS` review; reviewers read instruction files as *code*, not prose |
| **Installer tampering** | A PR alters `install.sh` to run arbitrary commands or clone a malicious repo | Same review gate; CI runs `bash -n` + the install regression eval on every PR |
| **Supply-chain (upstreams)** | An upstream Keel routes to is compromised | Keel **references** upstreams, never vendors modified copies; pin to tags/commits where possible; users review what `install.sh` pulls |
| **Secret leakage** | Real credentials committed instead of the template | `.mcp.json` is gitignored; only `.mcp.json.template` is tracked; CI secret-scan fails the build on obvious key material |

## What Keel does and does not do

- **Does not** execute arbitrary code on install beyond `git clone` of the
  upstreams you explicitly name. Nothing installs until you name a lane.
- **Does** write, when run as a submodule, idempotent marker-delimited blocks to
  the host project's ignore files (and, on `install.sh arbiter`, its `CLAUDE.md`).
  These are additive and reversible.
- Skills are **instructions** interpreted by *your* agent under *your* human
  gates — Keel's own `keel-v2` arbiter stops before commit/deploy/send.

## For maintainers — keeping `main` trustworthy

1. Enable **branch protection** on `main`: require a pull request, require review,
   disallow force-push and direct pushes.
2. Enable **Private Vulnerability Reporting** (Settings → Security).
3. Never auto-merge. Read every diff to a `SKILL.md` / `CLAUDE.md` / `install.sh`
   as executable instructions, not documentation.
4. Keep upstream references pinned and review changes to them.
