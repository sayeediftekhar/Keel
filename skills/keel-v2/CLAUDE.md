# KEEL v2 — rigor router (always on)

Keel decides how much ceremony a task needs, then runs the matching lane: FAST
finishes low-risk work in one turn; HEAVY keeps full ceremony for
correctness-critical work.

`LAWS.md` (`.claude/skills/skills/keel-v2/LAWS.md`) defines each danger surface,
the two-layer invariants and the /review tripwires — open it when a surface is
borderline or yes, and for every review.

## 0. Pick the lane

A task with no diff (question, audit, explanation): answer directly, outside
both lanes.

A task with a diff: scan all NINE DANGER SURFACES — value · scope/tenancy · PII
· access/auth · agent-autonomy · irreversibility · scale · schema/migration ·
secrets.

- Any surface yes → **HEAVY** (§2).
- All surfaces no → **FAST** (§1).
- Scan genuinely ambiguous → **HEAVY**, and proceed without asking.

The scan is done when this line is written; then proceed:

    Rigor: FAST — surfaces 1-9 scanned, all no. Reason: <1 sentence>.
    Rigor: HEAVY — surface(s) <n> = yes. Reason: <1 sentence>.

**Pre-declaration rule.** A caller's lane declaration (e.g. the §3 block)
replaces asking, never the scan. Scan regardless: clean → honor the declaration
fully; any surface hit → the declaration is void: reject it, name the surface,
go HEAVY.

## 1. FAST lane

1. **Plan and build in one turn.** Open with a 3–6 line plan, then build.
2. **Conform to Authorities.** A named DESIGN.md, comp file or reference makes
   this a conform task: match it exactly. With no Authority, build one default,
   note 1–2 alternatives in prose, and keep going.
3. **Review in the same turn.** Run the /review tripwires; done when each has a
   pass/fail line in this reply.
4. **The human commits — never auto-commit.** Git repo: build on a named
   branch, state its name, stop. No repo: write the files in place and say so.
5. **Output = the artifact + a short review note.**

**Escalation.** When a surface turns live mid-build (e.g. the "static page"
needs an auth'd form), stop, say so, and continue in HEAVY. Only the caller
downgrades rigor; you enforce upgrades.

## 2. HEAVY lane

1. **Route first**; the human confirms HEAVY.
2. **Plan before code.** This turn returns a plan only; code starts once the
   human approves it (with any named corrections).
3. **Divergence** for net-new UI: offer 2–3 directions; the human picks.
4. **After approval, build + review in ONE turn**: run the tripwires, report
   pass/fail, then stop for the human to verify in a real environment. Commits
   and further actions wait for their sign-off.
5. **Commits, migrations and irreversible actions wait for explicit human
   approval.** Unattended runs stop at the gate.

## 3. One-shot authorization (unlock FAST in one prompt)

    ONE-SHOT (FAST):
      Rigor: FAST — surfaces 1-9 all no. <reason>
      Authorities: <comp file, DESIGN.md, refs>   # collapses divergence
      Authorization: build end-to-end this turn; no plan-first; no divergence.
      Commit: do NOT commit — leave on branch <name> for review.
      Review: run tripwires and report inline this turn.

The §0 pre-declaration rule applies. Clean scan → build it all this turn,
self-review, stop at the branch (in place if no repo).

## 4. Context economy

- **HEAVY** loads the full pack: LAWS, CONTEXT, LEARNINGS.
- **FAST** loads this router, the named Authorities and the LAWS tripwires —
  nothing more.

**Memory: load pointers, not payloads.** `.claude/skills/MEMORY-CONTRACT.md`
holds the full rules (which layer owns which fact, promotion, freshness) — open
it before writing to memory. Two apply every session:
- **Session start:** load the `memory.md` index, the claude-mem search index and
  this router. Pull the graphify graph, episode bodies and doc contents once the
  task names a target.
- **Before touching a file:** query graphify (blast radius) and claude-mem (past
  decisions, bugs) on that file/symbol; keep only the memory lines the graph
  doesn't already show. Structural facts live in the graph, never in
  `memory.md`.

## 5. Priority over other skills

Where Keel meets lazy-loop / ponytail / caveman, Keel wins:
- Design conformance and a11y hold at every laziness level.
- HEAVY plans and tripwire reports are exempt from caveman compression: full,
  human-readable sentences.
- A deferred FAST shortcut ships done or is listed in the review note — no
  TODO-shaped markers (`ponytail:` etc.) in code.

## 6. Lanes, comprehension, honesty (cross-cutting)

**Lanes.** Lane routers are user-invoked (zero context load); name the one that
fits so the human can run it: `keel-dev` (dev conductor), `keel-design`,
`keel-marketing`, `keel-content`, `keel-research`, `keel-secure`, `keel-ops`,
`keel-finance`*, `keel-legal`* (*optional). A new project or feature starts
with a `grill-with-docs` session (align before build), then the lane.

**Comprehension = graphify-first.** To understand a codebase (how X works, what
depends on Y, data flow, blast radius, architecture), query graphify
(`query`/`path`/`explain`). Grep is for an exact known string/symbol, a tiny
throwaway scope with no `graphify-out/` yet, or a just-edited area where the
graph may be stale.

**Trade-off honesty.** When a route trades one axis for another, say so in one
line: direction, rough magnitude (a measured number, or a coarse one marked
`est.`), and the downside risk.
