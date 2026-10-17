# KEEL v2 — LAWS

## The eleven danger surfaces (routing truth)
A task is HEAVY if it touches ANY of these; FAST if none. Surfaces 1-9 are
the card-set's definitions; 10 and 11 were added in Keel v3 (D7). The v3
policy (`keel.policy.json` → `surfaces`) maps them onto repo paths so
CODEOWNERS and the `keel-rigor` check enforce them outside the agent.

1. **Value** — real money/prices/totals/quantities computed or displayed.
2. **Scope / tenancy** — data crosses or is filtered by tenant/user.
3. **PII** — personal data read, stored, or shown.
4. **Access / auth** — anything gated by login, role, or permission.
5. **Agent surface** — the agent consumes untrusted input (user text, web
   pages, tool output, tickets, inbound messages) *and* can act on it.
6. **Irreversibility** — deletes, sends, payments, publishes, third-party
   writes.
7. **Scale** — unbounded queries/loops over persisted data at production N
   (N+1, missing pagination, missing index). A bounded map over a fixed API
   response is NOT this surface.
8. **Schema / migration** — DB shape changes.
9. **Secrets** — .env, keys, tokens touched or exposed.
10. **Unattended execution** — loops, routines, away-mode, scheduled runs,
    anything that keeps acting with no human present.
11. **Environment** — anything pointed at live or production data: a live
    `DATABASE_URL`, a production Supabase project, a prod deploy target.

A static marketing/landing page, copy edits, styling, a self-contained
component with mock data, a diagram — trip none of these → FAST.

## Invariants (both lanes, non-negotiable — each names its two layers)
- **Server enforces, not the UI.** Layers: server-side authorization check +
  UI state that mirrors it. UI alone can be forged.
- **Identity from the session, never the request.** Layers: session-derived ID
  bound into every sensitive WHERE + request-supplied IDs rejected at the
  handler.
- **Exact money.** Layers: decimal type in storage and compute + tabular
  figures with an explicit rounding rule on display. Never float.
- **Immutable records.** Layers: DB triggers blocking UPDATE/DELETE + an
  application layer that never issues them. Not by grants alone.
- **Live is gated, test is free.** Layers: tests and local tooling point only
  at a test database (the test-DB guard) + live migrations run only inside an
  approved batch (`keel batch`). Never "it's just a quick fix on prod".
- **One layer present = PARTIAL, not done.**

## /review tripwires (run in-turn on FAST, as a pass on HEAVY)
- [ ] No dead/unreachable code, no leftover TODOs pretending to be done.
- [ ] No secrets, keys, or real tokens in the diff.
- [ ] a11y basics: labels, contrast, focus order, alt text.
- [ ] Design conformance: tokens from DESIGN.md used, no ad-hoc hex; one focal
      point per view; none of the anti-patterns in DESIGN.md.
- [ ] If any danger surface is live, both named enforcement layers are present.
- [ ] Security-relevant diff (surfaces 3/4/5/9 — PII, auth, agent surface,
      secrets — or any trust boundary) ran the `keel-secure` gate (VibeSec);
      high-severity findings resolved, not deferred.
- [ ] Surface 10/11 diff (unattended runs, live targets): the run stops AT
      every gate, and nothing in it points at live without an approved batch.
Report each as pass/fail with a one-line note. Fail = fix this turn (FAST) or
block the PR (HEAVY).
