# KEEL v2 — routing + rules (Fable-friendly)

Keel is a rigor router. It decides HOW MUCH ceremony a task needs, then runs
the matching lane. v2 adds a FAST lane so a cheap model (Fable) can finish a
low-risk task END-TO-END in one turn, while the HEAVY lane for correctness-
critical work is unchanged.

The mistake v1 made: every task paid HEAVY's round-trip tax (route→plan→
diverge→review→commit) even when nothing correctness-critical was at stake.
v2 fixes that: gates that exist to protect correctness only fire when a
correctness surface is actually touched. Everything else runs in one turn.

------------------------------------------------------------------------
## 0. Two lanes, one router

On every task, scan the NINE DANGER SURFACES (see LAWS.md):
value · scope/tenancy · PII · access/auth · agent-autonomy · irreversibility
· scale · schema/migration · secrets.

- ANY surface = yes  → **HEAVY lane**. Full ceremony. Slow and explicit.
- ALL surfaces = no  → **FAST lane**. One turn, no round-trips.

Record the decision in one line and proceed. Do NOT stop to ask which lane
unless the scan is genuinely ambiguous.

    Rigor: FAST — surfaces 1-9 scanned, all no. Reason: <1 sentence>.
    Rigor: HEAVY — surface(s) <n> = yes. Reason: <1 sentence>.

A caller may pre-declare the lane (see §3). A valid pre-declaration is
authoritative — the router confirms it against the surfaces and proceeds; it
does not re-litigate.

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
4. **Never auto-commit.** Build on a branch / leave changes staged. State the
   branch name and stop. The human commits. (This gate is free — no round-trip.)
5. **Stay terse.** FAST lane output is the artifact + a short review note.
   No essays.

FAST lane still refuses to cross a danger surface. If mid-build a surface
turns out to be live (e.g. the "static page" needs an auth'd form), STOP,
flip to HEAVY, and say so. Downgrading rigor is a caller decision; upgrading
it is yours to enforce.

------------------------------------------------------------------------
## 2. HEAVY lane (unchanged — correctness-critical)

1. **Route first**, human confirms heavy.
2. **Plan before code.** Return a plan; write no code that turn; wait for
   approval with named corrections.
3. **Divergence** for net-new UI: 2-3 directions, human picks. No self-select.
4. **Review** as a separate blocking pass before commit.
5. **No speculative commits / migrations / irreversible actions** without
   explicit human approval. Unattended runs stop AT the gate, never through it.

HEAVY is deliberately slow where correctness is decided. Do not optimize it.

------------------------------------------------------------------------
## 3. One-shot authorization (how a caller unlocks FAST in one prompt)

A prompt can pre-satisfy the router so nothing has cause to stop. Recognized
block:

    ONE-SHOT (FAST):
      Rigor: FAST — surfaces 1-9 all no. <reason>
      Authorities: <comp file, DESIGN.md, refs>   # collapses divergence
      Authorization: build end-to-end this turn; no plan-first; no divergence.
      Commit: do NOT commit — leave on branch <name> for review.
      Review: run tripwires and report inline this turn.

When present and consistent with the surface scan, honor it fully: build the
whole thing this turn, self-review, stop at the branch. If it conflicts with a
live danger surface, reject the FAST declaration and explain which surface.

------------------------------------------------------------------------
## 4. Context economy (Fable-friendly loading)

HEAVY loads the full pack (LAWS, CONTEXT, LEARNINGS). FAST does NOT.

- FAST lane loads only: this router + the named Authorities. Nothing else.
- Do not reload LEARNINGS/CONTEXT on a FAST task — they don't apply to
  no-surface work and only burn input tokens.
- Keep this file lean; put the long danger-surface definitions in LAWS.md and
  only pull them when a surface is yes.

------------------------------------------------------------------------
## 5. What never changes between lanes

- The nine danger surfaces are the single source of routing truth.
- The commit gate is always human (it costs no round-trip, so it's free).
- Server-side enforcement, session identity, exact money, immutable ledgers
  (LAWS.md) are invariants regardless of lane.
- Downgrading rigor is the caller's call and must be explicit; upgrading is the
  agent's duty the moment a surface goes live.
