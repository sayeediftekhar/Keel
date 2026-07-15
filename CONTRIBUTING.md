# Contributing to Keel

Thanks for your interest. Keel is a **routing layer** — it curates external
skills/plugins/MCP servers and keeps them unmodified. Most contributions are new
lane routes, doc improvements, or installer fixes.

## Ground rules

- **Route, don't merge.** Don't copy an upstream's code into this repo. Add a
  reference in `manifest.json` / `catalog.md` and a thin lane router. See
  [ARCHITECTURE.md](ARCHITECTURE.md).
- **Everything through a reviewed PR.** `main` is protected; no direct pushes.
- **Keep the arbiter lean.** `skills/keel-v2/CLAUDE.md` is loaded every session —
  add detail to `LAWS.md` or a lane, not the router.

## Before you open a PR

```bash
bash -n install.sh                 # installer parses
bash evals/install-regression.sh   # installer regression (deterministic)
jq empty manifest.json             # manifest is valid JSON
```

CI runs these plus a shellcheck and a secret scan. Fill in the PR template,
especially the **security checklist** — Keel's instructions run inside other
people's agents, so a review reads `SKILL.md` / `CLAUDE.md` / `install.sh` changes
as executable behavior, not just prose.

## Reporting security issues

Not via a public issue — see [SECURITY.md](SECURITY.md).
