# Using Keel — new projects and upgrading existing ones

Keel has two parts. Read this first so the steps make sense.

| Part | What it is | Where | State |
|---|---|---|---|
| **Keel rules** | Instructions the agent reads: the rigor router (FAST/LIGHT vs HEAVY), laws, the dev pipeline, lane routers | `skills/`, shipped by the plugin as `/keel:<lane>`; the always-on Tier-1 router goes into `CLAUDE.md` via `keel init`; the full router + LAWS load on demand as the `keel-v2` skill (D20a) | Merged (D2, 2026-10-17): the card-set's governance (human confirms HEAVY, eleven surfaces, laws) + Model B's lanes and FAST economy, one rule set. |
| **Keel gates** (v3) | Enforcement the agent can't talk past: hooks, deny rules, CODEOWNERS, CI, a GitHub ruleset, `keel doctor` | `plugin/` (a Claude Code plugin) | **Alpha.** Tested (258 tests, adversarial review, live runs), not yet piloted on a real project. |

Keep using whichever rules your project has. Add the gates on top.

---

## 0. Before you start (once)

**You need:**
- Claude Code **2.1.295 or later** (gate hooks rely on `onFailure: "block"`; check with `claude --version`).
- Node **20+** and the GitHub CLI (`gh`), signed in.
- For **private** repos: a GitHub plan that enforces rulesets (Pro/Team or higher). On GitHub Free, private-repo rulesets aren't enforced; `keel doctor` will say so.

**Install the plugin on each machine you run Claude Code on:**

```
/plugin install keel --marketplace sayeediftekhar/Keel          # Claude Code 2.1.275+
/plugin marketplace add sayeediftekhar/Keel  +  /plugin install keel@keel   # older
```

