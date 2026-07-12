# Keel — upstream catalog (28 items)

The external skills/plugins/MCP servers Keel routes to. Kept **unmodified**;
Keel's lane routers (see `ARCHITECTURE.md`) point at them. `type` decides how
each installs: **plugin** (marketplace/`.claude/plugins`), **skill** (submodule
under `.claude/skills`), **mcp** (`.mcp.json`), **local** (already in this repo).

Star/install figures are approximate snapshots and drift upward — don't trust
them as current.

## keel-dev — Development
Conductor: **Pocock spine + power-tools** (see `skills/keel-dev/SKILL.md`).

| Item | Role | Type | Repo / source | What it does |
|------|------|------|---------------|--------------|
| mattpocock-skills | **spine** | plugin | mattpocock/skills | The backbone pipeline: grill → to-spec → to-tickets → implement → two-axis code-review; domain-modeling, deep modules, diagnosing-bugs |
| superpowers | power-tool | plugin | obra/superpowers | Autonomous TDD executor: subagent-driven dev, strict red-green-refactor, systematic-debugging (~14 skills) |
| gstack | power-tool | plugin | garrytan/gstack | Product studio: design-shotgun/html, real-browser /qa, /review, /cso security, /ship+deploy (23 roles + tools) |
| codex-plugin-cc | power-tool | plugin | openai/codex-plugin-cc | Official OpenAI bridge — cross-model review / hand-off to Codex |
| hyperframes | adjunct | skill | heygen-com/hyperframes | Agent-native HTML/CSS/JS → deterministic MP4 video |
| antfu/skills | adjunct | plugin | antfu/skills | Vue/Vite/Nuxt/Pinia/Vitest skills, auto-synced from docs |
| agent-browser | adjunct | mcp | vercel-labs/agent-browser | Token-efficient browser automation via a11y-tree snapshots |
| graphify | comprehension | local | ~/.claude/skills/graphify | Codebase knowledge graph (query/path/explain) — the graphify-first default over grep |

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
| claude-mem | skill | thedotmack/claude-mem | Persistent cross-session memory (capture→compress→re-inject) |
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
