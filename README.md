# Keel

[![CI](https://github.com/sayeediftekhar/Keel/actions/workflows/ci.yml/badge.svg)](https://github.com/sayeediftekhar/Keel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A **routing + governance layer** for Claude Code, shipped as one plugin. Keel
doesn't reimplement skills — it curates a set of external skills, plugins, and
MCP servers, keeps them **unmodified**, decides when to reach for each one
under a single rigor standard, and enforces the gates that standard needs.

```
/plugin install keel --marketplace sayeediftekhar/Keel   # once per machine
keel init && keel compile                                # per project; then keel doctor
```

See **[HOWTO.md](HOWTO.md)** for the simple per-project/per-session workflow,
**[PLAYBOOK.md](PLAYBOOK.md)** for the operating discipline, **[ARCHITECTURE.md](ARCHITECTURE.md)**
for the model, **[catalog.md](catalog.md)** for the upstreams, and
**[manifest.json](manifest.json)** for the machine map.

> **Keel v3 (alpha):** governance gates that are *enforced* and *proven*, not just
> described: one policy file compiled into Claude Code hooks, deny rules,
> CODEOWNERS, CI and a GitHub ruleset, plus `keel doctor`. See
> [plugin/README.md](plugin/README.md), the usage guide
> [docs/v3/GUIDE.md](docs/v3/GUIDE.md), and how Keel fits with Claude Code's own
> harness: [docs/v3/HARNESS-OVERLAP.md](docs/v3/HARNESS-OVERLAP.md).

## The three layers

- **L1 — Arbiter:** [`keel-v2`](skills/keel-v2/) — the rigor router (eleven danger
  surfaces, FAST vs HEAVY). Everything defers to it.
- **L2 — Lane routers:** thin index skills, one per domain, that dispatch to L3.
- **L3 — Upstreams:** the external skills/plugins/MCP servers, vendored as-is.

## Skills in this repo

| Skill | Role | Routes to |
|-------|------|-----------|
| [`keel-v2`](skills/keel-v2/) | **Arbiter** — rigor router, the spine. Tier 1 always on in `CLAUDE.md`; the full rules (surface definitions, invariants' layers, tripwires) load on demand as this skill | — |
| [`doc-sync`](skills/doc-sync/) | Drain `CONTEXT.md` / `LEARNINGS.md` (lesson · history · state), check numeric budgets, hand off before the window degrades (lean-context, D20c) | *(local)* |
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
| [`keel-setup`](skills/keel-setup/) | In-session `keel init` → policy → `keel compile` → ruleset → `keel doctor` walkthrough | *(local)* |

With the plugin installed every skill is namespaced: `/keel:keel-dev`,
`/keel:keel-design`, …. `keel init` writes Keel's Tier-1 router into
`CLAUDE.md` (~55 lines, within lean-context's ~80-line / ~1.5k-token budget);
`keel-v2` and `doc-sync` are model-invoked, so they load when a task needs
them. Keel also carries builder-stack's architecture layer: the seven-rung
[Systems Thinking framework](docs/SYSTEMS_THINKING_FRAMEWORK.md), and
`keel init` scaffolds `docs/ARCHITECTURE.md`, `LAWS.md` and `LEARNINGS.md`
(D3, applied by D20).

## Install (in a consuming project)

**Plugin (the default).** Once per machine:

```
/plugin install keel --marketplace sayeediftekhar/Keel
```

Then, per project (`keel` = `node <plugin>/plugin/bin/keel.mjs`; `/plugin`
shows the directory):

```bash
keel init       # keel.policy.json + Tier-1 rules and standing authorization in CLAUDE.md + CONTEXT/GLOSSARY/CODING_STANDARDS/DESIGN/LAWS/LEARNINGS/docs/.scratch
keel compile    # lock, deny rules, CODEOWNERS, CI workflow, GitHub ruleset — one PR, merge it yourself
keel doctor     # prove every gate blocks
```

Full walkthrough: [docs/v3/GUIDE.md](docs/v3/GUIDE.md) (GitHub App identity,
ruleset, day to day). Lanes arrive with the plugin as `/keel:<lane>`; their
upstreams are still opt-in: `./install.sh <lane>` from the plugin directory
prints the pinned install for each one.

**Submodule layout (still supported).** Keel at **`.claude/keel/`** as a git
submodule; the installer **symlinks** each lane router, local skill and
vendored skill to `.claude/skills/<name>/SKILL.md`, the only depth Claude
Code discovers.

```bash
git submodule add https://github.com/sayeediftekhar/Keel .claude/keel
git submodule update --init --recursive
(cd .claude/keel && ./install.sh arbiter)      # keel-v2 router + LAWS → CLAUDE.md (the full block; the plugin's keel init writes Tier 1 only)
(cd .claude/keel && ./install.sh dev design)   # vendor + link only the lanes you use
(cd .claude/keel && ./install.sh check)        # verify; then /skills in a fresh session
node .claude/keel/plugin/bin/keel.mjs init     # the gates work the same way from here
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
