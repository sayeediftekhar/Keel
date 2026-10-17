---
name: keel-qa
description: Real-browser QA for a web app before it ships — drive each acceptance criterion in a browser, check console, network, mobile layout and basic accessibility, and report pass/fail with evidence. Use at keel-dev Phase 6, or when asked to QA a running web app or a preview/staging URL.
---

# Keel QA — real-browser verification

**A procedure, not a tool.** It runs on the browsers Claude Code already has, so
there is nothing to install or keep updated. It defers to keel-v2: QA observes
and reports; fixes go back through the pipeline.

## Pick the browser
- **Built-in browser pane** (default) — isolated from the user's own sessions.
  Start the project's dev server through its launch config, read pages as text,
  take screenshots for evidence.
- **Claude in Chrome** — only when a flow needs the user's real signed-in
  session and they asked for it.
- **`agent-browser` CLI** — headless, for terminal and cloud sessions that have
  no browser pane. Run it from the shell; `agent-browser --help` has the current
  commands (check it rather than recalling flags).
- **No browser reachable** → say so and stop. A UI check that didn't run is
  reported as *not run*, never as a pass.

## 1. Scope — what "working" means
Turn the ticket's acceptance criteria (or the spec) into one row per criterion.
If there are no criteria, ask for them; don't invent the bar you test against.
*Done when:* every criterion is a row in the report.

## 2. Run the app
Prefer the local dev server; otherwise the preview/staging URL the human named.
On production, stay read-only: no form submits, purchases or data changes.
*Done when:* the app's first page loads clean — or that failure is finding #1.

## 3. Drive each criterion
Do it the way a user would, then check:
- **Result** — the visible outcome matches the criterion.
- **Console** — no new errors or unhandled rejections.
- **Network** — the flow's requests succeed (an expected 401/404 is noted, not failed).
- **Mobile** — repeat at a phone width (~375px): no sideways scroll, every control reachable.
- **Accessibility basics** — keyboard reachable, visible focus, labelled inputs and buttons, alt text on images.

*Done when:* every row has pass/fail and evidence (a screenshot or the quoted page text).

## 4. Test data
Use the project's own test accounts and seed/fixture data, on local or preview
hosts. A flow that needs a real secret, real payment or production write is a
`wizard` step for the human, not something QA types in.

## 5. Report
```
| # | Criterion | Result | Evidence | Notes |
```
Each failure gets a one-line reproduction and goes to `diagnosing-bugs` or a
ticket — QA doesn't patch in place. A fixed bug gets a regression test (`tdd`)
before its slice closes.
*Done when:* the report is saved to `.scratch/<feat>/qa.md` (or the PR body) and
`00-status.md` links it from the slice.

## Rigor
- **FAST:** the changed flow, desktop + mobile.
- **HEAVY:** every criterion in the slice, plus the flows in its blast radius
  (graphify `path` from the changed files).
