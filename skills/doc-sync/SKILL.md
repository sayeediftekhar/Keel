---
name: doc-sync
description: >-
  Keep a project's living docs drained so they stay cheap to load. Use at the
  end of a task, at a natural chunk boundary in a long session (before the
  context window degrades, not after), before handing work to a new session,
  or when CONTEXT.md, LEARNINGS.md or the always-on CLAUDE.md has grown past
  its budget. Sorts every line with the lesson / history / state test, moves
  shipped records out verbatim, kills superseded warnings, checks numeric
  budgets, and writes a short next-session handoff.
---

# doc-sync — drain the living docs, hand off early

A one-time cleanup regrows. The migration is worth less than the rule that
keeps it drained. This skill is that rule: run it at the end of a task and
**before the window rots**, at a natural boundary, not after quality has
already dropped. The end of a long session is the worst moment to trust an
agent to write a clean handoff, so sync a beat early.

## 1. The three-way test (ask it of every line you touch)

> **Would a future task do something *differently* because of it?** → it is a
> **lesson**. It goes to `LEARNINGS.md` as Trap → Rule → Why.
> **Does it merely record that something happened?** → it is **history**. It
> goes to the receipt ledger, `docs/HISTORY.md`.
> **Is it still true and still constraining work?** → it is **state**. It stays
> in `CONTEXT.md`.

Three files, three lifetimes. Most "context bloat" is history wearing state's
clothing.

**The receipt ledger** (`docs/HISTORY.md`; create it on first use and add a
row to `docs/INDEX.md`) is a table, not a narrative:
task · date · PR · merge SHA · test count · spec path, one row per shipped
thing, with the verbatim record beneath. It earns its place only by holding
what git does not: which spec covers it, what a human verified in the real
environment, what got deferred and where.

## 2. The drain (in this order)

1. **Hoist live carry-forwards first.** Before moving any block, sweep it for
   `STILL OPEN`, `PARKED`, `CARRY FORWARD`, `DEFERRED`, `NEXT`, `MUST`, `TODO`
   and lift those lines into `CONTEXT.md` (Open questions / What's next).
2. **Move shipped records out.** Merged, no live carry-forward → it is history:
   move it to `docs/HISTORY.md` verbatim.
3. **Kill superseded warnings.** A resolved constraint that still reads as live
   is worse than clutter — it actively misleads. Delete it (git keeps it) or,
   if it carries a lesson, rewrite it as a LEARNINGS entry.
4. **Check the budget against a number.** "Keep it tidy" is not a rule; a
   number is:
   - `CONTEXT.md` — its own header's limit (the Keel template says under 40
     lines); never past ~250 lines, the point at which a drain is overdue.
   - `LEARNINGS.md` — ~250 lines; past that, merge duplicate rules.
   - always-on context (`CLAUDE.md` + its `@` imports) — `budget.alwaysOnTokens`
     in `keel.policy.json`. Run `node .keel/ci/keel-ci.mjs budget` and quote its
     output; the number is a labeled estimate unless measured with a tokenizer.
5. **Run the guards.** `keel-ci.mjs budget` and `phantom` (no doc names a path
   that doesn't exist), plus any project check that covers the docs.
6. **Never summarize a record to shrink it.** This is re-filing, not
   rewriting: move verbatim. Unsure whether a line is live? Keep it and flag it.

## 3. The handoff (what the next session reads first)

Update `CONTEXT.md` → *Current phase*, *What's next*, *Open questions* with a
**summary**: decisions made, current state, the one open question. Not a
transcript dump. For a HEAVY feature, the ledger (`.scratch/<feature>/00-status.md`)
is the resume file: make sure its phase, *Blocked on* and *Open decisions* lines
are current. Then say in one line that the handoff is written and what the next
session should open first.

## Done when

Every touched file is within its number, nothing settled is still in
`CONTEXT.md`, each new lesson is a Trap → Rule → Why entry, the guards ran
(output quoted), and the handoff names the next step. A rule that blocks
nothing is a preference: if a state file still holds a settled record, the
sync is not done.

Keel's rules outrank this skill (keel-v2). Changing `CLAUDE.md`'s Keel blocks
is `keel init`'s job, not this skill's; edit only the project's own lines.
