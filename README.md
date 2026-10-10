# Keel

[![CI](https://github.com/sayeediftekhar/Keel/actions/workflows/ci.yml/badge.svg)](https://github.com/sayeediftekhar/Keel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A **routing + governance layer** for Claude Code. Keel doesn't reimplement
skills — it curates a set of external skills, plugins, and MCP servers, keeps
them **unmodified**, and decides when to reach for each one under a single
rigor standard.

See **[HOWTO.md](HOWTO.md)** for the simple per-project/per-session workflow,
**[PLAYBOOK.md](PLAYBOOK.md)** for the operating discipline, **[ARCHITECTURE.md](ARCHITECTURE.md)**
for the model, **[catalog.md](catalog.md)** for the upstreams, and
**[manifest.json](manifest.json)** for the machine map.

> **Keel v3 (alpha):** governance gates that are *enforced* and *proven*, not just
> described: one policy file compiled into Claude Code hooks, deny rules,
> CODEOWNERS, CI and a GitHub ruleset, plus `keel doctor`. See
> [plugin/README.md](plugin/README.md) and [docs/v3/](docs/v3/).

## The three layers

- **L1 — Arbiter:** [`keel-v2`](skills/keel-v2/) — the rigor router (nine danger
  surfaces, FAST vs HEAVY). Everything defers to it.
- **L2 — Lane routers:** thin index skills, one per domain, that dispatch to L3.
- **L3 — Upstreams:** the external skills/plugins/MCP servers, vendored as-is.

## Skills in this repo

| Skill | Role | Routes to |
|-------|------|-----------|
| [`keel-v2`](skills/keel-v2/) | **Arbiter** — rigor router, the spine | — |
| [`keel-dev`](skills/keel-dev/) | Development lane | mattpocock-skills (spine), vercel, sentry, hyperframes, antfu/skills, agent-browser, keel-qa |
| [`keel-design`](skills/keel-design/) | Design/UI lane | impeccable, frontend-design, fused-landing |
| [`keel-marketing`](skills/keel-marketing/) | Marketing lane | marketingskills, claude-seo, kondo |
| [`keel-content`](skills/keel-content/) | Content/social lane | humanizer, social-media-skills, higgsfield |
| [`keel-research`](skills/keel-research/) | Research lane | notebooklm-skill, perplexity, ai-second-brain |
| [`keel-secure`](skills/keel-secure/) | Security lane + gate | VibeSec-Skill |
| [`keel-ops`](skills/keel-ops/) | Memory/connectors/meta | claude-mem, granola, slack, notion, zapier, find-skills, claude-skills |
| [`keel-finance`](skills/keel-finance/) | Finance vertical *(optional)* | financial-services |
| [`keel-legal`](skills/keel-legal/) | Legal vertical *(optional)* | claude-for-legal |
| [`fused-landing`](skills/fused-landing/) | Landing-page build + token discipline | *(local)* |
| [`lazy-loop`](skills/lazy-loop/) | `/lazy` code/prose thrift (caveman + ponytail) | *(local)* |
| [`keel-qa`](skills/keel-qa/) | Real-browser QA procedure (Phase 6) | *(local)* |
| [`keel-verify`](skills/keel-verify/) | Evidence-before-done: run it, show the output, then claim it | *(local)* |

## Install (in a consuming project)

Keel lives at **`.claude/keel/`** as a git submodule. That is the one supported
layout. Claude Code discovers project skills only at
`.claude/skills/<name>/SKILL.md`, so the installer **symlinks** each lane
router, local skill and vendored skill to that exact depth.

```bash
git submodule add https://github.com/sayeediftekhar/Keel .claude/keel
git submodule update --init --recursive
(cd .claude/keel && ./install.sh arbiter)      # keel-v2 router + LAWS → CLAUDE.md (managed block)
(cd .claude/keel && ./install.sh dev design)   # vendor + link only the lanes you use
(cd .claude/keel && ./install.sh check)        # verify; then /skills in a fresh session
```

Lanes are opt-in. Nothing installs until you name one.

```bash
./install.sh                 # list lanes + what each pulls (with pins)
./install.sh all             # every non-optional lane
./install.sh hyperframes     # one parked upstream by name
./install.sh mcp             # scaffold .mcp.json from the template
```

- **skills** → cloned into `vendor/` at the pinned commit (unmodified) and
  symlinked into `.claude/skills/`.
- **plugins** → the installer prints the exact `claude plugin install` command.
- **MCP servers** → fill credentials in `.mcp.json` (copy from `.mcp.json.template`).

Curate, don't hoard: every installed skill's description sits in context each
session — install only the lanes you use. Update with
`git submodule update --remote .claude/keel`, then re-run the install lines.

## Editing

Work in this repo, commit, push. Consuming projects pick up changes via
`git submodule update --remote`.

## Security

Keel is a pack of **agent instructions** that other people run. Treat every change
as security-relevant: a malicious edit to a `SKILL.md`, `CLAUDE.md`, or
`install.sh` could inject instructions into a downstream agent. All changes land
via reviewed PRs on a protected `main`; upstreams are referenced, never modified.
See [SECURITY.md](SECURITY.md) for the threat model and how to report a
vulnerability (privately — not via a public issue).

## Contributing

Route, don't merge; keep the arbiter lean; PR through review. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Sayeed Iftekhar. Keel routes to third-party upstreams that keep
their own licenses; it does not redistribute them.
