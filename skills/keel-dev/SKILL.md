---
name: keel-dev
description: >-
  Development lane router. Dispatches a coding task to the best-fit vendored
  dev skill (superpowers, gstack, hyperframes, antfu/skills, agent-browser,
  codex bridge) instead of doing the work itself. Defers to keel-v2 for rigor.
  Use when building, refactoring, testing, debugging, scaffolding, or shipping
  code — this router picks which specialist to run.
---

# Keel Dev — development lane router

**This file is an index, not an implementation.** Its only job is to scan
rigor (via keel-v2), then hand the task to the right vendored dev skill. It
writes no product code beyond the dispatch decision.

## Deference — keel-v2 is the arbiter
Before dispatching, run the keel-v2 nine-surface scan and record the lane line
(`Rigor: FAST/HEAVY — …`). This router never overrides keel-v2's /review
tripwires, a11y, or design conformance. If a dispatched skill's output would
trip a tripwire, keel-v2 wins and you fix it in-turn (FAST) or block (HEAVY).

## Dispatch table
| When the task is… | Dispatch to | Type | Source |
|---|---|---|---|
| Methodology-heavy build: TDD, systematic debugging, plan-writing, subagent-driven work | `superpowers` | plugin | obra/superpowers |
| "Act as a whole dev team" — plan→design→build→review→release role agents | `gstack` | plugin | garrytan/gstack |
| Hand a task to / get a review from OpenAI Codex from inside Claude Code | `codex-plugin-cc` | plugin | openai/codex-plugin-cc |
| Turn HTML/CSS/JS into a rendered MP4 (motion, promo, deterministic video) | `hyperframes` | skill | heygen-com/hyperframes |
| Vue / Vite / Nuxt / Pinia / Vitest framework work | `antfu/skills` | plugin | antfu/skills |
| Drive a browser token-efficiently (scrape, e2e, fill forms, verify a live page) | `agent-browser` | MCP/CLI | vercel-labs/agent-browser |

## Precedence when more than one matches
1. **Security-touching change** → also run `keel-secure` (VibeSec) as a gate;
   see that lane. Don't ship security-relevant code from this lane un-scanned.
2. **Framework-specific** (Vue/Vite) beats the generalist → prefer `antfu/skills`.
3. **Whole-feature from scratch** → `superpowers` (methodology) over `gstack`
   (role theatre) unless you explicitly want the team-of-agents framing.
4. **A live page must be observed** (not just written) → `agent-browser`.

## If the target isn't installed
Say so plainly and fall back to base Claude Code under keel-v2 rigor — do not
silently pretend the specialist ran. To install a lane, see the repo root
`catalog.md` + `install.sh` (`./install.sh dev`).

Sources: obra/superpowers · garrytan/gstack · openai/codex-plugin-cc ·
heygen-com/hyperframes · antfu/skills · vercel-labs/agent-browser (all MIT/OSS
or official vendor plugins; kept unmodified — this router only points at them).