The plugin is the whole Keel repo: the lanes arrive as `/keel:keel-dev`,
`/keel:keel-design`, …, and `plugin/` is the engine. Set an alias so the CLI
is easy to call (the plugin directory is shown by `/plugin`; in a Keel
checkout it's the repo root):

```bash
alias keel='node /path/to/keel/plugin/bin/keel.mjs'
```

**Recommended user setting** (`~/.claude/settings.json`), so nobody runs agents in a mode that skips prompts entirely:

```json
{ "permissions": { "disableBypassPermissionsMode": "disable" } }
```

**Create the agent's GitHub identity (D15), once:**
1. GitHub → Settings → Developer settings → GitHub Apps → New. Name it e.g. `sayeed-keel`.
2. Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**, **Checks: Read**, **Metadata: Read**. **Administration: No access.** No organization permissions.
3. Install it on the repos Keel will govern.
4. Point the agent's `gh` at the App instead of your account (an installation token, e.g. via a token-helper `gh` extension). Verify with `gh api user` or by checking who authored the next PR: it must be `sayeed-keel[bot]`, not you. Until this is done, `keel doctor` reports the identity as unproven, and GitHub can't tell your approval from the agent's.

> Cloud sessions (Claude Code on the web) push through the Claude GitHub connection. Check which identity a cloud session's PRs show before relying on "HEAVY needs the approver". If it's you, the `keel-rigor` check still requires *your* approval review, but GitHub's own review rules can't separate you from the agent.

---

## 1. A new project

### 1.1 Rules and scaffolds

```bash
keel init          # or /keel:keel-setup in a session
```

One command writes: a starter `keel.policy.json`; Keel's **Tier-1 router**
into `CLAUDE.md` as one managed block — the lane rule, the eleven surface
names, the two rigor record lines, the invariants by name, an authorities
index, the truth order (live > code > docs) and one `@docs/INDEX.md` import
(D20a); the *Standing authorization* + *Precedence* block (§1.6); and, only
where missing, `CONTEXT.md`, `GLOSSARY.md`, `CODING_STANDARDS.md`,
`DESIGN.md`, `LAWS.md` (your project's Iron Laws), `LEARNINGS.md` (Trap →
Rule → Why, seeded with two universal lessons), `docs/INDEX.md`,
`docs/ARCHITECTURE.md` (load-bearing pieces, module map, sequencing) and
`.scratch/README.md`. Re-running it refreshes the two blocks and touches
nothing else.

**What is always on, and what isn't.** The two blocks plus the docs index
stay within lean-context's Tier-1 budget: on a fresh repo 65 lines and ~1.45k
tokens (a conservative estimate; `init.test.mjs` and Keel's CI hold it under
80 lines / 1.5k). The full rules — the eleven surface definitions, each
invariant's two layers, the /review tripwires and the full router — are the
model-invoked `keel-v2` skill, loaded before a HEAVY call, a plan or a review.
The `doc-sync` skill drains `CONTEXT.md` and `LEARNINGS.md` at task end and
before a long session's window degrades. Fill `docs/ARCHITECTURE.md` with the
seven rungs (`docs/SYSTEMS_THINKING_FRAMEWORK.md` in the plugin) when the
project's shape is known: its module map also drives CI's boundary rule. Grill first, then fill `DESIGN.md` and `CONTEXT.md`
as in [RECIPES.md](../../RECIPES.md). The lanes need no install: they are
`/keel:keel-dev`, `/keel:keel-design`, …; each lane's upstreams are still
opt-in (`./install.sh <lane>` from the plugin directory prints the pinned
install).

### 1.2 Gates

Edit `keel.policy.json`, then run `keel init` again so the authorization block
names the approver:

| Field | Set it to |
|---|---|
| `approver.github` | your GitHub handle |
| `agentIdentity.github` | the App's bot login, e.g. `sayeed-keel[bot]` |
| `github` | `{ "owner": "...", "repo": "..." }` (otherwise taken from `origin`) |
| `surfaces` | your danger paths: money code, tenancy helpers, auth, migrations, secrets. Map the nine surfaces onto real folders. |
| `environments.live.markers` | env vars holding live credentials (`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, …) |
| `environments.live/test.supabaseProjectIds` | which Supabase projects are live and which are test |
| `environments.test.guardFile` | your test setup file (see 1.3) |
| `migrations.dirs` | where migrations live |
| `backPressure` + `checks` | the checks CI must pass, in order, e.g. `typecheck`, `lint`, `unit`, `build` |
| `ci.postgres` | `true` if tests need a Postgres service in CI |
| `quality` | the quality floor below; the defaults need no edit |

**The quality floor** (D17/D18). After your `backPressure` ladder, the
`keel-checks` job runs Keel's own checks, so "high standard" is a CI result
rather than a hope. Each has `mode: fail | warn | off` (`warn` runs the step
but doesn't fail the job); turning one down is a policy edit the approver
merges.

| Check | Default | What runs |
|---|---|---|
| `quality.audit` | `fail`, `level: high` | the lockfile's audit: `npm audit --audit-level=high`, `pnpm audit`, `yarn npm audit` (Berry) or `yarn audit` (classic). Not JavaScript? Set `command`, e.g. `pipx run --spec pip-audit==2.9.0 pip-audit -r requirements.txt` |
| `quality.secrets` | `fail`, `engine: builtin` | `keel-ci.mjs secrets`: the added lines of the diff, checked for the same credential shapes the write-time secrets gate blocks. Fixture paths go in `allowPaths`. `engine: gitleaks` downloads gitleaks 8.30.1 and checks its sha256 first |
| `quality.sast` | `off` (opt-in) | semgrep 1.178.0 with `semgrep/semgrep-rules` at a pinned commit (directories from your stack, or `rules`), plus your `.semgrep.yml`. PRs report only new findings. Costs about a minute per run |
| `quality.architecture` | `fail` | dependency-cruiser 18.4.0 with your `.dependency-cruiser.*` config. No config: `keel compile` says so and nothing is checked; write the rules (`npx dependency-cruiser --init`) and recompile |
| `quality.threatModel` | `warn` | in `keel-rigor`: a HEAVY PR's feature ledger must have a `spec.md` with a non-empty `## Threat model`. Put `Feature: <slug>` (the folder under `.scratch/`) in the PR body; otherwise Keel looks for a ledger path in the body, then the branch name. Set `fail` to make it refuse the PR |
| `quality.limits` | `warn` | clean-code limits on the files a PR changes, as a ratchet (D20e): file ≤ 400 lines, function ≤ 80 lines, line ≤ 120 characters, complexity ≤ 15, and no stable → volatile import per `docs/ARCHITECTURE.md`'s module map. A changed file may not get worse than its base; a new file meets the caps; moved code keeps its old measure. Each cap is a number or `{max, mode}`; `mode: fail` makes it block. Function length and complexity use ESLint's built-in rules (the project's ESLint ≥ 9, else a pinned one installed only when JS/TS changed); everything else is line-based. `.keel/ci/eslint.limits.mjs` is the same caps as an ESLint config to extend in your editor |

**Formatting never fails CI.** `keel compile` detects the project's formatter
(Prettier, Biome, Ruff, gofmt) or takes `quality.limits.formatter`, and a
PostToolUse hook runs it on every file the agent writes. `formatter: false`
turns it off.

**What FAST work pays.** One extra step that reads the PR's changed files: no
install unless JS/TS changed and the project has no ESLint ≥ 9; the history
fetch it needs is the one the secret scan already does. SAST and
dependency-cruiser stay opt-in.

A project compiled with the defaults gets the audit and the secret scan with no
other setup. If the first run finds high advisories, upgrade the dependencies,
or set `quality.audit.mode` to `warn` while you do and say so in the PR.

### 1.3 Test-database guard

```bash
keel guard-snippet     # paste at the top of your test setup file
```

Tests then refuse to run against anything that isn't a test database.

### 1.4 Compile, review, merge

```bash
keel compile
```

This writes `.keel/policy.lock.json`, deny rules in `.claude/settings.json`, a
Keel block in `.github/CODEOWNERS`, `.github/workflows/keel.yml`,
`.keel/ci/keel-ci.mjs` and `.keel/github-ruleset.json`. Read the notes it
prints. Commit everything in **one PR** marked `Rigor: HEAVY — governance`,
and merge it yourself.

### 1.5 Apply the ruleset (repo admin, once)

```bash
gh api -X POST repos/<owner>/<repo>/rulesets --input .keel/github-ruleset.json
```

The ruleset requires `keel-checks` and `keel-rigor`, code-owner review on danger paths, no force-push and no bypass. If you already require other CI jobs, add them in GitHub's ruleset UI afterwards (the compiler only knows Keel's two).

### 1.6 Tell the agent what it may do

Claude Code's defaults are cautious: commit or push only when asked, and in cloud sessions don't open PRs unless asked. Keel's flow (D1/D6) needs a standing authorization. `keel init` writes it (and §1.6b) into `CLAUDE.md` as a managed block, filled from the policy; `keel compile` keeps it in step. This is what it says:

```markdown
## Standing authorization (Keel v3)
- FAST work (no danger surface; "LIGHT" in the policy): commit on a feature branch, push it, open a PR
  whose description starts with the Rigor line, and enable `gh pr merge --auto`; GitHub merges on green.
- HEAVY work: open the PR with "Rigor: HEAVY — <surfaces>" and stop.
  @<your-handle> reviews and approves; auto-merge then completes it.
- Live migrations: apply to the test database first, then `keel batch create <id> <files>` and open a
  PR. After the approver merges it you may apply exactly those migrations to live, in order.
- Never use --admin, never push to main, never deploy to production.
```

### 1.6b Say which rules win

Keel is the main system; Claude Code's built-ins do the work. `keel init` writes this in the same block:

```markdown
## Precedence (Keel)
- Keel governs process (rigor, laws, gates, approvals); where it differs from Claude Code's defaults,
  follow Keel. Its gates are final: if a hook blocks, don't retry another way; take the path it names.
- For the work itself use Claude Code's built-ins (plan mode, /code-review, /security-review,
  Workflows, /loop); a lane's specialist only when the lane names one and it is installed.
```

How the two layers combine: **locks** (Keel's hooks and deny rules, Claude
Code's permission checks, GitHub rules, managed settings) all apply, and the
strictest one wins; Keel can block but never grants. **Instructions** in
CLAUDE.md and skills override Claude Code's *default behaviors* (that's what
makes the standing authorization work), but not its safety rules, the
environment's own hooks, or the locks.

### 1.7 Prove it

```bash
keel doctor
```

Every required line must read `ENFORCED` or `OK`. `UNPROVEN` means the doctor couldn't see it (no GitHub access, App identity, live-only behavior); fix what you can and re-run. Run the doctor again after any Keel or policy change.

### 1.8 Day to day

| You want… | What happens |
|---|---|
| A safe change | The agent builds it, opens a PR with a LIGHT record, enables auto-merge. It merges itself when checks pass. Skim a few LIGHT merges a day. |
| A risky change | The agent stops at a HEAVY PR. You review and approve; it merges. |
| A live migration | Agent: migration file → test DB → `keel batch create` → PR. You: merge the PR (that's the batch approval). Agent: applies to live, in order. `keel batch status` shows progress. Editing a migration after approval voids it. |
| To change the rules | You edit `keel.policy.json`, run `keel compile`, merge the PR. The agent can't edit these files. |

---

## 2. Upgrading a project that already uses Keel

Do this on a branch, as one HEAVY PR per project.

### 2.1 Projects on the Keel v2 submodule

Install the plugin (§0) and run `keel init`: it replaces the submodule's
managed block in `CLAUDE.md` with the merged rules (same markers), adds the
standing authorization, and scaffolds only what is missing. The submodule can
stay (its `.claude/skills` links keep working) or go: with the plugin, the
lanes are `/keel:<lane>`. Then follow **1.2 → 1.7**, plus these clean-ups:

1. **Remove old delegations that contradict the gates.** If `CLAUDE.md` says the agent "may commit, push and merge PRs on its own" or "applies migrations to LIVE autonomously", replace that text with the standing authorization in 1.6. Otherwise the agent reads one rule and hits another.
2. **Remove risky allow rules.** `keel compile` lists them (e.g. `Bash(printenv DATABASE_URL)`, `Bash(git … commit -m '*')`). Deny rules win anyway, but delete the allows.
3. **Point tests at a test database** before turning the gates on. If your dev `DATABASE_URL` is the live database, Keel will (correctly) block local Prisma/Drizzle migrations until it isn't.
4. **Re-run `keel init` once after upgrading past D20.** It swaps the old
   263-line rules block for the Tier-1 router (the rules are now the `keel-v2`
   skill) and adds the missing scaffolds (`LAWS.md`, `LEARNINGS.md`,
   `docs/INDEX.md`, `docs/ARCHITECTURE.md`); it never overwrites a file you
   wrote.
5. **Recompile after every plugin upgrade.** The lock carries the normalized policy, so a release that adds a policy field (the quality floor did) leaves the old lock stale until `keel compile` runs; until then the hooks apply the strictest rules.
6. **Check context files for gaming.** If a budget script caps `CONTEXT.md` by lines, Keel's `budget` CI check now also caps line length (400 characters by default), so very long lines will fail CI until split.

### 2.2 Projects with a vendored card-set Keel (`route`, `laws`, `spec`, …)

Keep the card-set; it's stricter than keel-v2 and matches the v3 decisions. Then:

1. Install the plugin and follow **1.2 → 1.7**.
2. Map each **Enforced** law in `LAWS.md` to `surfaces` paths, so CODEOWNERS and `keel-rigor` cover the files that law protects.
3. Keep your existing CI workflow; add its job names to the ruleset as extra required checks (GitHub UI), or move its commands into `backPressure`.
4. Your `CLAUDE.md` probably says "never commit without the human's go-ahead". You can keep that (Keel's gates are compatible with a stricter rule) or switch to the standing authorization in 1.6 to get LIGHT auto-merge.
5. The vendored copy is now redundant: `keel init` writes the merged router's Tier 1 into `CLAUDE.md` (the full rules are the `keel-v2` skill) and the plugin ships the lanes as `/keel:<lane>`. Delete the project copies of `route`, `laws`, `spec`, … once the block is in place (they collide with the account-level `anthropic-skills:route` and friends).

### 2.3 Order that keeps things safe

1. Test-database guard first (so nothing hits live while you work).
2. `keel compile`, one PR, you merge it.
3. Apply the ruleset.
4. `keel doctor` until green.
5. Only then add the standing authorization to `CLAUDE.md`.

---

## 3. Turning it off

- `/plugin disable keel@keel` stops the hooks on that machine. `keel doctor` reports it as BROKEN.
- Delete the `keel` ruleset in the repo's GitHub settings to remove the GitHub layer.
- The policy and generated files can stay; they do nothing without the plugin and ruleset.

---

## 4. When the agent hits a gate

Every block says which gate and what to do instead. The common ones:

| Message says | Do this |
|---|---|
| `[push] … targets main` | Push the feature branch; open a PR. |
| `[merge] … without --auto` | `gh pr merge --auto`. |
| `[migration] … not in any approved batch` | Create a batch and get the PR merged. |
| `[migration] … verified on GitHub, and that failed` | Check network and `gh auth status`; the gate fails closed when it can't see GitHub. |
| `[secrets] …` | Use a test credential; don't print or read the live one. If it blocked a *write*, the file would have contained a real-looking key: read it from an env var instead and keep the value in `.env.local`. |
| `[governance] …` | Only the approver changes Keel's files: edit the policy, `keel compile`, PR. |
| `[ledger] gate G3 … can only be approved by the human` | Review the spec/tickets, then `keel approve <feature> G3 "<why>"` in your terminal. |
| `[ledger] … Blocked on: human approval` | Approve the gate (above), or park the feature by setting `**Blocked on:** paused` in its ledger. |
| `Keel policy problem: … run keel compile` | The policy changed or the lock is missing; recompile and merge. Until then the strictest rules apply. |

False positive? Note the exact command and open an issue. If it blocks real work, adjust the policy (and recompile) rather than working around the gate.

---

## 5. Not built yet

- Live migrations applied from CI with a secret the agent never sees (the strongest form of D5).
- The forge (decision log), Keel console, KeelBench, the context router.

See [DESIGN.md](DESIGN.md) for the roadmap and [HARNESS-OVERLAP.md](HARNESS-OVERLAP.md) for how Keel fits with Claude Code's own behavior.
