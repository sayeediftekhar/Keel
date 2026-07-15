# Keel — Memory Contract

Keel has **four** memory-ish layers. Uncontrolled, they duplicate each other and
bloat context (the same failure mode as indexing vendored code). This contract
pins down **which layer owns what**, **how they compose**, and **the metrics they
are optimized against** — so retrieval stays cheap and accurate.

Read alongside [keel-v2/CLAUDE.md](skills/keel-v2/CLAUDE.md) §4 (context economy)
and [ARCHITECTURE.md](ARCHITECTURE.md).

---

## The four layers

| Layer | Owns | Shape | Written by | Lives in | Disposable? |
|---|---|---|---|---|---|
| **graphify graph** | code structure, dependencies, blast radius | structural | AST, automatic | `graphify-out/graph.json` | **yes** — regenerate from code |
| **graphify LESSONS** (`reflect`) | how to query *this* graph; dead ends | procedural | graphify, automatic | `graphify-out/reflections/` | yes |
| **claude-mem** | what happened across sessions (attempts, decisions, outcomes) | episodic | hooks, automatic | `~/.claude-mem/` (SQLite + vectors) | mostly — raw log |
| **`/memory` + `CONTEXT.md`** | durable rules & facts that must never be re-explained | semantic | you/agent, by hand | `memory/*.md`, `CONTEXT.md` | **no** — single source of truth |

**One-line mental model:** graphify is the *map*, claude-mem is the *travel log*,
`memory.md` is the *rulebook*, graphify LESSONS is *how to read the map*.

---

## The join key

Both graphify and claude-mem are addressable by **file path / symbol**. That is
the join: a task touching `billing/invoice.ts` asks *both* — graphify for blast
radius, claude-mem for past decisions/bugs on that path — keyed on the same node.
Structural + episodic on one address.

---

## The rules

**R1 — One fact, one home.** A fact lives in exactly one layer; the others link to
it. Never copy a structural fact (graphify) into `memory.md`. Never restate a
`memory.md` rule inside claude-mem.

**R2 — Load pointers, not payloads.** Session start loads only: the keel-v2 router
(tiny) + the `memory.md` *index* (one line each) + claude-mem's *search index*.
**Not** the graph, **not** episode bodies, **not** doc contents. Pull specifics
after the task is known. Progressive disclosure is the default; defeating it (eager
loading) is the redundancy bug.

**R3 — Retrieve by file/symbol, then dedupe.** Fetch only the slice each layer
holds for the touched node. If the graph already shows a structure, drop the
claude-mem line that merely restates it; keep only episodes that add *new* info
(a past bug, a rejected approach).

**R4 — Promote episodic → semantic.** When a claude-mem observation proves to be a
*rule* ("always sessions, never JWT-in-cookie here"), lift it into `memory.md` /
`CONTEXT.md` as the canonical version and let the raw episode age out. Raw log →
distilled rule.

**R5 — Structural memory is disposable.** Never hand-edit graphify output; never
commit it as truth. It is rebuilt from code. Editing it is how map and territory
drift.

**R6 — Freshness before trust.** A stale graph gives fast, cheap, confident, WRONG
answers. Rebuild (`graphify update .`) after edits to the area you're about to
reason over; a graph older than the last edit to that area is suspect.

---

## The metrics this contract serves

Optimize **cost per *finished* task**, not tokens per reply:

```
cost/finished-task = (tokens loaded × model price) × (rounds to done)
```

Three levers, each a tool you already have:

1. **Load less** → retrieval precision (graphify query, memory index, lazy claude-mem) — R2/R3.
2. **Right the first time** → recall of relevant history + freshness (claude-mem + fresh graph) — R4/R6.
3. **Cheap model where safe** → keel-v2 FAST/HEAVY routing.

The yardstick (beyond raw tokens / latency / accuracy):

| Metric | Why it's the one that matters |
|---|---|
| **Retrieval precision/recall** | The lever that cuts tokens **and** raises accuracy at once. Low precision wastes tokens; low recall gives wrong answers. |
| **First-try success / rework rate** | A cheap wrong answer needing 5 correction rounds costs more than one good answer. Measure tokens-to-done. |
| **Context freshness** | Guards accuracy — stops "efficient" from meaning "efficiently wrong." |
| **Cost, not tokens** | Same tokens on Opus vs Fable ≈ 15× cost. Route cheap work to the cheap model. |
| **Safety-gate adherence** | For HEAVY work, "accurate" includes *didn't skip the auth check / didn't float the money*. |

**You do not maximize all metrics at once — you route.** FAST favors
tokens+latency with thin context; HEAVY favors accuracy+safety and spends more.
keel-v2's rigor router *is* the metric-tradeoff dial.

---

## Retrieval recipes

**Cold start (fresh session).** Load the keel-v2 router + `memory.md` index +
claude-mem search index. Stop. Do not read the graph or episode bodies until the
task names a target. Pointers, not payloads.

**Targeted bug (a specific part of the app).** Don't grep-and-read the area.
Instead, on the touched file/symbol:
1. `graphify query`/`path <file>` → blast radius + relevant nodes.
2. `claude-mem search <file>` → past episodes touching it ("seen before?").
3. `memory.md` → the rule(s) that apply.
4. Dedupe (R3) into a short briefing; then work.

This replaces "read a lot that's mostly irrelevant" with "retrieve a little that's
relevant" — the whole token win.
