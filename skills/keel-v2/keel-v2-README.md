# KEEL v2 — install & use (Fable-friendly)

## Files
- `CLAUDE.md` — the router.
- `LAWS.md`   — danger surfaces + invariants + review tripwires.
- Install both with `keel init` (plugin) or `./install.sh arbiter` (submodule
  layout) from a consuming project: either writes ONE managed block (router +
  laws) into the host `CLAUDE.md`. Pasting only `CLAUDE.md` leaves the agent
  with surface *names* and no definitions.
- Keep your existing `CONTEXT.md`, `LEARNINGS.md`, `DESIGN.md` (`keel init`
  scaffolds the ones you don't have yet).

## What changed from v1
v1 was HEAVY-only: every task paid the route→plan→diverge→review→commit tax,
so a cheap model couldn't one-shot anything. v2 adds a **FAST lane** that runs
no-danger-surface tasks end-to-end in one turn, with review in-turn. HEAVY is
untouched for correctness-critical work.

## What changed with v3 (D2, 2026-10-17)
The card-set Keel and Model B are one rule set now. Who decides rigor: the
agent records FAST and proceeds (D6); HEAVY is the human's to confirm, and
only the human may downgrade. What happens at the end: FAST ends as a PR that
auto-merges on green under the project's *Standing authorization*; HEAVY ends
as a PR the approver reviews (D1). Eleven surfaces, not nine (D7). The gates
that make this safe are the v3 plugin (`plugin/`, `keel doctor`); without
them, the router falls back to "stop at the branch, the human commits".

## Fable one-shot recipe (e.g. a landing page)
Paste this at the top of your single prompt:

    ONE-SHOT (FAST):
      Rigor: FAST — surfaces 1-11 all no (static marketing page).
      Authorities: DESIGN.md, <your comp file>
      Authorization: build end-to-end this turn; no plan-first; no divergence.
      Commit: PR + auto-merge per the standing authorization.
      Review: run tripwires and report inline this turn.

    Task: <what to build>

Fable then: reads the comp + tokens → builds the whole page → self-reviews →
opens the PR (or stops on the branch if you said so). One turn, cheap. Route
later polish to Sonnet/Opus.

## When it auto-upgrades
If a "FAST" task turns out to touch auth, money, tenancy, migrations, a live
target, etc., the router STOPS and flips to HEAVY — you can't accidentally
one-shot something correctness-critical. Upgrading rigor is automatic;
downgrading is only ever your explicit call.
