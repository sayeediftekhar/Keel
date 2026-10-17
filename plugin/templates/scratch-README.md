# .scratch/ — feature ledgers and tickets (committed)

One directory per feature: `.scratch/<feature-slug>/`.

- `00-status.md` — the gate ledger: rigor line, the four gates (`G1 Align`,
  `G2 Spec`, `G3 Plan`, `Ship`), slices, open decisions. The agent updates
  everything in it except the gate boxes; the human flips a gate with
  `keel approve <feature> <gate> "<why>"`. The Keel ledger gate blocks the
  agent from checking a box or writing product code while a HEAVY ledger
  says `Blocked on: human approval (…)`.
- `spec.md` — what the human approves at G2 (behaviour + §Architecture +
  §Threat model on HEAVY).
- `issues/NN-slug.md` — tracer-bullet tickets, or the tracker's issues.
- `qa.md` — the keel-qa report, when there is UI.

Grammar and examples: `conventions/tickets-and-context.md` in the Keel
plugin directory. Never a ledger for one-turn FAST work.
