# KEEL v2 — routing + rules (Fable-friendly)

Keel is a rigor router: it decides how much ceremony a task needs, then runs
the matching lane. FAST finishes low-risk work end-to-end in one turn; HEAVY
keeps full ceremony for correctness-critical work.

------------------------------------------------------------------------
## 0. Two lanes, one router

**No-artifact lane:** tasks that produce no diff (questions, audits,
explanations) have no lane. Answer directly — no plan, no branch, no tripwires.

For tasks that produce a diff, scan the NINE DANGER SURFACES (see LAWS.md):
value · scope/tenancy · PII · access/auth · agent-autonomy · irreversibility
· scale · schema/migration · secrets.

- ANY surface = yes  → **HEAVY lane**. Full ceremony.
- ALL surfaces = no  → **FAST lane**. One turn, no round-trips.
- Scan genuinely ambiguous → **HEAVY**. Never stop to ask which lane.

Record the decision in one line and proceed:

    Rigor: FAST — surfaces 1-9 scanned, all no. Reason: <1 sentence>.
    Rigor: HEAVY — surface(s) <n> = yes. Reason: <1 sentence>.

**Pre-declaration rule (the only rule; §3 shows the block):** a caller's lane
declaration skips ASKING, never the SCAN. Run the scan regardless. Scan clean →
honor the declaration fully. Scan hits any surface → the declaration is void:
reject it, name the surface, flip HEAVY.

------------------------------------------------------------------------
## 1. FAST lane (the Fable lane)

Purpose: finish low-risk build/edit work in a single turn, cheaply.

Rules:
1. **No plan-first round-trip.** Plan and build in the same turn. A 3-6 line
   plan at the top of the turn is enough; then build.
2. **No divergence round-trip when Authorities exist.** If a DESIGN.md, a comp
   file, or a reference is named, this is a *conform* task: match it exactly,
   do not self-invent directions. Only when NO design authority exists do you
   produce options — and even then produce ONE default and note 1-2 alts in
   prose, don't stop.
3. **Review happens in-turn, not as a separate pass.** After building, run the
   /review tripwires (LAWS.md §review) and report pass/fail inline. No new turn.
4. **Never auto-commit.**
   - Git repo: build on a named branch, state the branch name, stop. The
     human commits.
   - No git repo: write the files in place and say so explicitly.
5. **Stay terse.** FAST lane output is the artifact + a short review note.
   No essays.

FAST lane still refuses to cross a danger surface. If mid-build a surface
turns out to be live (e.g. the "static page" needs an auth'd form), STOP,
flip to HEAVY, and say so. Downgrading rigor is a caller decision; upgrading
it is yours to enforce.

------------------------------------------------------------------------
## 2. HEAVY lane (correctness-critical)

1. **Route first**, human confirms heavy.
2. **Plan before code.** Return a plan; write no code that turn; wait for
   approval with named corrections.
3. **Divergence** for net-new UI: 2-3 directions, human picks. No self-select.
4. **After approval: build + review in ONE turn.** Run the /review tripwires
   in that same turn, report pass/fail, then STOP for human verification in a
   real environment. No commit or further action until the human signs off.
5. **No speculative commits / migrations / irreversible actions** without
   explicit human approval. Unattended runs stop AT the gate, never through it.

------------------------------------------------------------------------
## 3. One-shot authorization (how a caller unlocks FAST in one prompt)

Recognized block:

    ONE-SHOT (FAST):
      Rigor: FAST — surfaces 1-9 all no. <reason>
      Authorities: <comp file, DESIGN.md, refs>   # collapses divergence
      Authorization: build end-to-end this turn; no plan-first; no divergence.
      Commit: do NOT commit — leave on branch <name> for review.
      Review: run tripwires and report inline this turn.

Apply the pre-declaration rule (§0): scan anyway. Clean → build the whole
thing this turn, self-review, stop at the branch (or in place if no repo).
Any surface hit → declaration void: reject, name the surface, flip HEAVY.

------------------------------------------------------------------------
## 4. Context economy (Fable-friendly loading)

HEAVY loads the full pack (LAWS, CONTEXT, LEARNINGS). FAST does NOT.

- FAST lane loads only: this router + the named Authorities. Nothing else.
- Do not reload LEARNINGS/CONTEXT on a FAST task — they don't apply to
  no-surface work and only burn input tokens.
- Keep this file lean; put the long danger-surface definitions in LAWS.md and
  only pull them when a surface is yes.

**Memory protocol (load pointers, not payloads).** Full rules in Keel's
`MEMORY-CONTRACT.md` (`.claude/skills/MEMORY-CONTRACT.md`). Two that always apply:
- **Session start:** load only the `memory.md` *index* + claude-mem *search
  index* + this router. NOT the graphify graph, NOT episode bodies, NOT doc
  contents — pull those only once the task names a target.
- **Before touching a file:** query graphify (blast radius) and claude-mem
  (past decisions/bugs) on that *file/symbol*, then dedupe — if the graph
  already shows it, drop the memory line that merely restates it. One fact,
  one home; never copy structural facts into `memory.md`.

------------------------------------------------------------------------
## 5. Priority over other skills

Keel outranks lazy-loop / ponytail / caveman wherever they meet:

- Design conformance and a11y are never on the chopping block, at any
  laziness level.
- Plan and review prose (HEAVY plans, tripwire reports) is exempt from
  caveman compression — full sentences, human-readable.
- No TODO-shaped debt markers (`ponytail:` etc.) in FAST output: a deferred
  shortcut either ships done or is listed in the review note, not the code.

------------------------------------------------------------------------
## 6. Keel lanes, comprehension, and honesty (cross-cutting)

**Lanes (the toolbox).** Lane routers are **user-invoked** (zero context load) —
you reach for one by name; this arbiter names which fits. Dev conductor is
`keel-dev`. Others: `keel-design`, `keel-marketing`, `keel-content`,
`keel-research`, `keel-secure`, `keel-ops`, `keel-finance`*, `keel-legal`*
(* optional verticals). For a new project or feature, **START with a grill
session** (align before build), then bring out the lane.

**Comprehension = graphify-first.** To understand a codebase — how X works, what
depends on Y, data flow, blast radius, architecture — query **graphify**
(`query`/`path`/`explain`) instead of grep+read. Grep only for an exact known
string/symbol, a tiny throwaway scope with no `graphify-out/` yet, or an area
just edited (graph may be stale). Default graphify; grep is the exception.

**Trade-off honesty (unbiased routing).** When a route trades one axis for
another, say so in one line: direction + rough magnitude (labeled `est.` unless
measured) + the risk. Never hide the downside. No fake precision — a made-up
percentage is the bias we are killing.
