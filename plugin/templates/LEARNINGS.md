# Learnings: <Project>

Traps hit and the rules that prevent recurrence. Add an entry whenever something breaks in a way
worth never repeating (keel-dev's retro and the doc-sync skill file them here). Format: Trap → Rule → Why.

L1 and L2 are universal; they belong in every project. Keep them; add your own as L3 onward.

---

## L1 — Green tests aren't working software
**Trap:** Tests passed, so the work was called done — but the feature did not
actually work in the real environment.
**Rule:** Verify every change in the real environment before calling it done.
Green tests are evidence, not proof.
**Why:** Tests check what you thought to assert. The real environment checks
what's actually true — integration, config, data, and the paths you didn't
think to test.

---

## L2 — Confirm facts, don't assume them
**Trap:** Acted on an assumed schema / API shape / config value that turned
out to be wrong, and built on top of the mistake before it surfaced.
**Rule:** Confirm facts against the live source (DB, schema, running system)
before building on them. Truth order: live source > code > prose docs.
**Why:** An unconfirmed assumption early becomes an expensive unwind later.
The cheapest moment to check a fact is before you depend on it.
