# Keel evals

Four evals for the Keel pack:

| eval | what it checks | kind | run |
|------|----------------|------|-----|
| [`install-regression.sh`](install-regression.sh) | `install.sh` keeps vendored upstreams out of the host code index (the eaff95d fix): correct ignore entries, idempotent, graceful standalone | deterministic — no network, no LLM | `evals/install-regression.sh` |
| [`upstream-drift.sh`](upstream-drift.sh) | every Pocock skill Keel names (manifest `routes`) still exists upstream in a stable folder, the docs and manifest agree, and a skill sharing a Claude Code built-in's name is written with its plugin prefix | live — needs network + `gh` or `curl`; not a CI gate | `evals/upstream-drift.sh` |
| [`routing/`](routing/) | keel-v2 routes tasks to the correct lane (FAST vs HEAVY) across the nine danger surfaces + adversarial edges | behavioral — one fresh agent per case | see [routing/README.md](routing/README.md) |
| [`lanes/`](lanes/) | the lane routers (`keel-design`, `keel-marketing`) dispatch a task to the correct specialist upstream | behavioral — one fresh agent per case | see [lanes/README.md](lanes/README.md) |

## Latest results

- **install-regression.sh:** 11 / 11 pass
- **upstream-drift.sh:** 45 / 45 pass, 0 warnings (2026-10-17); a seeded retired name (`grill`), an undeclared name, and a bare built-in-shadowed name (`code-review`) each fail as intended
- **routing:** 14 / 14 routing accuracy — see [routing/RESULTS.md](routing/RESULTS.md)
- **lanes:** 7 / 7 correct dispatch — see [lanes/RESULTS.md](lanes/RESULTS.md)

## Caveat that applies to the behavioral evals

The behavioral evals validate **decisions** (right lane, right specialist), not
the **output quality** of third-party upstream tools, nor whether they're
installed. Ran on Opus 4.8, single trial per case. Re-run on a cheaper model for
the "Fable-friendly" claim.
