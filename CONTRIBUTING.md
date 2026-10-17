# Contributing to Keel

Thanks for your interest. Keel is a **routing layer** — it curates external
skills/plugins/MCP servers and keeps them unmodified. Most contributions are new
lane routes, doc improvements, or installer fixes.

## Ground rules

- **Route, don't merge.** Don't copy an upstream's code into this repo. Add a
  reference in `manifest.json` / `catalog.md` and a thin lane router. See
  [ARCHITECTURE.md](ARCHITECTURE.md).
- **New upstreams pass the entry rules** in ARCHITECTURE.md → *Which upstreams
  earn a route* (per-project install, no arbiter override, unambiguous names,
  drift-checked, earns its install). A failing one's job goes to the platform or
  a thin local skill instead.
- **Everything through a reviewed PR.** `main` is protected; no direct pushes.
- **Keep the arbiter lean.** `skills/keel-v2/CLAUDE.md` is loaded every session —
  add detail to `LAWS.md` or a lane, not the router.
- **Write skills the way Pocock's `writing-for-agents` teaches.** Describe the
  process, not the output; give every step a checkable "done when" line (see
  keel-dev's *Phase exits*); state the behaviour you want instead of the one you
  don't; keep each fact in one file and point to it; prune stale lines. A
  pointer to another file says what's there and when to open it.
- **Name upstream skills exactly.** Any Pocock skill a Keel doc names in
  backticks belongs in that upstream's `routes` list in `manifest.json`. If it
  shares a name with a Claude Code built-in, write it prefixed
  (`mattpocock-skills:code-review`) or the built-in runs instead.
  `evals/upstream-drift.sh` checks all of this against upstream.

## Before you open a PR

```bash
bash -n install.sh                 # installer parses
bash evals/install-regression.sh   # installer regression (deterministic)
jq empty manifest.json             # manifest is valid JSON
bash evals/keel-approve-regression.sh  # the human-side gate tool (deterministic)
bash evals/upstream-drift.sh       # routed upstream skills still exist (network)
```

Bumping an upstream pin is a code review of someone else's repo: run
`./install.sh pin`, read what each moved upstream changed, then PR.

CI runs these plus a shellcheck and a secret scan. Fill in the PR template,
especially the **security checklist** — Keel's instructions run inside other
people's agents, so a review reads `SKILL.md` / `CLAUDE.md` / `install.sh` changes
as executable behavior, not just prose.

## Reporting security issues

Not via a public issue — see [SECURITY.md](SECURITY.md).
