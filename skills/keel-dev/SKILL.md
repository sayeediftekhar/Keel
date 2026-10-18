---
name: keel-dev
disable-model-invocation: true
description: Development conductor — the dev toolbox. Run it by name to build and maintain through the Pocock spine (grill-with-docs → to-spec → to-tickets → implement → code-review → keel-qa / keel-verify), a short list of opt-in power-tools, graphify for comprehension, all governed by keel-v2.
---

# Keel Dev — development conductor

**User-invoked conductor, not an auto-firing router.** You reach for it by name
when you're doing dev work; it orchestrates the pipeline and pulls in the right
specialist per phase. It carries **zero context cost** until invoked. It writes
no product code itself — the phase skills do that.

**Backbone = Pocock (`mattpocock/skills`). One default per job; a short list of
opt-in power-tools. keel-v2 governs everything.**

## Deference — keel-v2 is the arbiter
Scan the eleven danger surfaces first, record the lane line
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
built-in `/code-review` hunts bugs in a diff but has no Standards/Spec axes. Phase
5 runs both: they check different things, and neither replaces the other.

| Phase | Default (Pocock spine) | Opt-in power-tools | Rigor |
|---|---|---|---|
| · Intake | `triage` — incoming issues/PRs → categorised, verified, agent-ready briefs | — | tracker mode only |
| 0 · Align | `grill-with-docs` — one Q at a time, look up facts, recommend answers; HEAVY features also write `00-product.md` (problem, success metric, announcement copy, mockup — **no technical language**) | — | HEAVY/ambiguous only; FAST skips |
| 0b · Map | `wayfinder` — work bigger than one session becomes a map of decision tickets, resolved one per session until no open question blocks the build | — | HEAVY epics only |
| 1 · Language | `domain-modeling` → `GLOSSARY.md` + ADRs | — | optional, compounding |
| 2 · Spec | `to-spec` (synthesize conversation → `spec.md`) **+ §Architecture** (components, data flow, trust boundaries, failure modes; ADRs) **+ §Threat model** (per trust boundary, STRIDE-lite, each threat mapped to a LAWS invariant and the slice that carries the mitigation) — shapes in conventions §4; `prototype` for a throwaway spike when a state model, logic or UI shape is still in doubt | — | HEAVY |
| 3 · Decompose | `to-tickets` → `.scratch/<feat>/issues/NN.md` (or tracker issues), tracer-bullet slices + blocking edges (+ expand/contract for wide refactors) | — | HEAVY |
| 4 · Build | `implement` — ticket-by-ticket, `tdd` at seams; `implement-spec` to run the whole approved ticket set | parallel Claude Code sessions, one per frontier ticket, each in its own worktree | HEAVY→strict red-green-refactor; FAST→pragmatic. Autonomy **stops at** the merge and deploy gates (FAST commits and opens its PR under the standing authorization; HEAVY merges wait for the approver) |
| 5 · Review | `mattpocock-skills:code-review` — two-axis (Standards = the project's `CODING_STANDARDS.md` over a Fowler baseline / Spec), parallel subagents **+ the built-in `/code-review` bug pass (correctness — a different axis), required** | — | always |
| 5b · Security | → **keel-secure** (VibeSec) over the diff, **checked against §Threat model** — every listed threat shows its mitigation landed | built-in `/security-review` as a second pass | mandatory on trust-boundary diffs (keel-v2 tripwire) |
| 6 · Verify/QA | **keel-qa** (UI: real browser, evidence per acceptance criterion); **keel-verify** (non-UI: run the real checks, show the output, then claim) | design questions → **keel-design** | always (in-turn on FAST) |
| 7 · Ship | the **Ship checklist** (§Gates) with `keel-verify` evidence per line; `pr` writes the PR body; `wizard` scripts the steps only the human can do (secrets, dashboards, cutovers); on Vercel, `vercel:deployments-cicd` to promote | — | HEAVY; **stops at human gate**, never auto-deploys |
| 8 · Debug | `diagnosing-bugs` | — | as needed |
| 9 · Arch health | `improve-codebase-architecture` + `codebase-design` (deep modules) | — | periodic (Maintain loop) |
| 10 · Learn | `retro` on the session → each lesson to its one home (MEMORY-CONTRACT → *Where a lesson goes*) | — | after ship / big sessions |
| 11 · Maintain | the recurring jobs in *Maintain* below | — | production projects |

## Phase exits — advance only when the line is true
- **Align:** the problem, success metric and scope fit in a paragraph the human has confirmed.
- **Map:** every decision ticket is resolved or parked in `Open decisions`; nothing left blocks the build.
- **Spec:** the spec names every behaviour to build and every one deliberately left out; on HEAVY it carries §Architecture and §Threat model (conventions §4).
- **Decompose:** each ticket is a vertical slice with acceptance criteria and blocking edges; the frontier is non-empty.
- **Build:** the ticket's acceptance criteria pass under tests; the slice is ticked in `00-status.md`.
- **Review:** both axes report no open findings above nit, and the built-in `/code-review` bug pass ran on the final diff with each finding fixed or explicitly waived by the human.
- **Verify/QA:** every acceptance criterion has pass/fail evidence (the keel-qa report; `keel-verify` output for non-UI).
- **Ship:** every Ship-checklist line has evidence; the human has approved; nothing deploys on an agent's say-so.

## Stack specialists (opt-in · pinned · name them explicitly)
Install only in projects on that stack (`./install.sh supabase-agent-skills`;
it is parked, so a lane install skips it). Don't rely on them auto-triggering: Supabase's own evals show its
skill activates in roughly 60% of relevant tasks, so **name it** at the phases below.

| Stack | Specialist | Use at |
|---|---|---|
| Supabase | `supabase` (supabase/agent-skills) | 2 · Spec and 4 · Build for any schema, RLS, auth, storage, Edge Function or CLI/MCP work; 8 · Debug (it requires reading Supabase's debugging docs first) |
| Postgres (any host) | `supabase-postgres-best-practices` | 2 · Spec for schema/index/RLS design; 5 · Review for queries, migrations, locking, pooling |

They teach *how* to do it correctly; Keel's gates still decide *whether* it may
touch live data. In particular, iterate with `execute_sql`/`supabase db query`
on a **test or local** database only — the migration gate blocks writes to live
unless they arrive as an approved batch.

## Gates (approval boundaries · keel-v2 decides how hard)
The pipeline is decision-first: settle the expensive calls while context is
cheap, before thousands of lines exist. Four named gates; rigor decides how
many are **hard human gates**. The names below are the only gate names — the
ledger (`00-status.md`) uses them verbatim, and tooling parses them.

| Gate | Closes | The human approves | HEAVY | FAST |
|---|---|---|---|---|
| **G1 Align** | 0 · Align, 0b · Map (epics), and 1 · Language when it ran (Language is part of alignment; its `GLOSSARY.md` terms are approved here) | `00-product.md` + `GLOSSARY.md` terms/ADRs + the resolved decision tickets | hard gate | skipped |
| **G2 Spec** | 2 · Spec | `spec.md` — behaviour **+ §Architecture + §Threat model** (conventions §4) | hard gate | skipped |
| **G3 Plan** | 3 · Decompose | `issues/NN.md` — the tickets **are** the approved plan in keel-v2 §2.2 terms. No product code before G3. | hard gate | skipped |
| **Ship** | 6 · Verify → 7 · Ship | the **Ship checklist** (below) with `keel-verify` / `keel-qa` evidence; then keel-v2 §1.4 / §2.4-2.5 decide the ending: FAST → the PR with its `Rigor: FAST` line auto-merges on green; HEAVY → the PR with its `Rigor: HEAVY` line waits for the approver's GitHub review, then auto-merge completes it. Deploys to production, sends and live migrations stay the human's (approved batch, explicit go) | hard gate (approver reviews the PR) | auto on green (audited later) |

How keel-v2's HEAVY rules map onto these gates: §2.1 route-first is the
`Rigor:` line at the top of the ledger; §2.2 plan-before-code is satisfied by
G3 (approved tickets), not by a separate per-ticket plan round-trip; §2.4
build-then-PR-then-stop is the Ship gate: the PR carrying the `Rigor:` line
is the Ship request, the approver's GitHub review is the approval (the v3
`keel-rigor` check keeps a HEAVY PR red until it exists); §2.5 (nothing
irreversible without the approver) holds at every gate.

**Approval has provenance.** A gate flips to `[x]` only on the human's say-so,
and the line records the date, the approver and their words. The agent writes
it only after the human approved in the conversation, quoting them; the human
can also flip it directly (`bin/keel-approve <feature> <gate> "<why>"` in their
own terminal). An unchecked gate means *not approved* — never infer approval
from silence, from "looks good", or from a message relayed by a bot or another
agent. (With the Keel v3 plugin installed, the ledger gate makes the agent
*unable* to flip a box; see `docs/v3/`.)

**Compact at every gate.** Before advancing, consolidate the decisions of the
phase you're leaving into its doc (product/spec/GLOSSARY.md/tickets) and update
`00-status.md` — then the doc *is* the context; a fresh session resumes from
files, not from the transcript. Calls you're not confident about go in
`00-status.md` → `Open decisions` so a human resolves them, never a silent
guess.

**When a ledger exists.** Never for one-turn FAST work (keel-v2 §1: one turn,
terse, no ceremony). Create `.scratch/<feat>/00-status.md` when the work is
HEAVY, or has two or more slices, or will span sessions. A FAST ledger is a
stub: rigor line, slices, Ship.

### Ship checklist (the Ship gate's content — evidence per line, via `keel-verify`)
Software is not done when it compiles; it is done when it can be run, watched,
and undone. HEAVY: every line. FAST: lines 1-3 (the rest usually don't apply;
say "n/a" rather than skip silently).
1. **Verified** — full test suite + build green on the exact commit; the real
   flow exercised (`keel-qa` for UI). Output pasted, not described.
2. **Reviewed** — `mattpocock-skills:code-review` two-axis pass done **and**
   the built-in `/code-review` bug pass run on the final diff (required, not a
   power-tool: model review misses bugs a dedicated bug hunt finds); findings
   fixed or waived by the human; keel-v2 tripwires all pass; trust-boundary
   diffs passed keel-secure against the §Threat model. CI's quality floor
   (dependency audit, secret scan, and SAST/architecture rules where the policy
   turns them on) is green; on HEAVY the PR body names `Feature: <slug>` so
   `keel-rigor` finds the spec's §Threat model.
3. **Reversible** — how to roll back, in one line (revert commit / feature
   flag off / previous deployment via the Vercel plugin). If the answer is
   "can't", say so and stop.
4. **Migrations** — forward *and* backward migration exist and were run on a
   copy of real-shaped data; expand → migrate → contract sequencing for
   anything that touches live rows (LAWS surface 8).
5. **Observable** — the new path logs its failures (with correlation id, no
   PII), and the one metric or alert (Sentry) that would tell you it broke in
   prod is named.
6. **Operable** — runbook line for on-call: what breaks, what to look at,
   what to flip (`wizard` for the human-only steps). Secrets wired via
   env/secret manager, never in the diff.
7. **Rollout** — canary/percentage/flag plan if the blast radius is wide;
   who is watching it; the stop condition.
8. **Recorded** — `00-status.md` Ship line ready for the human; ADRs for any
   architecture decision made during build written to their home
   (MEMORY-CONTRACT → *Where a lesson goes*); `retro` queued.

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
   `00-status.md`, the single "where are we, what's approved" resume file
   (committed, not gitignored). See `conventions/tickets-and-context.md`.

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
keel-verify + graphify (local). gstack, superpowers and codex-plugin-cc
were removed 2026-10 — see ARCHITECTURE.md → *Which upstreams earn a route*.
Skill names above are the upstreams' real names (`evals/upstream-drift.sh`
checks them); if a name is not listed by `/skills`, it is not installed — say so.
