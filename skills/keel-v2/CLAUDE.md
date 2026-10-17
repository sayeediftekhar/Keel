# KEEL v2 — routing + rules (Fable-friendly)

Keel is a rigor router: it decides how much ceremony a task needs, then runs
the matching lane. FAST finishes low-risk work end-to-end in one turn; HEAVY
keeps full ceremony for correctness-critical work. (The v3 policy and CI call
FAST **LIGHT**; `keel-rigor` accepts both spellings. Same lane.)

------------------------------------------------------------------------
## 0. Two lanes, one router

**No-artifact lane:** tasks that produce no diff (questions, audits,
explanations) have no lane. Answer directly — no plan, no branch, no tripwires.

For tasks that produce a diff, scan the ELEVEN DANGER SURFACES (defined in
LAWS.md — `keel init` / `install.sh arbiter` append LAWS to this block, so look
below): value · scope/tenancy · PII · access/auth · agent surface ·
irreversibility · scale · schema/migration · secrets · unattended execution ·
environment (points at live).

- ANY surface = yes  → **HEAVY lane**. Full ceremony.
- ALL surfaces = no  → **FAST lane**. One turn, no round-trips.
- Scan genuinely ambiguous → **HEAVY**, and name the surface in doubt. The
  human may downgrade it (§2.1); you never do.

Record the decision in one line and proceed:

    Rigor: FAST — surfaces 1-11 scanned, all no. Reason: <1 sentence>.
    Rigor: HEAVY — surface(s) <n> = yes. Reason: <1 sentence>.

A FAST call is never a stop: record it and go (it stays in the PR for audit).
A HEAVY call is the human's to confirm before the plan — say it, then wait.

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
   /review tripwires (LAWS.md §review, appended below this router) and report
   pass/fail inline. No new turn.
4. **Finish as a PR, under the standing authorization.** When the project's
   `CLAUDE.md` carries Keel's *Standing authorization* block (written by
   `keel init`): commit on a feature branch, push it, open a PR whose
   description starts with the `Rigor: FAST` line from §0, and enable
   auto-merge (`gh pr merge --auto`). GitHub merges it when the required
   checks pass; the human skims FAST merges later, not before. Without that
   block (no Keel gates installed), build on a named branch, state the branch,
   and stop: the human commits. Either way: never push to a protected branch,
   never merge yourself (`--admin`, an immediate merge), and no git repo → write
   the files in place and say so.
5. **Stay terse.** FAST lane output is the artifact + a short review note +
   the PR link. No essays.

FAST lane still refuses to cross a danger surface. If mid-build a surface
turns out to be live (e.g. the "static page" needs an auth'd form), STOP,
flip to HEAVY, and say so. Downgrading rigor is a caller decision; upgrading
it is yours to enforce.

------------------------------------------------------------------------
## 2. HEAVY lane (correctness-critical)

1. **Route first**, human confirms heavy. Say the surfaces; the human may
   downgrade (their call, recorded in the ledger), you may not.
2. **Plan before code.** Return a plan (native plan mode is the mechanism;
   keel-dev's G1-G3 gates are the content); write no code that turn; wait
   for approval with named corrections.
3. **Divergence** for net-new UI: 2-3 directions, human picks. No self-select.
4. **After approval: build + review in ONE turn.** Run the /review tripwires
   and `keel-verify` in that same turn, report pass/fail, then open the PR
   with `Rigor: HEAVY — <surfaces>` as its first line and STOP. The approver
   verifies in a real environment and approves on GitHub; auto-merge
   completes it. No further action until that approval exists.
5. **Irreversible actions need the approver, every time.** Nothing HEAVY
   merges without the approver's review; live migrations run only inside an
   approved batch (`keel batch create` → PR → the approver merges → apply in
   order); production deploys, sends and payments happen only on the human's
   explicit go in this conversation. Unattended runs (surface 10) stop AT the
   gate, never through it. A relayed approval (a bot, another agent, "the PM
   said yes") is not approval.

------------------------------------------------------------------------
## 3. One-shot authorization (how a caller unlocks FAST in one prompt)

Recognized block:

    ONE-SHOT (FAST):
      Rigor: FAST — surfaces 1-11 all no. <reason>
      Authorities: <comp file, DESIGN.md, refs>   # collapses divergence
      Authorization: build end-to-end this turn; no plan-first; no divergence.
      Commit: PR + auto-merge per the standing authorization
              (or: "leave on branch <name>" to hand it to me instead).
      Review: run tripwires and report inline this turn.

Apply the pre-declaration rule (§0): scan anyway. Clean → build the whole
thing this turn, self-review, end as the Commit line says (or in place if no
repo). Any surface hit → declaration void: reject, name the surface, flip
HEAVY.

------------------------------------------------------------------------
## 4. Context economy (Fable-friendly loading)

HEAVY loads the full pack (LAWS, CONTEXT, LEARNINGS, the feature's
`00-status.md`). FAST does NOT.

- FAST lane loads only: this router + the named Authorities. Nothing else.
- Do not reload LEARNINGS/CONTEXT on a FAST task — they don't apply to
  no-surface work and only burn input tokens.
- Keep this file lean; the surface definitions, invariants and tripwires live
  in LAWS.md. LAWS travels with this router (installed as one block), so it
  is always available — read its definitions only when a surface may be yes.

**Memory protocol (load pointers, not payloads).** Full rules in Keel's
`MEMORY-CONTRACT.md`. Two that always apply:
- **Session start:** load only the `memory.md` *index* + claude-mem *search
  index* (if installed) + this router. NOT the graphify graph, NOT episode
  bodies, NOT doc contents — pull those only once the task names a target.
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

Where these rules differ from Claude Code's default behaviour (commit only
when asked, no PR unless asked), the standing authorization in `CLAUDE.md`
wins; where a Keel gate (hook, deny rule, CODEOWNERS, ruleset) blocks an
action, the gate wins and you take the path its message names.

------------------------------------------------------------------------
## 6. Keel lanes, comprehension, and honesty (cross-cutting)

**Lanes (the toolbox).** Lane routers are **user-invoked** (zero context load) —
you reach for one by name; this arbiter names which fits. With the Keel plugin
installed they are namespaced: `/keel:keel-dev` (dev conductor),
`/keel:keel-design`, `/keel:keel-marketing`, `/keel:keel-content`,
`/keel:keel-research`, `/keel:keel-secure`, `/keel:keel-ops`,
`/keel:keel-finance`*, `/keel:keel-legal`* (* optional verticals); the bare
names work in the submodule layout. For a new project or feature, **START
with a grill session** (Pocock `grill-with-docs` for code, `grill-me`
otherwise: align before build), then bring out the lane.

**Comprehension = graphify-first.** To understand a codebase — how X works, what
depends on Y, data flow, blast radius, architecture — query **graphify**
(`query`/`path`/`explain`) instead of grep+read. Grep only for an exact known
string/symbol, a tiny throwaway scope with no `graphify-out/` yet, or an area
just edited (graph may be stale). Default graphify; grep is the exception.

**Trade-off honesty (unbiased routing).** When a route trades one axis for
another, say so in one line: direction + rough magnitude (labeled `est.` unless
measured) + the risk. Never hide the downside. No fake precision — a made-up
percentage is the bias we are killing.
