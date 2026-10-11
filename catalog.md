# Keel — upstream catalog (32 items: 28 upstreams + 4 locals)

The external skills/plugins/MCP servers Keel routes to. Kept **unmodified**;
Keel's lane routers (see `ARCHITECTURE.md`) point at them. `type` decides how
each installs: **plugin** (marketplace/`.claude/plugins`), **skill** (cloned to
`.claude/keel/vendor/`, symlinked into `.claude/skills/`), **mcp** (`.mcp.json`),
**cli** (installed on the machine), **local** (in this repo, symlinked into
`.claude/skills/`). Every git upstream is pinned to a commit in `manifest.json`
(`ref`, refreshed with `./install.sh pin` through a reviewed PR).

Star/install figures are approximate snapshots and drift upward — don't trust
them as current.

## keel-dev — Development
Conductor: **Pocock spine + power-tools** (see `skills/keel-dev/SKILL.md`).

| Item | Role | Type | Repo / source | What it does |
|------|------|------|---------------|--------------|
| mattpocock-skills | **spine** | plugin | mattpocock/skills (`mattpocock-skills@claude-plugins-official`, self-updating) | 27 skills. The backbone pipeline: grill-with-docs → to-spec → to-tickets → implement → two-axis code-review; domain-modeling (`GLOSSARY.md`), codebase-design (deep modules), diagnosing-bugs, tdd |
| vercel | deploy | plugin | vercel/vercel-plugin (`vercel@claude-plugins-official`) | Vercel-hosted projects only: deploy, promote, instant rollback, logs — the Ship and Incident steps |
| keel-qa | qa | local | this repo | Real-browser QA procedure on Claude Code's own browsers; evidence per acceptance criterion |
| hyperframes | **parked** | skill | heygen-com/hyperframes | Agent-native HTML/CSS/JS → deterministic MP4 video. ~162 MB clone — `./install.sh hyperframes` only in projects that make video |
| antfu/skills | **parked** | plugin | antfu/skills | Vue/Vite/Nuxt/Pinia/Vitest skills, auto-synced from docs — `./install.sh antfu-skills` only in Vue-stack projects |
| agent-browser | qa | cli | vercel-labs/agent-browser | Headless browser CLI — keel-qa's browser for terminal/cloud sessions; run from the shell, no per-session tool cost |
| sentry | errors | mcp | mcp.sentry.dev | Hosted Sentry MCP (OAuth) — the Maintain loop's error-triage input; already used by taleem-central, careon, image-erp, image-erp-clinical |
| graphify | comprehension | local | ~/.claude/skills/graphify | Codebase knowledge graph (query/path/explain) — the graphify-first default over grep |
| keel-verify | verification | local | this repo | Evidence before "done": run the real checks, show the output, then claim |
| supabase-agent-skills | stack (opt-in) | plugin | supabase/agent-skills @ `c9be0e9` | Official Supabase skills: `supabase` (products, CLI/MCP, migrations, debugging, security checklist) and `supabase-postgres-best-practices` (Postgres schema/query/RLS rules). Pinned; `./install.sh supabase-agent-skills` only on Supabase/Postgres projects. |

## keel-design — Design/UI
| Item | Type | Repo / source | What it does |
|------|------|---------------|--------------|
| impeccable | skill | pbakaus/impeccable | Design taste engine — polish/audit/critique/animate; 46 detector rules |
| frontend-design | plugin | anthropics/claude-code (plugins/frontend-design) | Official design system — stops generic "AI slop" UI |
| fused-landing | local | this repo | Landing/marketing page build + DESIGN.md token discipline |

## keel-marketing — Marketing/growth
| Item | Type | Repo / source | What it does |
|------|------|---------------|--------------|
| marketingskills | plugin | coreyhaines31/marketingskills | ~40 skills: copy, CRO, SEO, analytics, growth |
| claude-seo | skill | AgriciDaniel/claude-seo | SEO/GEO/AEO: 25 sub-skills, schema, E-E-A-T |
| kondo | mcp | trykondo.com | Triage LinkedIn DMs, flag which need a reply (hosted) |

## keel-content — Content/social/writing
| Item | Type | Repo / source | What it does |
|------|------|---------------|--------------|
| humanizer | skill | blader/humanizer | Strip AI-writing tells → natural human voice |
| social-media-skills | skill | charlie947/social-media-skills | Content OS: voice, posts, carousels, reels, captions |
| higgsfield | mcp | higgsfield.ai | Cinematic image/short video from a prompt (hosted) |

