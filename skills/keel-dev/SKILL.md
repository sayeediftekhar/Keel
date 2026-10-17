---
name: keel-dev
disable-model-invocation: true
description: Development conductor — the dev toolbox. Run it by name to build and maintain through the Pocock spine (grill → spec → tickets → implement → review), a short list of opt-in power-tools, keel-qa for real-browser QA, graphify for comprehension, all governed by keel-v2.
---

# Keel Dev — development conductor

**User-invoked conductor, not an auto-firing router.** You reach for it by name
when you're doing dev work; it orchestrates the pipeline and pulls in the right
specialist per phase. It carries **zero context cost** until invoked. It writes
no product code itself — the phase skills do that.

**Backbone = Pocock (`mattpocock/skills`). One default per job; a short list of
opt-in power-tools. keel-v2 governs everything.**

## Deference — keel-v2 is the arbiter
Scan the nine danger surfaces first, record the lane line
(`Rigor: FAST/HEAVY — …`). keel-v2's /review tripwires, a11y, design
conformance, and human gates outrank every phase and every power-tool. A
power-tool's own ethos is subordinate to keel-v2.

## Comprehension — graphify-first
To understand the code (how X works, what depends on Y, data flow, blast
radius, architecture) **query graphify** (`query`/`path`/`explain`) instead of
grep+read — it returns a targeted subgraph, not a dozen file reads. **Grep only**
for an exact known string/symbol, a tiny throwaway scope with no `graphify-out/`
yet, or an area just edited (graph may be stale). Default graphify; grep is the
deliberate exception. For facts *outside* the repo (a library's API, a vendor's
docs) use Pocock `research` — primary sources, findings saved as Markdown in the
repo. Topic/market research belongs to **keel-research**.

## The pipeline (spine default · power-tools opt-in)
Spine skills load as `mattpocock-skills:<name>`. A bare name works unless
Claude Code ships a built-in with the same name — then invoke the prefixed form,
or the built-in runs instead. Today that is `mattpocock-skills:code-review`: the
built-in `/code-review` hunts bugs in a diff but has no Standards/Spec axes.

