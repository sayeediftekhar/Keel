---
name: keel-verify
description: >-
  Evidence before "done". Runs the real checks (tests, build, lint, the actual
  command or flow) and shows their output before any claim of completion.
  No output, no claim. Use at the end of any build or fix, before saying a
  task is finished, and at every keel-v2 human gate. Defers to keel-v2.
---

# Keel Verify — evidence before "done"

**A claim without the output that proves it is not a claim; it is a guess.**
This skill exists because "tests pass" typed by an agent and "tests pass"
shown by a test runner are different things, and only the second one counts.

## Deference — keel-v2 is the arbiter
Verification is how keel-v2's gates get *facts* to decide on. HEAVY §2.4
(build + review, then STOP for human verification) means: run this, paste the
evidence, then stop. FAST runs it in-turn as part of the /review note.

## The rule
1. **Run it.** The test suite, the build, the linter, the migration dry-run,
   the actual CLI invocation, the real HTTP call, the browser flow (`keel-qa` for UI). Whatever would fail if the work were wrong.
2. **Show it.** Paste the command and its *actual* output (trimmed, never
   paraphrased). Exit codes count. Red counts.
3. **Then claim.** "Done" / "passes" / "fixed" only after 1 and 2 — and the
   claim must not exceed what the output shows. 3 of 5 suites run means say
   "3 of 5", not "tests pass".
4. **Can't run it?** Say exactly what could not be run and why (no runner,
   no credentials, no network). Mark the task **unverified**. Never fill the
   gap with "should work".

## What to verify, by phase (keel-dev)
| Phase | Evidence that counts |
|---|---|
| 4 · Build (per ticket) | each acceptance criterion in `NN.md` demonstrated by a command/output, not a sentence |
| 5 · Review | the review tripwire list with pass/fail **and the check that produced it** |
| 5b · Security | VibeSec output (or, if not installed, the manual trust-boundary trace, labelled "manual, no scanner") |
| 6 · Verify/QA | full test suite + build + the real flow; UI → the `keel-qa` report |
| 7 · Ship | the Ship checklist in keel-dev §Gates with evidence per line |

## Relation to keel-qa
`keel-qa` is this discipline for UI (one row per acceptance criterion, driven
in a real browser). `keel-verify` covers everything else: tests, builds,
linters, migrations, CLIs, HTTP. Neither may be satisfied by saying it ran.

## Output shape
```
Verify — <feature/ticket>
$ <command>
<trimmed real output>
→ pass | FAIL | unverified (<reason>)
...
Claim: <no stronger than the evidence above>
```
