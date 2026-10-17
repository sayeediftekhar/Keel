# Keel — Memory Contract

A Keel project can keep state in many places. Uncontrolled, they duplicate each
other, bloat context, and — worst — **disagree**: one agent resumes from
`00-status.md`, another from an old snapshot, and they build different things.
This contract gives **each kind of information exactly one home**, says what
loads when, and settles conflicts.

Read alongside [keel-v2/CLAUDE.md](skills/keel-v2/CLAUDE.md) §4 (context economy)
and [ARCHITECTURE.md](ARCHITECTURE.md).

---

## One home per kind of information

| Kind of information | Its one home | Written by | Loaded | Disposable? |
|---|---|---|---|---|
| Code structure, dependencies, blast radius | graphify graph — `graphify-out/` | graphify, automatic | on demand, by query | **yes** — rebuilt from code |
| How to query *this* graph; dead ends | graphify LESSONS — `graphify-out/reflections/` | graphify | on demand | yes |
| Durable rules & facts (project, user, brand) | memory (`memory/*.md`, one-line index in `MEMORY.md`) + `CONTEXT.md` | human or agent, deliberately | index at session start; bodies on demand | **no** |
| Domain terms | `GLOSSARY.md` | `domain-modeling` | on demand | no |
| How code must be written | `CODING_STANDARDS.md` | human (`retro` proposes) | by `mattpocock-skills:code-review` | no |
| Feature state + gate approvals | `.scratch/<feat>/00-status.md` | agent; approvals only on the human's say-so | when resuming that feature | no, until it ships |
| The work | tickets — `.scratch/<feat>/issues/` or the tracker | `to-tickets`, `triage`, `wayfinder` | the frontier ticket only | closed when done |
| Session-boundary snapshot | the latest `handoff` doc, linked from `00-status.md` | `handoff` | when resuming | yes — the next one supersedes it |
| *Optional:* episodic history across sessions | claude-mem — `~/.claude-mem/` | its hooks | search index only | mostly — raw log |

claude-mem is an add-on (`keel-ops`), not a core layer: with it off, `00-status.md`
+ `handoff` + memory already carry a feature across sessions.

`retro` is not a store. It reads a session and sends each lesson to one home below.

### Where a lesson goes
- A rule or fact about the project, user or brand → memory / `CONTEXT.md`
- A term, or a term's meaning → `GLOSSARY.md`
- A rule about how code is written → `CODING_STANDARDS.md`
- A repeatable procedure → a skill (a Keel PR if it's about Keel itself)
- Keel-wide judgment (rigor, gates) → keel-v2, through a reviewed PR

---

## The rules

**R1 — One fact, one home.** A fact lives in exactly one row above; everything
else links to it. Never copy a structural fact into memory, a memory rule into a
handoff, or a ticket's scope into `00-status.md`.

**R2 — Load pointers, not payloads.** Session start loads only the keel-v2 router,
the memory *index*, and (if installed) claude-mem's *search index*. Not the graph,
not doc bodies, not old handoffs. Pull specifics once the task is known.

**R3 — Retrieve by file/symbol, then dedupe.** File path / symbol is the join key:
graphify for blast radius, claude-mem (if installed) for past episodes on that
node. Keep only what adds new information.

**R4 — Promote episodic → semantic.** When an episode proves to be a rule, write it
to its home (*Where a lesson goes*) and let the episode age out.

**R5 — Structural memory is disposable.** Never hand-edit graphify output or commit
it as truth; rebuild it from code.

**R6 — Freshness before trust.** A graph older than the last edit to an area gives
confident, wrong answers. `graphify update .` before reasoning over code you just
changed.

**R7 — When two homes disagree, authority decides — then fix the loser.**
- *State:* `00-status.md` (human approvals) › tickets › latest `handoff` › claude-mem.
- *Rules:* `CODING_STANDARDS.md` / `GLOSSARY.md` / `CONTEXT.md` / memory › anything episodic.

Act on the winner, then correct or delete the stale copy so the conflict can't recur.

---

## The metrics this contract serves

Optimize **cost per *finished* task**, not tokens per reply:

```
cost/finished-task = (tokens loaded × model price) × (rounds to done)
```

1. **Load less** → retrieval precision (graphify query, memory index) — R2/R3.
2. **Right the first time** → recall of relevant history + freshness — R4/R6.
3. **Cheap model where safe** → keel-v2 FAST/HEAVY routing.

| Metric | Why it's the one that matters |
|---|---|
| **Retrieval precision/recall** | Cuts tokens **and** raises accuracy at once. |
| **First-try success / rework rate** | A cheap wrong answer needing 5 corrections costs more than one good answer. |
| **Context freshness** | Stops "efficient" from meaning "efficiently wrong." |
| **Cost, not tokens** | The same tokens cost very differently across models — route cheap work cheap. |
| **Safety-gate adherence** | For HEAVY work, "accurate" includes *didn't skip the auth check*. |

You don't maximize all of these at once — you route. keel-v2's rigor router *is*
the trade-off dial.

---

## Retrieval recipes

**Cold start.** keel-v2 router + memory index (+ claude-mem search index). Stop.
Read nothing else until the task names a target.

**Resuming a feature.** `00-status.md` → the frontier ticket → the `handoff` it
links. Nothing else unless those point there.

**Targeted bug.** On the touched file/symbol: `graphify query`/`path` for blast
radius → past episodes (claude-mem, if installed) → the memory rule or
`CODING_STANDARDS.md` line that applies → dedupe into a short briefing → work.