| Phase | Default (Pocock spine) | Opt-in power-tools | Rigor |
|---|---|---|---|
| · Intake | `triage` — incoming issues/PRs → categorised, verified, agent-ready briefs | — | tracker mode only |
| 0 · Align | `grill-with-docs` — one Q at a time, look up facts, recommend answers; HEAVY features also write `00-product.md` (problem, success metric, announcement copy, mockup — **no technical language**) | — | HEAVY/ambiguous only; FAST skips |
| 0b · Map | `wayfinder` — work bigger than one session becomes a map of decision tickets, resolved one per session until no open question blocks the build | — | HEAVY epics only |
| 1 · Language | `domain-modeling` → `GLOSSARY.md` + ADRs | — | optional, compounding |
| 2 · Spec | `to-spec` (synthesize conversation → spec); `prototype` for a throwaway spike when a state model, logic or UI shape is still in doubt | — | HEAVY |
| 3 · Decompose | `to-tickets` → `.scratch/<feat>/issues/NN.md` (or tracker issues), tracer-bullet slices + blocking edges (+ expand/contract for wide refactors) | — | HEAVY |
| 4 · Build | `implement` — ticket-by-ticket, `tdd` at seams; `implement-spec` to run the whole approved ticket set | parallel Claude Code sessions, one per frontier ticket, each in its own worktree | HEAVY→strict red-green-refactor; FAST→pragmatic. Autonomy **stops at** commit/deploy gates |
| 5 · Review | `mattpocock-skills:code-review` — two-axis (Standards = the project's `CODING_STANDARDS.md` over a Fowler baseline / Spec), parallel subagents | built-in `/code-review` as a second pass (correctness bugs — a different axis) | always |
| 5b · Security | → **keel-secure** (VibeSec) | built-in `/security-review` as a second pass | mandatory on trust-boundary diffs (keel-v2 tripwire) |
| 6 · Verify/QA | **keel-qa** (UI: real browser, evidence per acceptance criterion); Keel `verify` (non-UI) | design questions → **keel-design** | HEAVY |
| 7 · Ship | `pr` writes the PR body; `wizard` scripts the steps only the human can do (secrets, dashboards, cutovers); on Vercel, `vercel:deployments-cicd` to promote | — | HEAVY; **stops at human gate**, never auto-deploys |
| 8 · Debug | `diagnosing-bugs` | — | as needed |
| 9 · Arch health | `improve-codebase-architecture` + `codebase-design` (deep modules) | — | periodic (Maintain loop) |
| 10 · Learn | `retro` on the session → each lesson to its one home (MEMORY-CONTRACT → *Where a lesson goes*) | — | after ship / big sessions |
| 11 · Maintain | the recurring jobs in *Maintain* below | — | production projects |

## Phase exits — advance only when the line is true
- **Align:** the problem, success metric and scope fit in a paragraph the human has confirmed.
- **Map:** every decision ticket is resolved or parked in `Open decisions`; nothing left blocks the build.
- **Spec:** the spec names every behaviour to build and every one deliberately left out.
- **Decompose:** each ticket is a vertical slice with acceptance criteria and blocking edges; the frontier is non-empty.
- **Build:** the ticket's acceptance criteria pass under tests; the slice is ticked in `00-status.md`.
- **Review:** both axes report no open findings above nit, or each is fixed or explicitly waived by the human.
- **Verify/QA:** every acceptance criterion has pass/fail evidence (the keel-qa report).
- **Ship:** the human has approved; nothing deploys on an agent's say-so.

## Gates (approval boundaries · keel-v2 decides how hard)
The pipeline is decision-first: settle the expensive calls while context is
cheap, before thousands of lines exist. Rigor sets how many boundaries are
**hard human gates** (keel-v2 HEAVY §2.2 approve-before-code / §2.4
stop-for-verification apply *at each*):

- **HEAVY** — hard gates after **0·Align (+ 0b·Map for epics) → 2·Spec**, **2·Spec → 3·Decompose**,
  and **3·Decompose → 4·Build**, plus the always-on **7·Ship** gate. At each,
  stop and get the human's explicit approval before advancing.
- **FAST** — no mid-pipeline gates; only the **Ship** gate (keel-v2 §1.4:
  never auto-commit). Don't bureaucratize no-surface work.

**Compact at every gate.** Before advancing, consolidate the decisions of the
phase you're leaving into its doc (product/spec/GLOSSARY.md/tickets) and record
approval in `00-status.md` — then the doc *is* the context; a fresh session
resumes from files, not from the transcript. Calls you're not confident about
go in `00-status.md` → `Open decisions` so a human resolves them, never a
silent guess.

## Maintain — keeping a shipped product healthy
Maintenance is dev work on a schedule. Each job runs as a scheduled Claude Code
routine (`/schedule`), goes through the pipeline at the rigor keel-v2 assigns,
and **ends at a PR, a ticket or a human step** — never a silent change to
production.

| Job | When | Runs | Ends at |
|---|---|---|---|
| Dependency + security updates | weekly | upgrade, run the suite, `mattpocock-skills:code-review`; patch/minor = FAST, major = HEAVY | a PR you merge |
| Error triage | on a Sentry alert | `diagnosing-bugs` on the issue, read through the Sentry MCP; no Sentry → the host's runtime logs (Vercel plugin) | a fix PR, or a ticket |
| Incident | production breaks | roll back first — on Vercel, instant rollback to the last good deployment via `vercel:deployments-cicd`; `wizard` for human-only steps; then `diagnosing-bugs`; `retro` as the postmortem | service restored, then a fix PR |
| Architecture health | monthly | `improve-codebase-architecture` | tickets for review |
| CI health | continuous | the app's Auto-fix on open PRs | pushes to that PR |
| Keel drift | weekly, in the Keel repo | `evals/upstream-drift.sh` | an issue if it fails |

Rollback is outward-facing like deploy: the agent names the target deployment
and the exact action; the human confirms. Done when every job above has an owner
and a schedule, or is marked *not needed* in the project's `CONTEXT.md`.

## Rules (the locked decisions)
1. **One spine.** The spine runs by default; reach for a power-tool by name
   when you want it. No coin-flip between three methodologies.
2. **keel-v2 rigor arbitrates completeness.** FAST = YAGNI/minimal; HEAVY =
   complete (tests, edges, error paths). `lazy-loop` is an explicit opt-in.
3. **Execution leash.** `implement` / `implement-spec`, and any parallel session
   working a frontier ticket, run *within* an approved plan and stop at keel-v2
   gates.
4. **State lives in files** — tracer-bullet tickets (`.scratch/` by default, or
   the tracker `/setup-matt-pocock-skills` configured) + `GLOSSARY.md` +
   `00-status.md`, the single "where are we, what's approved" resume file. See
   `conventions/tickets-and-context.md`.

## Token economy (7 levers)
1. this conductor is user-invoked (0 description tax) · 2. progressive
disclosure (one phase body at a time) · 3. subagent offload (review / parallel
tickets / QA run in fresh contexts, return summaries) · 4. keel-v2 FAST economy ·
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

Sources (unmodified): mattpocock/skills (spine) · heygen-com/hyperframes · antfu/skills · vercel-labs/agent-browser (CLI) · Vercel
plugin (Vercel-hosted projects) · Sentry MCP (production errors) · keel-qa +
graphify (local). gstack, superpowers and codex-plugin-cc
were removed 2026-10 — see ARCHITECTURE.md → *Which upstreams earn a route*.
