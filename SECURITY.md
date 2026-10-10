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
| **Supply-chain (upstreams)** | An upstream Keel routes to is compromised | Keel **references** upstreams, never vendors modified copies. Every git upstream is **pinned to a commit** in `manifest.json` (`ref`); `install.sh` checks that commit out and never floats to HEAD. Pins move only via `./install.sh pin` in a reviewed PR, with the moved upstream's diff read. Marketplace plugins (the Pocock spine) self-update; their names are drift-checked by `evals/upstream-drift.sh`. MCP servers run from `npx -y` packages — pin their versions in your `.mcp.json` too |
| **Secret leakage** | Real credentials committed instead of the template | `.mcp.json` is gitignored; only `.mcp.json.template` is tracked; CI secret-scan fails the build on obvious key material |

## Keel v3 gate code (`plugin/`)

The v3 plugin ships **executable enforcement**: Claude Code hooks that run on
every Bash, file-edit and selected MCP tool call in a consuming project, plus a
CLI that writes CI and GitHub settings. Additional rules for this code:

- **Fail closed.** A gate that errors, times out, or can't read its policy
  blocks. Every gate hook declares `onFailure: "block"`; CI verifies it.
- **No network in hooks.** Gate decisions use local files and local git only.
- **No admin credentials.** `keel compile` and `keel doctor` never need admin
  rights; they print the GitHub ruleset for a repo admin to apply.
- **Known limit, stated plainly.** Hooks match command text; a program that
  performs an action itself is invisible to them. The GitHub ruleset and
  database credentials are the hard layers (see `plugin/README.md`).
- A bypass of a gate that the docs claim it stops is a **security
  vulnerability** — report it privately as below.

## What Keel does and does not do

- **Does not** execute arbitrary code on install beyond `git clone` of the
  upstreams you explicitly name. Nothing installs until you name a lane.
- **Does** write, when run as a submodule, idempotent entries to the host
  project's `.gitignore` / `.graphifyignore`, `Read(...)` deny rules in
  `.claude/settings.json`, relative symlinks under `.claude/skills/`, and (on
  `install.sh arbiter`) a marker-delimited block in `CLAUDE.md`. All additive
  and reversible.
- Skills are **instructions** interpreted by *your* agent under *your* human
  gates — Keel's own `keel-v2` arbiter stops before commit/deploy/send.

## For maintainers — keeping `main` trustworthy

1. Enable **branch protection** on `main`: require a pull request, require review,
   disallow force-push and direct pushes.
2. Enable **Private Vulnerability Reporting** (Settings → Security).
3. Never auto-merge. Read every diff to a `SKILL.md` / `CLAUDE.md` / `install.sh`
   as executable instructions, not documentation.
4. Refresh pins deliberately: `./install.sh pin`, read what each moved upstream changed, then PR. A pin bump is a code review of someone else's repo.
