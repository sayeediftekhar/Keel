# Keel evals

The evals for the Keel pack:

| eval | what it checks | kind | run |
|------|----------------|------|-----|
| [`install-regression.sh`](install-regression.sh) | `install.sh` keeps vendored upstreams out of the host code index (the eaff95d fix): correct ignore entries, idempotent, graceful standalone | deterministic — no network, no LLM | `evals/install-regression.sh` |
| [`upstream-drift.sh`](upstream-drift.sh) | every Pocock skill Keel names (manifest `routes`) still exists upstream in a stable folder, the docs and manifest agree, and a skill sharing a Claude Code built-in's name is written with its plugin prefix | live — needs network + `gh` or `curl`; not a CI gate | `evals/upstream-drift.sh` |
| [`routing/`](routing/) | keel-v2 routes tasks to the correct lane (FAST vs HEAVY) across the eleven danger surfaces + adversarial edges | behavioral — one fresh agent per case | see [routing/README.md](routing/README.md) |
| [`lanes/`](lanes/) | the lane routers (`keel-design`, `keel-marketing`) dispatch a task to the correct specialist upstream | behavioral — one fresh agent per case | see [lanes/README.md](lanes/README.md) |
| [`gates/`](gates/) | the agent stops where a human must approve, never approves on the human's behalf (incl. a relayed bot "approval"), never commits, admits an uninstalled scanner, and does not over-block docs | behavioral — one fresh agent per case | see [gates/README.md](gates/README.md) |
| [`keel-approve-regression.sh`](keel-approve-regression.sh) | `bin/keel-approve` flips exactly one gate line with date, approver and quoted words, clears `Blocked on`, and rejects bad input | deterministic — no network, no LLM | `evals/keel-approve-regression.sh` |

## Latest results

- **install-regression.sh:** 33 / 33 pass (layout, arbiter sync with LAWS, links, settings merge, check)
- **keel-approve-regression.sh:** 8 / 8 pass
- **upstream-drift.sh:** 45 / 45 pass, 0 warnings (2026-10-17); a seeded retired name (`grill`), an undeclared name, and a bare built-in-shadowed name (`code-review`) each fail as intended
- **routing:** 14 / 14 on Opus 4.8 (2026-07) **and** 14 / 14 on Haiku (2026-10) on the nine-surface set — see [routing/RESULTS.md](routing/RESULTS.md). The set now has 17 cases (D7 added surfaces 5/10/11); the three new cases are not yet run
- **lanes:** 7 / 7 on Opus 4.8 and 7 / 7 on Haiku — see [lanes/RESULTS.md](lanes/RESULTS.md)
- **gates:** 8 / 8 on Haiku — see [gates/RESULTS.md](gates/RESULTS.md). A7 was re-specified under D2 (the agent opens the PR and stops) and is not yet re-run

## Caveat that applies to the behavioral evals

They validate **decisions** (right lane, right specialist, stop vs proceed), not
the **output quality** of third-party upstream tools, nor whether they're
installed. Single trial per case, small sets. The cheap-model re-run the first
results asked for is done (Haiku); the next useful step is N trials per case
for a variance number, and messier fixtures for the gates eval.
