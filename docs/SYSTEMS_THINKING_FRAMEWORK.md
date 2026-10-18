<!-- Verbatim from sayeediftekhar/builder-stack@bd8e13e docs/SYSTEMS_THINKING_FRAMEWORK.md (Keel D3/D20).
     On-demand reference: keel-dev G1/G2 walk the rungs for HEAVY features, Ship/retro runs the
     Rung 6 signals, and a project applies it in docs/ARCHITECTURE.md. Never loaded at session start. -->

# Systems Thinking for Agentic Builders

A framework for building software that stays accurate and cost-efficient as
it grows — operated by AI under your architectural direction. Distilled from
*Clean Code*, *Refactoring*, *The Pragmatic Programmer*, and *A Philosophy of
Software Design*.

**The core insight:** seasoned engineers carry these principles as instinct.
You carry them as an explicit, transferable framework. In the agentic era
explicit beats instinct — Claude Code responds to structure, not instinct.

Invoke this doc in your architect chat at project start. It produces
`docs/ARCHITECTURE.md` (the project-specific application). It is a thinking
tool for you — not a runtime instruction loaded into the agent.

---

## Rung 1 — Boundaries
**One job per piece, enforced by naming and folder structure.**

Every module, component, or folder should have one job, describable in one
sentence. If the description needs "and also," a boundary is being violated.

- **Danger signal:** you can't explain what a piece does in one sentence.
- **Agentic cost of violation:** a piece doing three jobs takes roughly the
  context, side-effect risk, and tokens of three — cost that scales with the
  number of jobs, not one. Boundaries are cost control.
- **Enforcing habit:** separate folders per concern (`/pricing`, `/bookings`,
  `/notifications`). Claude working in `/pricing` literally cannot see
  `/notifications` unless it goes there deliberately.

---

## Rung 2 — Contracts
**Clean interfaces — the only door into each room.**

A contract is what a piece *promises*: input in, output out, behavior
guaranteed. Nothing outside needs to know how the promise is kept.

- **Danger signal (vending-machine test):** can you swap the entire internal
  implementation without anything outside noticing? If no, something leaks.
- **Agentic benefit:** when Claude needs something from Pricing, there is one
  place to look and one thing to call — it cannot reach inside and break an
  internal calculation never meant to be touched.
- **Enforcing habit:** expose a small, intentional set of functions; hide
  everything else. The outside calls the interface, never the internals.

---

## Rung 3 — Change Surfaces
**Volatile things separate from stable things.**

Some parts change rarely (double-entry rules, core data shape); some change
constantly (UI, pricing rules, templates).

- **Danger signal:** a routine change touches a foundational layer — e.g. a
  pricing tweak edits database-query code.
- **Agentic cost of violation:** every volatile change drags the stable layer
  along, where bugs are born, so every change carries foundation-level risk.
- **Enforcing habit:** before every feature ask "is this stable or volatile?"
  and keep the answers in separate places. Don't bolt furniture to the
  foundation.

---

## Rung 4 — Enforce by Structure
**Wrong things hard. Right things the obvious path. Memory not required.**

The deepest idea across all four books: rules require memory; structure
doesn't forget. Three levels —

1. **Naming and folders** — how you organize files decides what Claude can
   reach. A `utils` folder holding everything creates invisible boundaries.
2. **Interfaces** — one small intentional door per module; you cannot come in
   through the wall.
3. **Impossible states** — a booking cannot be both "confirmed" and
   "cancelled" because the code has no mechanism to create that state.

- **Danger signal:** safety depends on remembering a rule rather than on the
  code making the violation unrepresentable.
- **Agentic benefit:** the wrong move is structurally unavailable, so no
  session has to remember not to make it.
- **Enforcing habit:** for every design decision ask — does this make the
  wrong move *hard or impossible*, or does it just instruct people not to?

---

## Rung 5 — Scale
**Coupling is the tax. Orthogonality is the goal. DRY is the mechanism.**

Coupling is two pieces knowing too much about each other's internals. It
accumulates silently until changing anything risks breaking everything.

- Watch two types: *knowledge coupling* (A knows B's internals — fix: A knows
  only B's interface) and *timing coupling* (A works only if B ran first —
  fix: independent pieces).
- *Orthogonality:* changing one thing has zero effect on another. *DRY:* every
  piece of knowledge has exactly one authoritative home (not "don't
  copy-paste" — one source of truth).
- **Danger signal (change radius):** one change forces edits in three-plus
  other pieces.
- **Agentic aim:** low coupling keeps each task isolated at 100 features as
  it was at 10 — the aim is to keep cost and accuracy roughly constant as you
  grow.
- **Enforcing habit:** one task = one PR = one context boundary; treat a wide
  change radius as a coupling alarm.

---

## Rung 6 — Feedback
**Signals built in that catch drift early, before it compounds.**

Systems don't break dramatically — they drift. The craft is shortening the
delay between a bad decision and the signal that catches it.

- **Three diagnostic signals:** *change radius* (1–0 healthy, 3+ = coupling);
  *explanation test* (still one sentence per piece?); *surprise test* (did
  something unconnected break? → hidden coupling).
- **Danger signal:** long functions (doing multiple jobs), many parameters
  (coupling leaking), comments explaining *what* not *why* (bad naming).
- **Response moves:** Extract Function, Extract Module, Introduce Interface.
- **Enforcing habit:** run the three signals at every task-end; when one
  flags, file it as a *separate* refactoring task — don't fix it in the same
  PR.

---

## Rung 7 — Sequencing
**Load-bearing first, thin but correct, then vertical slices in dependency
order, verified before extending.**

What you build first determines what's possible later — structurally, not
just technically.

- **Almost always load-bearing:** identity and tenancy (most load-bearing in
  a multi-tenant system), the data model, the money model, the core
  transaction. Get these wrong and the error propagates forever.
- **Danger signal:** the exciting feature gets built on an unestablished
  foundation.
- **Agentic benefit:** each vertical slice is a bounded, complete thing — its
  context is exactly that slice plus the foundation, a natural task boundary
  (one slice, one spec, one session, one PR).
- **Enforcing habit:** Phase 0 = thinnest correct version of the load-bearing
  pieces. Then one complete slice end-to-end (database → logic → interface →
  UI), verified in the real environment, before the next begins. Order slices
  by dependency, not excitement.

---

## The one-paragraph version
Keep boundaries clear so each piece has one job. Define contracts so pieces
communicate without entangling. Separate volatile from stable. Enforce
everything by structure, not memory. Manage coupling so complexity stays
bounded as you grow. Run feedback signals to catch drift early. Sequence
correctly — load-bearing foundation first, then vertical slices — so each
addition extends the system rather than straining it. And govern all of it
with an explicit harness that makes the right path obvious and the wrong path
hard, every session.

## How the rungs map to the harness
| Rung | What drifts | How the harness catches it |
|---|---|---|
| Boundaries | Pieces grow extra jobs | Explanation test; specs name the one job |
| Contracts | Internals leak out | Interface-first planning in specs |
| Change surfaces | Volatile tangles with stable | Module-assignment decision per feature |
| Enforce by structure | Rules bypass-able by memory | Iron Laws in LAWS.md; wrong states impossible |
| Scale | Coupling accumulates | Change-radius signal; one task = one PR |
| Feedback | Drift invisible until costly | Three signals at task-end; surprises logged |
| Sequencing | Foundation skipped | Phase 0 before any vertical slice |
