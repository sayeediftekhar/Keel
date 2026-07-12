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
│      Plus locals: fused-landing, lazy-loop                    │
├─────────────────────────────────────────────────────────────┤
│  L3  UPSTREAMS          superpowers, gstack, impeccable,      │
│      Unmodified.        marketingskills, humanizer, VibeSec,  │
│      Vendored/installed  claude-mem, … (28 total)             │
│      as-is. Keep         + MCP servers: slack, notion,        │
│      updating.           zapier, perplexity, granola, …       │
└─────────────────────────────────────────────────────────────┘
```

**Rule of the layers:** a lane router (L2) never implements the work — it scans
rigor via keel-v2 (L1), then dispatches to an upstream (L3). keel-v2 outranks
everything; where any file disagrees with keel-v2, keel-v2 wins.

## Why routers, not a merge

We rejected forking the 28 repos into monolithic `keel-dev`/`keel-marketing`
skills:

- **Upstreams are alive.** superpowers, caveman, agent-browser et al. gain
  stars/skills monthly. A merge freezes them and creates a permanent re-merge
  chore.
- **Internal structure matters.** superpowers is ~14 interlocking skills;
  gstack is 23 role agents. Flattened into one file they get worse.
- **License hygiene.** Blending many MIT/Apache/official repos into one blob is
  a mess to attribute and update.

Routing gives the same single-entry-point UX ("use the dev lane") with none of
that debt.

## The lanes

| Lane | Domain | Dispatches to (L3) |
|------|--------|--------------------|
| `keel-dev` | Development | superpowers, gstack, codex-plugin-cc, hyperframes, antfu/skills, agent-browser |
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
discipline) and **lazy-loop** (`/lazy` — code/prose thrift, wraps caveman +
ponytail). Both already defer to keel-v2.

## Three install mechanisms (they are not the same)

The 28 upstreams reach Claude three different ways — see `catalog.md` for the
per-item mapping and `install.sh` for the tooling:

1. **Plugins** (bundles) → the Claude Code plugin marketplace / `.claude/plugins`.
2. **Standalone skills** → git submodule or clone under `.claude/skills`.
3. **MCP servers** → `.mcp.json` (see `.mcp.json.template`). **Not skills** —
   they cannot be merged into a lane; they're connectors wired with credentials.

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
