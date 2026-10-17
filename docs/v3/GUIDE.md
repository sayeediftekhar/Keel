# Using Keel — new projects and upgrading existing ones

Keel has two parts. Read this first so the steps make sense.

| Part | What it is | Where | State |
|---|---|---|---|
| **Keel rules** | Instructions the agent reads: the rigor router (FAST/LIGHT vs HEAVY), laws, the dev pipeline, lane routers | `skills/`, shipped by the plugin as `/keel:<lane>`; the always-on router + LAWS go into `CLAUDE.md` via `keel init` | Merged (D2, 2026-10-17): the card-set's governance (human confirms HEAVY, eleven surfaces, laws) + Model B's lanes and FAST economy, one rule set. |
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
/plugin marketplace add sayeediftekhar/Keel
/plugin install keel@keel
```

Then set an alias so the CLI is easy to call (the plugin directory is shown by `/plugin`; in a Keel checkout it's `plugin/`):

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

### 1.1 Rules (as today)

```bash
git submodule add https://github.com/sayeediftekhar/Keel .claude/skills
(cd .claude/skills && ./install.sh arbiter)        # keel-v2 rules into CLAUDE.md
(cd .claude/skills && ./install.sh dev design)     # only the lanes you use
```

Grill first, then write `DESIGN.md` and `CONTEXT.md` as in [RECIPES.md](../../RECIPES.md).

### 1.2 Gates

```bash
keel init          # writes keel.policy.json
```

Edit `keel.policy.json`:

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

Claude Code's defaults are cautious: commit or push only when asked, and in cloud sessions don't open PRs unless asked. Keel's flow (D1/D6) needs a standing authorization, so add this to `CLAUDE.md`:

```markdown
## Standing authorization (Keel v3)
- LIGHT work (no danger surface): you may commit on a feature branch, push it,
  open a PR whose description starts with a rigor record line
  ("Rigor: LIGHT — surfaces 1-11 scanned, all no."), and enable auto-merge
  with `gh pr merge --auto`. GitHub merges it when checks pass.
- HEAVY work: open the PR with "Rigor: HEAVY — <surfaces>" and stop. I review
  and approve; auto-merge then completes it.
- Live migrations: prepare them, apply to the test database, then
  `keel batch create <id> <files>` and open a PR. After I merge that PR you
  may apply exactly those migrations to live, in order.
- Never use --admin, never push to main, never deploy to production.
```

### 1.6b Say which rules win

Keel is the main system; Claude Code's built-ins do the work. Add this too:

```markdown
## Precedence (Keel)
- Keel governs process: rigor (LIGHT/HEAVY), laws, gates and approvals.
  Where these rules differ from Claude Code's default behavior, follow Keel.
- Keel's gates are final. If a hook blocks an action, don't retry it another
  way; take the path the message names, or stop and ask.
- For the work itself, use Claude Code's built-ins by default: plan mode for
  HEAVY plans, /code-review and /security-review for review, Workflows or
  /loop for parallel or unattended runs. Use a Keel lane's specialist only
  when the lane names one and it's installed; otherwise fall back to the
  built-in.
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

```bash
git submodule update --remote .claude/skills       # pulls docs/v3 and plugin/
(cd .claude/skills && ./install.sh arbiter)        # refreshes the keel-v2 block
```

Then follow **1.2 → 1.7**, plus these clean-ups:

1. **Remove old delegations that contradict the gates.** If `CLAUDE.md` says the agent "may commit, push and merge PRs on its own" or "applies migrations to LIVE autonomously", replace that text with the standing authorization in 1.6. Otherwise the agent reads one rule and hits another.
2. **Remove risky allow rules.** `keel compile` lists them (e.g. `Bash(printenv DATABASE_URL)`, `Bash(git … commit -m '*')`). Deny rules win anyway, but delete the allows.
3. **Point tests at a test database** before turning the gates on. If your dev `DATABASE_URL` is the live database, Keel will (correctly) block local Prisma/Drizzle migrations until it isn't.
4. **Check context files for gaming.** If a budget script caps `CONTEXT.md` by lines, Keel's `budget` CI check now also caps line length (400 characters by default), so very long lines will fail CI until split.

### 2.2 Projects with a vendored card-set Keel (`route`, `laws`, `spec`, …)

Keep the card-set; it's stricter than keel-v2 and matches the v3 decisions. Then:

1. Install the plugin and follow **1.2 → 1.7**.
2. Map each **Enforced** law in `LAWS.md` to `surfaces` paths, so CODEOWNERS and `keel-rigor` cover the files that law protects.
3. Keep your existing CI workflow; add its job names to the ruleset as extra required checks (GitHub UI), or move its commands into `backPressure`.
4. Your `CLAUDE.md` probably says "never commit without the human's go-ahead". You can keep that (Keel's gates are compatible with a stricter rule) or switch to the standing authorization in 1.6 to get LIGHT auto-merge.
5. The vendored copy is now redundant: `keel init` writes the merged router + LAWS into `CLAUDE.md` and the plugin ships the lanes as `/keel:<lane>`. Delete the project copies of `route`, `laws`, `spec`, … once the block is in place (they collide with the account-level `anthropic-skills:route` and friends).

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
