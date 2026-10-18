---
name: keel-setup
disable-model-invocation: true
description: Set a project up for Keel, or refresh it after a Keel update — runs `keel init` (policy, the keel-v2 rules block, the standing authorization, CONTEXT/GLOSSARY/CODING_STANDARDS/DESIGN/LAWS/LEARNINGS/docs INDEX + ARCHITECTURE/.scratch scaffolds), then walks the human through `keel compile`, the ruleset and `keel doctor`. Run by name in a new repo, or when `keel doctor` says to recompile.
---

# Keel setup — plugin install → keel init → keel compile

**User-invoked.** It writes files the human will commit; nothing here pushes,
merges or applies the GitHub ruleset. The gates are theirs to turn on.

## Where the CLI is
The plugin ships it. In a session with the plugin installed:

```bash
node "${CLAUDE_PLUGIN_ROOT}/plugin/bin/keel.mjs" <command>
```

In the submodule layout it is `node .claude/keel/plugin/bin/keel.mjs`. The
human can alias either as `keel`; for the plugin, the marketplace clone is
`~/.claude/plugins/marketplaces/keel/plugin/bin/keel.mjs`. Node 20+.

## Steps (done when the line is true)
1. **Init.** Run `keel init` from the project root. *Done when:* it prints
   the policy, the two CLAUDE.md blocks and the scaffolds it wrote or kept.
   Existing files are never overwritten; a second run only refreshes the two
   managed blocks.
2. **Policy.** Open `keel.policy.json` with the human: `approver.github`
   (their handle), `agentIdentity.github` (the GitHub App's bot login, e.g.
   `name-keel[bot]`), `surfaces` (the project's real danger paths: money,
   tenancy, auth, migrations, secrets, and the files that enforce its own
   laws), `environments`, `backPressure` + `checks` (what CI must pass, in
   order). *Done when:* no placeholder (`YOUR-`, `your-keel-app`) remains and
   every `backPressure` name has a command. Then run `keel init` again so the
   standing authorization names the approver.
3. **Scaffolds.** Fill `CONTEXT.md` (what/brand/phase), `DESIGN.md` (tokens),
   `GLOSSARY.md` (terms), `CODING_STANDARDS.md` (keep the rules that fit),
   `LAWS.md` (the project's Iron Laws), `LEARNINGS.md` (Trap → Rule → Why),
   `docs/INDEX.md` (where each doc lives) and `docs/ARCHITECTURE.md`
   (load-bearing pieces, module map).
   If the project already keeps one of these under another name (e.g.
   `docs/DOMAIN.md`), make the scaffold a one-line pointer to it — one fact,
   one home. *Done when:* each file is either filled or a pointer.
4. **Compile.** `keel compile` writes the lock, deny rules, CODEOWNERS, the
   `keel.yml` workflow and `.keel/github-ruleset.json`. Read its notes aloud
   (risky allow rules, missing GitHub remote). *Done when:* it exits 0.
5. **Hand over.** Tell the human, in this order: commit everything in one PR
   marked `Rigor: HEAVY — governance` and merge it themselves; create the
   GitHub App (docs/v3/GUIDE.md §0) if `agentIdentity` doesn't exist yet;
   apply the ruleset (`gh api -X POST repos/<owner>/<repo>/rulesets --input
   .keel/github-ruleset.json`, repo admin, once; private repos need a plan
   that enforces rulesets); then `keel doctor`. *Done when:* every required
   doctor line reads `ENFORCED` or `OK`, or the human knows exactly which
   `UNPROVEN` line waits on them.

## Existing projects
Follow the same steps. Then remove any older delegation in `CLAUDE.md`
("may commit and merge on its own", "applies migrations autonomously") —
the standing authorization block replaces it — and delete project copies of
`route`, `laws`, `review`, `spec` skills if the project carried the card-set
Keel: the plugin's `/keel:*` skills and the CLAUDE.md block are the one rule
set now. Projects compiled before the ledger and secrets-write gates existed
need one `keel compile`; until then the hooks run in strict fallback.
