## Keel — rigor router (always on; the full rules load on demand)
Truth order: live system (DB, schema, running app) > code > docs. On conflict the live source wins.

No diff (a question, an audit) → no lane: answer it. A diff → scan the eleven danger surfaces:
1 value · 2 scope/tenancy · 3 PII · 4 access/auth · 5 agent surface · 6 irreversibility ·
7 scale · 8 schema/migration · 9 secrets · 10 unattended execution · 11 environment (points at live).
Any yes → HEAVY. All no → FAST. In doubt → HEAVY, naming the surface; only the human downgrades.
A caller's lane declaration skips asking, never the scan. Record the call in one line and go:

    Rigor: FAST — surfaces 1-11 scanned, all no. Reason: <1 sentence>.
    Rigor: HEAVY — surface(s) <n> = yes. Reason: <1 sentence>.

FAST: plan and build in one turn, run the /review tripwires inline, finish as a PR.
HEAVY: the human confirms the call; plan before code; build + review after approval; open the PR, stop.

Invariants (both lanes; each needs two layers, one layer = PARTIAL): Server enforces, not the UI ·
Identity from the session, never the request · Exact money · Immutable records · Live is gated, test is free.

On demand, never preloaded: the `keel-v2` skill holds the surface definitions, each invariant's two
layers, the /review tripwires and the full router; load it before a HEAVY call, a plan or a review.
Lanes are user-invoked (/keel:keel-dev, keel-design, keel-secure, keel-ops, …). The `doc-sync` skill
drains CONTEXT.md and LEARNINGS.md at task end, before the window degrades.

| Authority | Path | Governs |
|---|---|---|
| Living state | CONTEXT.md | current phase, open decisions, the next-session handoff |
| Iron Laws | LAWS.md | this project's commit-blocking invariants |
| Architecture | docs/ARCHITECTURE.md | load-bearing pieces, module map (stable/volatile), sequencing |
| Lessons | LEARNINGS.md | trap → rule → why |
| Terms · standards · design | GLOSSARY.md · CODING_STANDARDS.md · DESIGN.md | words, code, UI |
| Governance | keel.policy.json | danger paths, gates, CI checks (the approver's file) |
| Everything else | docs/INDEX.md | topic → file, imported below |
