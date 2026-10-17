# Keel conventions — tickets & shared language

Two per-project files keel-dev relies on. Both live in the **consuming project**,
not in Keel. Tracker-agnostic, zero external dependency. (Adapted from Pocock's
`to-tickets` + `domain-modeling`, made ours.)

## 1. Tracer-bullet tickets — `.scratch/<feature-slug>/issues/NN-slug.md`

`to-tickets` breaks work into **vertical slices** (a narrow but complete path
through every layer — schema → API → UI → tests), each sized to fit one fresh
context window, each declaring what **blocks** it. Numbered from `01` in
dependency order (blockers first). Work the **frontier** — any ticket whose
blockers are all done — one at a time with `implement`, clearing context between.

```
# <NN> — <Ticket title>

**What to build:** the end-to-end behaviour this makes work, from the user's
perspective — not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles that gate this one, or "None — start now".

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2
```

Rules: no stale file paths/snippets in tickets (they rot) — describe behaviour.
**Wide refactors** (one mechanical change with codebase-wide blast radius) are
the exception to vertical slicing — sequence them **expand → migrate-in-batches
→ contract**, each batch its own ticket, CI green batch to batch.

## 2. Shared language — `GLOSSARY.md` (the project glossary)

A ubiquitous-language doc so agent and human speak the same terms — fewer
tokens, consistent naming, easier navigation. Built/sharpened by
`domain-modeling`, which writes `GLOSSARY.md` (repos with several bounded
contexts get a `GLOSSARY-MAP.md` pointing at one glossary per context). Terms
only — no implementation detail. Shape:

```
# <Project> — Glossary

## Language
**<Term>**: one-line definition. _Avoid_: <synonyms not to use>

## Relationships
- A **<Term>** holds many **<Term>**

## Flagged ambiguities
- <term> was overloaded → resolved: now means <X>; <Y> is retired.
```

Merely *reading* `GLOSSARY.md` for vocabulary is a one-line pointer, not the
`domain-modeling` skill — that skill is the active build/sharpen discipline
(challenge terms, edge-case scenarios, write ADRs, update `GLOSSARY.md` inline).

Not the same file as `CONTEXT.md`: that one is the project's context/brand/rules
doc (keel-v2's HEAVY pack, the brand recipes). Older Keel projects kept the
glossary inside `CONTEXT.md` — move that section into `GLOSSARY.md` so
`domain-modeling` and the rest of the pack agree on one source of truth.

## 3. Gate ledger — `.scratch/<feature-slug>/00-status.md`

One file per feature that answers **"where are we and what's approved"** in a
single read. Tickets (`NN.md`) hold the *work*; `GLOSSARY.md` holds the
*language*; `00-status.md` holds the *state* — so a cold session resumes from
one file instead of replaying a transcript. (Adapted from the Software Factory
Playbook's `00-status.md`; keel-dev owns the phases, this is just their ledger.)

It tracks two things: which **phase gates** are approved (see keel-dev §Gates),
and which **slices** are done. Human approval is recorded here, by the human's
say-so — an agent never marks a gate `approved` on its own.

```
# <Feature> — Status

**Rigor:** FAST | HEAVY — <one-line reason from keel-v2 scan>
**Current phase:** <n · name>   **Blocked on:** <human approval | ticket NN | nothing>

## Gates
- [x] G1 Product   — approved 2026-08-08 (doc: 00-product.md)
- [x] G2 Spec/Arch — approved 2026-08-08 (docs: GLOSSARY.md, spec.md)
- [ ] G3 Design    — awaiting approval (doc: issues/)
- [ ] Ship         — not reached

## Slices
- [x] 01 — <title>
- [ ] 02 — <title>  ← frontier

## Open decisions
- <uncertain call not yet made, and who/what resolves it>
```

Rules: **one ledger per feature**, updated at every gate boundary and slice
completion. FAST features keep it to a stub (rigor line + slice checklist +
ship gate) — don't bureaucratize no-surface work. The `Open decisions` list is
where a phase parks calls it isn't confident about, so they surface for a human
instead of being silently guessed (the Software Factory "uncertain decisions"
habit).

## Handoff
To continue big work across sessions, capture state with Pocock `handoff` (or
`keel-ops` claude-mem) — and for work larger than one context, map it with
`wayfinder` as decision tickets on the same `.scratch/` convention.
`00-status.md` is the lightweight always-on ledger; `handoff` is the richer
session-boundary snapshot — the ledger points at the latest handoff, it doesn't
replace it.
