# Keel — architecture (Model B)

Keel is a **routing + governance layer** over a curated set of external Claude
skills, plugins, and MCP servers. It does **not** fork or merge those upstreams.
They stay unmodified and keep updating; Keel just decides *when* to reach for
each one and enforces one rigor standard across all of them.

## The three layers

```
┌─────────────────────────────────────────────────────────────┐
│  L1  ARBITER            keel-v2   (CLAUDE.md + LAWS.md)       │
│      Rigor router. Nine danger surfaces. FAST vs HEAVY.      │
│      Every lane and every upstream defers to this.           │
├─────────────────────────────────────────────────────────────┤
│  L2  LANE ROUTERS       keel-dev, keel-design, keel-marketing,│
│      Thin index skills.  keel-content, keel-research,         │
│      One per domain.     keel-secure, keel-ops,               │
│      Dispatch → L3.      keel-finance*, keel-legal*  (*opt-in)│
│      Plus locals: fused-landing, lazy-loop, keel-qa           │
├─────────────────────────────────────────────────────────────┤
│  L3  UPSTREAMS          mattpocock-skills, impeccable,        │
│      Unmodified.        marketingskills, humanizer, VibeSec,  │
│      Vendored/installed  claude-mem, … (see catalog.md)       │
│      as-is. Keep         + MCP servers: slack, notion,        │
│      updating.           zapier, perplexity, granola, …       │
└─────────────────────────────────────────────────────────────┘
```

**Rule of the layers:** a lane router (L2) never implements the work — it scans
rigor via keel-v2 (L1), then dispatches to an upstream (L3). keel-v2 outranks
everything; where any file disagrees with keel-v2, keel-v2 wins.

## Why routers, not a merge

We rejected forking the upstreams into monolithic `keel-dev`/`keel-marketing`
skills:

- **Upstreams are alive.** Between 2026-07 and 2026-10 mattpocock/skills grew to
  27 skills and renamed two that keel-dev routed to. A merge would have frozen
  the old names and created a permanent re-merge chore.
- **Internal structure matters.** Pocock's skills are small interlocking pieces
  (grill → spec → tickets → implement → review). Flattened into one file they
  get worse.
- **License hygiene.** Blending many MIT/Apache/official repos into one blob is
  a mess to attribute and update.

Routing gives the same single-entry-point UX ("use the dev lane") with none of
that debt.

## Which upstreams earn a route

**Route the machinery, own the procedure.** Fast-moving tooling (browsers,
deploy pipelines, security scanners) stays with the people who maintain it.
Keel writes its own skill only for a *procedure* — stable steps that mostly
encode Keel policy — and only when no routable upstream passes the rules below.

An upstream is routed only if it:

1. **Installs per project.** Anything forced into user scope taxes every
   session, in every project.
2. **Leaves the arbiter alone.** No CLAUDE.md directives or blocking hooks that
   compete with keel-v2's rigor or gates.
3. **Has unambiguous names.** No clash with the spine or Claude Code built-ins,
   or callable with its plugin prefix.
4. **Is drift-checked.** Its skill names are in `manifest.json` → `routes` and
   checked by `evals/upstream-drift.sh` (today that covers the spine; extend it
   when routing another skill bundle).
5. **Earns its install.** Keel uses a real share of it, not a handful of
   commands from a large bundle.

When one fails, its job goes to the platform (Claude Code built-ins, the hosting
provider's own tools), to an upstream that passes, or — if the job is just
procedure — to a thin local skill.

**Parked upstreams.** Rule 5 judges what *installs*, not what's listed. A
useful upstream that most projects don't need stays in the catalog marked
`"optional": true`: lane installs skip it, and `./install.sh <name>` installs it
alone in the project that needs it. Parked today: hyperframes (video, ~162 MB)
and antfu-skills (Vue stack).

**Rejected 2026-10:** *gstack* (installs into `~/.claude/skills`; its setup tells
the agent to bypass other browsers, and team mode adds blocking hooks; ~60 skills
overlapping the spine — fails 1, 2, 3, 5) and *superpowers* (its executor,
worktrees, TDD and debugging are now covered by the spine plus Claude Code's own
sessions and worktrees — fails 5) and *codex-plugin-cc* (drives OpenAI's Codex
CLI on a separate OpenAI account, which Keel's workflows don't use — fails 5).
Their useful jobs moved to `keel-qa` (local), the Vercel plugin
(deploy/rollback), keel-secure, and the built-in `/code-review` as a second
review pass.

## The lanes

| Lane | Domain | Dispatches to (L3) |
|------|--------|--------------------|
| `keel-dev` | Development | mattpocock-skills (spine), vercel, sentry (MCP), hyperframes, antfu/skills, agent-browser (CLI), (local) keel-qa |
| `keel-design` | Design/UI | impeccable, frontend-design, (local) fused-landing |
| `keel-marketing` | Marketing/growth | marketingskills, claude-seo, kondo (MCP) |
| `keel-content` | Content/social/writing | humanizer, social-media-skills, higgsfield (MCP) |
| `keel-research` | Research/knowledge | notebooklm-skill, perplexity (MCP), ai-second-brain |
| `keel-secure` | Security (also a gate) | VibeSec-Skill |
| `keel-ops` | Memory/connectors/meta | claude-mem, granola, slack, notion, zapier (MCP), find-skills, claude-skills |
| `keel-finance`* | Finance vertical | financial-services |
| `keel-legal`* | Legal vertical | claude-for-legal |

\* Optional verticals — off by default; install only if you do that work.

Locals that aren't routers: **fused-landing** (landing-page build + token
discipline), **lazy-loop** (`/lazy` — code/prose thrift, wraps caveman +
ponytail) and **keel-qa** (real-browser QA procedure on Claude Code's own
browsers). All defer to keel-v2.

## Four install mechanisms (they are not the same)

The upstreams reach Claude four different ways — see `catalog.md` for the
per-item mapping and `install.sh` for the tooling:

1. **Plugins** (bundles) → the Claude Code plugin marketplace / `.claude/plugins`.
2. **Standalone skills** → git submodule or clone under `.claude/skills`.
3. **MCP servers** → `.mcp.json` (see `.mcp.json.template`). **Not skills** —
   they cannot be merged into a lane; they're connectors wired with credentials.
   Each one's tools load into every session, so add them per project.
4. **CLIs** → installed once on the machine (e.g. `agent-browser`). The agent
   runs them from the shell, so they cost no context until used.

## How a task flows

1. Task arrives → **keel-v2** scans the nine danger surfaces, sets FAST/HEAVY.
2. The matching **lane router** triggers on its description, picks the upstream.
3. The **upstream** does the work.
4. **keel-v2 /review tripwires** run in-turn (FAST) or as a gate (HEAVY).
5. Security-relevant diffs also pass **keel-secure** (VibeSec) before "done".
6. Outward/irreversible actions (post, send, publish, migrate, pay) stop at the
   human gate — never auto-run.

## Curate, don't hoard

Every installed skill's description sits in context each session. Install the
lanes you actually use; leave finance/legal (and any lane you don't touch)
uninstalled. Curated beats complete.
