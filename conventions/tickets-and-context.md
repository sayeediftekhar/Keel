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

## 2. Shared language — `CONTEXT.md` (the project glossary)

A ubiquitous-language doc so agent and human speak the same terms — fewer
tokens, consistent naming, easier navigation. Built/sharpened by
`domain-modeling`. Shape:

```
# <Project> — Context

## Language
**<Term>**: one-line definition. _Avoid_: <synonyms not to use>

## Relationships
- A **<Term>** holds many **<Term>**

## Flagged ambiguities
- <term> was overloaded → resolved: now means <X>; <Y> is retired.
```

Merely *reading* `CONTEXT.md` for vocabulary is a one-line pointer, not the
`domain-modeling` skill — that skill is the active build/sharpen discipline
(challenge terms, edge-case scenarios, write ADRs, update `CONTEXT.md` inline).

## Handoff
To continue big work across sessions, capture state with Pocock `handoff` (or
`keel-ops` claude-mem) — and for work larger than one context, map it with
`wayfinder` as investigation tickets on the same `.scratch/` convention.
