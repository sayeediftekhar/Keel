---
name: keel-dev
disable-model-invocation: true
description: Development conductor — the dev toolbox. Run it by name to build through the Pocock spine (grill → spec → tickets → implement → review) with gstack/superpowers as opt-in power-tools, graphify for comprehension, all governed by keel-v2.
---

# Keel Dev — development conductor

**User-invoked conductor, not an auto-firing router.** You reach for it by name
when you're doing dev work; it orchestrates the pipeline and pulls in the right
specialist per phase. It carries **zero context cost** until invoked. It writes
no product code itself — the phase skills do that.

**Backbone = Pocock (`mattpocock/skills`). gstack + superpowers = opt-in
power-tools. keel-v2 governs everything.**

## Deference — keel-v2 is the arbiter
Scan the nine danger surfaces first, record the lane line
(`Rigor: FAST/HEAVY — …`). keel-v2's /review tripwires, a11y, design
conformance, and human gates outrank every phase and every power-tool. A
power-tool's own ethos (e.g. gstack "boil the ocean") is subordinate to keel-v2.

## Comprehension — graphify-first
To understand the code (how X works, what depends on Y, data flow, blast
radius, architecture) **query graphify** (`query`/`path`/`explain`) instead of
grep+read — it returns a targeted subgraph, not a dozen file reads. **Grep only**
for an exact known string/symbol, a tiny throwaway scope with no `graphify-out/`
yet, or an area just edited (graph may be stale). Default graphify; grep is the
deliberate exception.

## The pipeline (spine default · power-tools opt-in)
| Phase | Default (Pocock spine) | Opt-in power-tools | Rigor |
|---|---|---|---|
| 0 · Align | `grill` — one Q at a time, look up facts, recommend answers | gstack `/office-hours` for product/scope reframes | HEAVY/ambiguous only; FAST skips |
| 1 · Language | `domain-modeling` → `CONTEXT.md` glossary + ADRs | — | optional, compounding |
| 2 · Spec | `to-spec` (synthesize conversation → spec) | gstack `/spec` (Codex quality gate) | HEAVY |
| 3 · Decompose | `to-tickets` → `.scratch/<feat>/issues/NN.md`, tracer-bullet slices + blocking edges (+ expand/contract for wide refactors) | — | HEAVY |
| 4 · Build | `implement` — ticket-by-ticket, `tdd` at seams | superpowers **autonomous executor** (big approved plans) + worktrees / parallel-agents | HEAVY→strict red-green-refactor; FAST→pragmatic. Autonomy **stops at** commit/deploy gates |
| 5 · Review | `code-review` — two-axis (Standards+Fowler / Spec), parallel subagents | gstack `/review` (prod-bug autofix) + `/codex` (cross-model) | always |
| 5b · Security | → **keel-secure** (VibeSec) | gstack `/cso` (OWASP+STRIDE) | mandatory on trust-boundary diffs (keel-v2 tripwire) |
| 6 · Verify/QA | Keel `verify` (non-UI) | gstack `/qa` (real browser, autofix, regression tests); UI → **keel-design** + `/design-shotgun` | HEAVY |
| 7 · Ship | — | gstack `/ship` → `/land-and-deploy` → `/canary` | HEAVY; **stops at human gate**, never auto-deploys |
| 8 · Debug | `diagnosing-bugs` | superpowers `systematic-debugging` / gstack `/investigate` | as needed |
| 9 · Arch health | `improve-codebase-architecture` + `codebase-design` (deep modules) | — | periodic |

## Rules (the locked decisions)
1. **One spine.** Power-tools never auto-fire alongside the spine — reach for
   them by name. No coin-flip between three methodologies.
2. **keel-v2 rigor arbitrates completeness.** FAST = YAGNI/minimal; HEAVY =
   complete (tests, edges, error paths). `lazy-loop` is an explicit opt-in.
3. **Execution leash.** `implement` is default; the superpowers executor is
   opt-in and runs *within* an approved plan but stops at keel-v2 gates.
4. **State lives in files** — `.scratch/<feat>/issues/NN.md` tracer-bullet
   tickets + `CONTEXT.md` glossary. See `conventions/tickets-and-context.md`.

## Token economy (7 levers)
1. this conductor is user-invoked (0 description tax) · 2. progressive
disclosure (one phase body at a time) · 3. subagent offload (review / autonomous
exec / QA run in fresh contexts, return summaries) · 4. keel-v2 FAST economy ·
5. per-project curation (power-tools install only where needed) · 6.
lazy-loop/caveman output compression · 7. **graphify-first comprehension**.

## Trade-off honesty (unbiased routing)
When a route trades one axis for another, say so in one line: **direction +
rough magnitude (labeled `est.` unless measured) + the risk.** Never hide the
downside. No fake precision — a made-up percentage is the bias we're killing.
E.g. *"graphify over reading auth/: est. far fewer tokens, but the graph is ~6
commits stale there, so I grep'd the files you just changed."*

## If a specialist isn't installed
Say so plainly; fall back to the spine or base Claude Code under keel-v2 — never
pretend a specialist ran. Install: `./install.sh dev` (spine + power-tools,
per-project). Power-tools are best installed **user-invoked / per-project** so
their descriptions don't tax every session (token lever 5).

Sources (unmodified): mattpocock/skills (spine) · obra/superpowers ·
garrytan/gstack · openai/codex-plugin-cc · heygen-com/hyperframes · antfu/skills
· vercel-labs/agent-browser · graphify (local).
