# Iron Laws: <Project>

<!--
  This project's own commit-blocking invariants (Keel's universal ones — server enforces,
  identity from the session, exact money, immutable records, live is gated — are in the
  keel-v2 skill; don't repeat them here). A law earns a place only if it is ALL THREE of:
    1. An invariant, not a preference: it must ALWAYS hold, no exceptions.
       "Prefer small functions" is a preference. "Every table row carries a
       tenant_id" is an invariant.
    2. Enforced in two layers: a structural mechanism (schema constraint, type,
       interface, folder boundary) AND a check (test, lint, CI gate, Keel gate).
       One layer alone is a rule that memory can bypass.
    3. Checkable per PR: you can point at a single PR and say yes/no, this law
       holds. If you cannot check it in one PR, it is a goal, not a law.
  Keep the list to 4–8. More than 8 means some are really preferences.
-->

1. **<Law name>:** <what must always hold>
   - Structural enforcement: <how structure makes the violation hard or impossible>
   - Per-PR check: <how one PR shows it holds>
