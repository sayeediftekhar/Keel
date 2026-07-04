# KEEL v2 — LAWS

## The nine danger surfaces (routing truth)
A task is HEAVY if it touches ANY of these; FAST if none.

1. **Value** — real money/prices/totals computed or displayed.
2. **Scope / tenancy** — data crosses or is filtered by tenant/user.
3. **PII** — personal data read, stored, or shown.
4. **Access / auth** — anything gated by login, role, or permission.
5. **Agent autonomy** — unattended/looping execution.
6. **Irreversibility** — deletes, migrations, sends, payments, publishes.
7. **Scale** — query counts / N+1 / anything that degrades with data size.
8. **Schema / migration** — DB shape changes.
9. **Secrets** — .env, keys, tokens touched or exposed.

A static marketing/landing page, copy edits, styling, a self-contained
component with mock data, a diagram — trip none of these → FAST.

## Invariants (both lanes, non-negotiable)
- **Server enforces, not the UI.** Any client-controllable gate can be forged.
- **Identity from the session, never the request.** Bind sensitive WHEREs to it.
- **Exact money.** Decimal, never float. Tabular figures on display.
- **Immutable records** enforced at the DB (triggers), not by grants.
- **Every law names two enforcement layers.** One layer = PARTIAL, not done.

## /review tripwires (run in-turn on FAST, as a pass on HEAVY)
- [ ] No dead/unreachable code, no leftover TODOs pretending to be done.
- [ ] No secrets, keys, or real tokens in the diff.
- [ ] a11y basics: labels, contrast, focus order, alt text.
- [ ] Design conformance: tokens from DESIGN.md used, no ad-hoc hex; one focal
      point per view; none of the anti-patterns in DESIGN.md.
- [ ] If any danger surface is live, the two enforcement layers are present.
Report each as pass/fail with a one-line note. Fail = fix this turn (FAST) or
block the commit (HEAVY).
