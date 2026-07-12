# Keel

A **routing + governance layer** for Claude Code. Keel doesn't reimplement
skills — it curates a set of external skills, plugins, and MCP servers, keeps
them **unmodified**, and decides when to reach for each one under a single
rigor standard.

See **[HOWTO.md](HOWTO.md)** for the simple per-project/per-session workflow,
**[PLAYBOOK.md](PLAYBOOK.md)** for the operating discipline, **[ARCHITECTURE.md](ARCHITECTURE.md)**
for the model, **[catalog.md](catalog.md)** for the upstreams, and
**[manifest.json](manifest.json)** for the machine map.

## The three layers

- **L1 — Arbiter:** [`keel-v2`](skills/keel-v2/) — the rigor router (nine danger
  surfaces, FAST vs HEAVY). Everything defers to it.
- **L2 — Lane routers:** thin index skills, one per domain, that dispatch to L3.
- **L3 — Upstreams:** the external skills/plugins/MCP servers, vendored as-is.

## Skills in this repo

| Skill | Role | Routes to |
|-------|------|-----------|
| [`keel-v2`](skills/keel-v2/) | **Arbiter** — rigor router, the spine | — |
| [`keel-dev`](skills/keel-dev/) | Development lane | superpowers, gstack, codex-plugin-cc, hyperframes, antfu/skills, agent-browser |
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

## Install

Lanes are opt-in. Nothing installs until you name one.

```bash
./install.sh                 # list lanes + what each pulls
./install.sh dev design      # vendor those lanes' upstreams
./install.sh all             # every non-optional lane
./install.sh mcp             # scaffold .mcp.json from the template
```

- **skills** → cloned into `vendor/` (unmodified; point Claude Code at it).
- **plugins** → the installer prints the marketplace/clone command.
- **MCP servers** → fill credentials in `.mcp.json` (copy from `.mcp.json.template`).

Curate, don't hoard: every installed skill's description sits in context each
session — install only the lanes you use.

## Use as a submodule

From a consuming project (a git repo):

```bash
git submodule add https://github.com/sayeediftekhar/claude-skills .claude/skills
git submodule update --init --recursive
```

Skills resolve under `.claude/skills/skills/<skill-name>/`. Update with
`git submodule update --remote .claude/skills`.

## Editing

Work in this repo, commit, push. Consuming projects pick up changes via
`git submodule update --remote`.