## keel-research — Research/knowledge
| Item | Type | Repo / source | What it does |
|------|------|---------------|--------------|
| notebooklm-skill | skill | PleasePrompto/notebooklm-skill | Query your Google NotebookLM notebooks, citation-backed |
| perplexity | mcp | perplexityai/modelcontextprotocol | Real-time web search / deep research via Sonar |
| ai-second-brain | skill | charlie947/ai-second-brain | Searchable wiki built from your ChatGPT/Claude history |

## keel-secure — Security
| Item | Type | Repo / source | What it does |
|------|------|---------------|--------------|
| VibeSec-Skill | skill | BehiSecc/VibeSec-Skill | Catch vulnerabilities before they ship (also a keel-v2 gate) |

## keel-ops — Memory/connectors/meta
| Item | Type | Repo / source | What it does |
|------|------|---------------|--------------|
| claude-mem | plugin (+MCP+hooks) | thedotmack/claude-mem | Persistent cross-session memory — auto-captures sessions → SQLite/vectors → re-injects. See [MEMORY-CONTRACT.md](MEMORY-CONTRACT.md) |
| granola | mcp | granola.ai (community: chrisguillory/granola-mcp) | Feed meeting transcripts/notes to Claude (hosted) |
| slack | mcp | slackapi/slack-mcp-plugin | Read/search/post Slack messages, threads, canvases |
| notion | mcp | makenotion/notion-mcp-server | Read/write Notion pages and databases |
| zapier | mcp | zapier/zapier-mcp | 9,000+ apps / 40,000+ actions in plain English |
| find-skills | skill | vercel-labs/skills | Discover & install skills from the open ecosystem |
| claude-skills | skill | alirezarezvani/claude-skills | Large multi-platform skills library (probable match) |

## keel-finance — Finance (optional vertical)
| Item | Type | Repo / source | What it does |
|------|------|---------------|--------------|
| financial-services | plugin | anthropics/financial-services | IB, equity research, PE, wealth — DCF/LBO/3-statement, CIMs |

## keel-legal — Legal (optional vertical)
| Item | Type | Repo / source | What it does |
|------|------|---------------|--------------|
| claude-for-legal | plugin | anthropics/claude-for-legal | ~12 practice areas, 90+ workflow agents |

## Match status (verified 2026-07)
- **mattpocock-skills** — ✅ re-verified 2026-10-17: 27 skills, now shipped in
  `claude-plugins-official` and self-updating, so it drifts without a version
  bump here. Since 2026-07: `grill` → `grill-with-docs` (+ `grill-me`,
  `grilling`); `domain-modeling` writes `GLOSSARY.md`. keel-dev now also routes
  `wayfinder`, `pr`, `retro`, `triage`, `prototype`, `implement-spec`,
  `research`, `wizard`; `writing-for-agents` is the authoring standard
  (CONTRIBUTING.md). The full list lives in `manifest.json` → `routes`, checked
  by `evals/upstream-drift.sh`.
- **gstack**, **superpowers** — ❌ removed 2026-10-17. gstack had grown to ~60
  skills, installs into `~/.claude/skills`, and its setup steers the agent away
  from other browsers (team mode adds blocking hooks); superpowers' jobs are now
  covered by the spine + Claude Code sessions/worktrees. Reasons and
  replacements: ARCHITECTURE.md → *Which upstreams earn a route*.
- **codex-plugin-cc** — ❌ removed 2026-10-17. It drives OpenAI's Codex CLI and
  needs an OpenAI account; Keel's workflows don't use Codex, so it never earned
  its install (and keel-dev's `/codex` was never a real command — they are
  `/codex:review` etc.). Second-pass review is now the built-in `/code-review`.
- **social-media-skills** — ✅ confirmed `charlie947` (Charlie Hills content OS,
  17 skills incl. reels/captions/carousels). Not blacktwist.
- **claude-skills** — ✅ confirmed `alirezarezvani` (changelog shows 263→264
  skills, 13 platforms — exact "263+ / every platform" match).
- **claude-seo** — ✅ confirmed `AgriciDaniel` (25 sub-skills + 18 agents, covers
  GEO/AEO).
- **frontend-design** vs **impeccable** — ⚖️ open *preference*, not ambiguity.
  Both kill AI-slop UI; pick one primary per project. Current default in
  `keel-design`: impeccable primary, frontend-design fallback, fused-landing
  for pages.

## Already governed elsewhere (not in a lane)
- **caveman** / **ponytail** → wrapped by the local `lazy-loop` skill (`/lazy`).
