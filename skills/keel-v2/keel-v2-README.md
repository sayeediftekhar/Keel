# KEEL v2 — install & use (Fable-friendly)

## Files
- `CLAUDE.md` — the router. Drop into project root as-is
  (or `.keel/CLAUDE.md` and reference it).
- `LAWS.md`   — danger surfaces + invariants + review tripwires.
- Keep your existing `CONTEXT.md`, `LEARNINGS.md`, `DESIGN.md`.

## What changed from v1
v1 was HEAVY-only: every task paid the route→plan→diverge→review→commit tax,
so a cheap model couldn't one-shot anything. v2 adds a **FAST lane** that runs
no-danger-surface tasks end-to-end in one turn, with review in-turn and the
commit gate still human. HEAVY is untouched for correctness-critical work.

## Fable one-shot recipe (e.g. a landing page)
Paste this at the top of your single prompt:

    ONE-SHOT (FAST):
      Rigor: FAST — surfaces 1-9 all no (static marketing page).
      Authorities: DESIGN.md, <your comp file>
      Authorization: build end-to-end this turn; no plan-first; no divergence.
      Commit: do NOT commit — leave on branch feat/landing for review.
      Review: run tripwires and report inline this turn.

    Task: <what to build>

Fable then: reads the comp + tokens → builds the whole page → self-reviews →
stops on the branch. One turn, cheap. Route later polish to Sonnet/Opus.

## When it auto-upgrades
If a "FAST" task turns out to touch auth, money, tenancy, migrations, etc.,
the router STOPS and flips to HEAVY — you can't accidentally one-shot something
correctness-critical. Upgrading rigor is automatic; downgrading is only ever
your explicit call.
