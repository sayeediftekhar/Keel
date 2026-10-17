# Keel conventions — tickets & shared language

Two per-project files keel-dev relies on. Both live in the **consuming project**,
not in Keel (`keel init` scaffolds `GLOSSARY.md` and `.scratch/README.md`).
Tracker-agnostic, zero external dependency. (Adapted from Pocock's
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

**Where tickets live.** `/setup-matt-pocock-skills` asks once per repo:

- **Local files (default)** — tickets in `.scratch/` as above. Zero setup, works
  offline; only sessions on this machine see them.
- **Tracker (GitHub/GitLab)** — `to-tickets` publishes one issue per ticket with
  the `ready-for-agent` label and native blocking links; `triage` and
  `wayfinder` work the same board. Pick this when several agents or cloud
  sessions work in parallel, or a collaborator needs to see the queue.

Either way `00-status.md` (§3) stays a local file in `.scratch/<feature-slug>/`;
in tracker mode its slice list names issue numbers instead of `NN`.

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
one file instead of replaying a transcript. (The `00-status.md` ledger and the
"park uncertain decisions for a human" habit are adapted from the Software
Factory Playbook pattern; keel-dev owns the phases, this is just their ledger.)

It tracks two things: which **gates** are approved (the four named in keel-dev
§Gates: `G1 Align`, `G2 Spec`, `G3 Plan`, `Ship` — use these names verbatim,
tooling parses them), and which **slices** are done. Human approval is recorded
here, by the human's say-so — an agent never marks a gate `[x]` on its own.

```
# <Feature> — Status

**Rigor:** HEAVY — <one-line reason from keel-v2 scan>
**Current phase:** 3 · Decompose   **Blocked on:** human approval (G3)

## Gates
- [x] G1 Align — approved <date> by <human>: "<their words>"  (docs: 00-product.md, GLOSSARY.md)
- [x] G2 Spec  — approved <date> by <human>: "<their words>"  (docs: spec.md §Architecture, §Threat model)
- [ ] G3 Plan  — awaiting approval  (docs: issues/)
- [ ] Ship     — not reached

## Slices
- [x] 01 — <title>
- [ ] 02 — <title>  ← frontier

## Open decisions
- <uncertain call not yet made, and who/what resolves it>
```

Field rules (machine-read by `bin/keel-approve` and the v3 ledger gate):
- `**Rigor:**` is `FAST` or `HEAVY`, first word after the label.
- `**Blocked on:**` is one of `human approval (G1|G2|G3|Ship)`, `ticket NN`,
  `nothing`, or `paused` (a feature parked while another is worked).
- A gate line starts `- [ ] ` or `- [x] ` followed by the gate name. An
  approved line carries the date, the approver and their quoted words.
  `bin/keel-approve <feature> <gate> "<why>"`, run by the human, writes it.

Rules: **one ledger per feature**, updated at every gate boundary and slice
completion. **When to create one:** HEAVY work, or two or more slices, or work
that will span sessions. **Never for one-turn FAST work** — that is the FAST
lane's whole point. A FAST ledger is a stub (rigor line + slices + Ship).
**`.scratch/` is committed**, not gitignored: it is the feature's decision
record and the file a fresh clone resumes from (in tracker mode the tickets
live on the board, the ledger still lives here). The `Open decisions` list is
where a phase parks calls it isn't confident about, so they surface for a
human instead of being silently guessed.

## 4. Spec with architecture + threat model — `.scratch/<feature-slug>/spec.md`

What the human approves at **G2 Spec**. `to-spec` writes the behaviour; on
HEAVY, keel-dev adds the two sections below *before* G2 so that tickets carry
the mitigations and the security pass in 5b has something to check against.
"System design" is not a label on a gate; it is these sections.

```
# <Feature> — Spec

## Behaviour
<what to-spec produced: user-facing behaviour, acceptance, out of scope>

## Architecture
**Components** — each new/changed component, one line: responsibility + owner module.
**Data flow** — the request path(s), as a list or a diagram: entry → validation →
  authz → domain → storage → response. Mark every **trust boundary** (⚠) where
  data crosses from less-trusted to more-trusted (client→server, tenant A→shared,
  external API→us, user input→query).
**State & schema** — tables/records touched, new vs changed, migration shape
  (expand→migrate→contract if live rows).
**Failure modes** — what breaks if each dependency is slow/down/wrong; the
  behaviour chosen (fail closed / retry / degrade) and why.
**Decisions** — ADR one-liners (context → decision → consequence); durable ones
  go to their home (MEMORY-CONTRACT → *Where a lesson goes*).

## Threat model
One row per ⚠ trust boundary above. STRIDE-lite: Spoofing · Tampering ·
Repudiation · Info disclosure · Denial · Elevation.

| Boundary | Threat | LAWS invariant / surface | Mitigation (both layers) | Carried by slice |
|---|---|---|---|---|
| client → /invoices POST | tampered total (T) | exact money (1) | server recomputes from line items (decimal) + UI shows server total | 02 |
| request → tenant filter | cross-tenant read (I, E) | identity-from-session (2/4) | session tenant bound in WHERE + request tenant id rejected | 01 |

Rules: a boundary with no row is a finding, not an omission. Every mitigation
names **both** enforcement layers (LAWS: one layer = PARTIAL). The "carried by"
column is checked at 5b: a threat whose slice shipped without its mitigation
blocks the Ship gate.
```

FAST work has no spec.md; HEAVY work without §Architecture and §Threat model
has not reached G2.

## Handoff
To continue big work across sessions, capture state with Pocock `handoff` (or
`keel-ops` claude-mem) — and for work larger than one context, map it with
`wayfinder` as decision tickets on the same `.scratch/` convention.
`00-status.md` is the lightweight always-on ledger; `handoff` is the richer
session-boundary snapshot — the ledger points at the latest handoff, it doesn't
replace it.
