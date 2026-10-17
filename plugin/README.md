# Keel v3 plugin (alpha) — gates that hold

Keel v2 told the agent the rules. This plugin **enforces** them, outside the
agent's judgment, and **proves** they hold.

```
keel.policy.json ──keel compile──▶ .keel/policy.lock.json      what the gate hooks read
                                   .claude/settings.json        permission deny rules
                                   .github/CODEOWNERS           danger paths → the approver
                                   .github/workflows/keel.yml   required checks + rigor check
                                   .keel/github-ruleset.json    the GitHub ruleset an admin applies

keel doctor ──▶ every gate ENFORCED (a planted violation was blocked), or it tells you which isn't
```

Spec: [docs/v3/M1-SPEC.md](../docs/v3/M1-SPEC.md). Design: [docs/v3/DESIGN.md](../docs/v3/DESIGN.md).

## Who the gates are for (threat model)

The gates are built for an agent that is **honest but fallible**: in a hurry,
following a stale instruction, or steered by a prompt injection in something it
read. Against that agent, the gates catch the risky action however it's
spelled, explain why, and point to the approved path.

They are **not** a sandbox against a deliberately malicious program running
with your user account. Anything that runs as you can, in principle, rewrite
local files and refs. That's why the decisive checks live where the agent
can't reach:

- **GitHub** (ruleset + CODEOWNERS + a separate agent identity) decides what
  merges.
- **Live-migration approvals are read from GitHub over TLS**, not from local
  git, so a forged local ref or file approves nothing.
- **Credentials** decide what can touch production at all. The strongest setup
  runs live migrations from CI with a secret the agent never sees (planned for
  M2).

## What the gates stop

| Gate | Blocks | Allows |
|---|---|---|
| **push** | `git push` to a protected branch in any spelling we know (`HEAD:main`, `x:heads/main`, wildcard refspecs, `-c remote.origin.push=…`, `-c alias.p=push`, `--git-dir`, bare push while on main, `--all`, `--delete main`), and GitHub MCP file writes to main | pushes to feature branches |
| **merge** | immediate merges: `gh pr merge` without `--auto`, `--admin`, GraphQL/REST merge calls, `gh alias` wrappers, the GitHub MCP `merge_pull_request` tool | `gh pr merge --auto`: GitHub merges once required checks pass and, for HEAVY work, the approver has approved |
| **migration** | live schema/data changes through Supabase, Prisma, Drizzle, Knex, Sequelize, dbmate, Atlas, Flyway, Liquibase, psql (URLs, conninfo, `service=`, `-f`, stdin, `\i`) and the Supabase MCP tools (`apply_migration`, `execute_sql`, `merge_branch`), unless an approved, unexpired batch on GitHub covers the exact SQL, in order, already applied to test | test databases (decided from the command, the environment, and the project's `.env`); plain read-only SELECTs on live |
| **secrets** | printing credentials (`printenv`, `env`, `export -p`, `declare -px`, `echo $DATABASE_URL`, scripts that dump the environment, `/proc/*/environ`), reading/copying/archiving `.env*`, `.envrc`, `.dev.vars` (including globs like `.e*` and `git show HEAD:.env`), recursive searches for a credential name; **writing a credential literal** (OpenAI/Anthropic/Stripe `sk-…`, AWS `AKIA…`, PEM private keys, Slack `xox…`, GitHub `ghp_`/`github_pat_`, GitLab `glpat-`) into any file through Edit/Write/MultiEdit/NotebookEdit or the shell | `.env.example`, `.env.test`, unrelated variables; a credential written only to a real local env file (`.env`, `.env.local`); `process.env.X` references; public JWT-shaped keys |
| **governance** | the agent changing its own gates: the policy, lock, Claude settings (project and `~/.claude`), CODEOWNERS, the Keel workflow, through file tools or shell (`cd` is followed, directories that contain those files count, symlinks are resolved, case is ignored, `git checkout <old ref> -- .`/`git reset --hard <old ref>` count) | everything else, including writing a migration batch file |
| **deploy** | production deploys (`vercel --prod`, `railway up`, …), Supabase edge-function deploys to live, triggering deploy/release workflows | previews, test projects |
| **ledger** | the agent checking a gate box (`- [x] G1/G2/G3/Ship`) in a feature ledger `.scratch/<feature>/00-status.md` through the Edit/Write tools or a shell rewrite (`sed -i`, redirection, `tee`, `mv`), running `keel approve` itself, and writing any non-markdown file outside `.scratch/` while a ledger says `**Rigor:** HEAVY` and `**Blocked on:** human approval (…)` | ticking slices, adding open decisions, editing docs/tickets/markdown; everything once the human has approved (`keel approve`) or parked the feature (`Blocked on: paused`) |

Wrapped forms are unwrapped first: `sh -c`/`bash -lc -- …`, here-strings and
here-docs into a shell, `echo … | sh`, `eval`, `env`, `timeout`, `stdbuf`,
`watch`, `find -exec`, `xargs`, `npx`/`npm exec`/`pnpm`/`yarn` binaries, npm
scripts from package.json, `$(…)`, backticks, `$'…'`, `${IFS}`, and simple
variables (`G=gh; $G pr merge`). A command whose program name is only known at
run time is blocked when it looks risky.

Every gate hook sets `"onFailure": "block"`: Claude Code's default is to let an
action through when a hook crashes or times out. A project that has used Keel
and loses its lock, or whose directory disappears, also fails closed.

### Known gaps (by design)

Hooks read command text. These are invisible to them, and the GitHub layer or
credentials cover them:

- a program that performs the action itself (`node scripts/merge.js`, a shell
  script file);
- switching to an old branch whose committed policy was weaker;
- migration receipts (test-first, order) are local state that a determined
  program could forge; the GitHub-verified approval is the real check.

`plugin/test/redteam.test.mjs` holds every probe from the adversarial review
and pins these gaps down as tests, so a change in behavior is visible.

## The layers, and what each can't stop

| Layer | Stops | Bypassed by |
|---|---|---|
| GitHub ruleset + CODEOWNERS + agent identity + `keel-rigor` approval check | any merge of HEAVY work, any direct push | only a repo admin — so the agent's identity must not be one |
| Database credentials | live writes from anything without them | whoever holds them |
| Permission deny rules | named commands/tools, in every permission mode | command-text tricks |
| Hooks (this plugin) | early, explained blocks before anything happens | programs acting on their own; disabling the plugin or all hooks |

## Quick start

```bash
# 1. Install (once per machine)
/plugin marketplace add sayeediftekhar/Keel
/plugin install keel@keel

# 2. In a project
node <plugin>/bin/keel.mjs init            # writes a starter keel.policy.json
#    edit: approver, agentIdentity, danger paths (surfaces), checks
node <plugin>/bin/keel.mjs compile         # writes the files above
#    commit them in a PR and merge it
gh api -X POST repos/<owner>/<repo>/rulesets --input .keel/github-ruleset.json   # a repo admin, once
node <plugin>/bin/keel.mjs doctor          # prove it
```

`<plugin>` is the installed plugin directory (or `plugin/` in a checkout of this repo).

## Gate approvals: the human flips the box

Keel's dev pipeline keeps one ledger per feature (`.scratch/<feature>/00-status.md`,
conventions §3) with four named gates: G1 Align, G2 Spec, G3 Plan, Ship. The
agent updates everything in it except the gate boxes. You approve a gate in
your own terminal:

```bash
keel approve invoicing G3 "tickets look right, split 04 later"
```

That flips `- [ ] G3 Plan` to `- [x] G3 Plan — approved 2026-10-17 by <you>: "…"`
and clears `Blocked on: human approval (G3)`. The **ledger** gate makes the
agent unable to do the same: an Edit or Write that newly checks a gate, a shell
rewrite of the ledger, or an agent-run `keel approve` are blocked. While a
HEAVY ledger is blocked on human approval, writes to non-markdown files outside
`.scratch/` are blocked too, so spec and tickets get finished before code
exists. Set `gates.ledger.mode` to `off` to disable, or `gates.ledger.dir` if
your ledgers live elsewhere. (Projects compiled before this gate existed need
one `keel compile`: the new default changes the policy hash, and until then
the hooks run in strict fallback.)

## Live migrations: batch authorization

```bash
keel batch create 2026-10-12-fees supabase/migrations/0055_fee.sql supabase/migrations/0056_idx.sql
# commit .keel/approvals/2026-10-12-fees.json with the migrations, open a PR
# the approver merges it → the batch is approved (it lives on the default branch)
keel batch status
```

The gate then allows each live apply only if: the batch is on the default
branch **as GitHub serves it** (fetched over TLS when a live migration is
attempted; if GitHub can't be reached, the apply is blocked), not expired, the SQL's hash matches what was approved, earlier entries
were applied first, and the same SQL was applied to a test database. Receipts
go to `.keel/receipts.jsonl` (local, not committed). Editing a migration after
approval voids it.

## `keel doctor` statuses

| Status | Meaning |
|---|---|
| `ENFORCED` | a planted violation was blocked and its allowed twin passed |
| `OK` | a configuration item matches what the policy compiles to |
| `BROKEN` | present but wrong |
| `MISSING` | not there |
| `UNPROVEN` | can't be observed from here (no GitHub access, or live-only behavior) |

`keel doctor` exits non-zero unless every required item is `OK` or
`ENFORCED`. Planted violations are synthetic hook inputs: nothing is executed.

Private repos on GitHub Free can't enforce rulesets or branch protection. The
doctor reports that as `UNPROVEN`; the GitHub layer needs a paid plan or a
public repo. Without it, `gh pr merge --auto` may merge immediately.

The `keel-rigor` CI check also enforces HEAVY approval itself: a PR whose
rigor record says HEAVY stays red until the approver has approved it (the
check re-runs on each review), and a PR marked LIGHT that touches a danger
path fails.

## Test-database guard

`keel guard-snippet` prints a check for your test setup file that refuses to
run tests against anything but a test database. Point
`environments.test.guardFile` at that file; the doctor verifies it's there.

## Tests

```bash
node --test plugin/test/*.test.mjs
```

The suite (250+ tests) has the gate decision table, the red-team set from the
adversarial review (including the documented gaps), end-to-end hook runs
against real git repos (the full batch lifecycle, forged local refs, fail-closed
cases), compiler outputs, and doctor tests that remove each gate in turn and
check the doctor flags exactly that one.

Verified live on Claude Code 2.1.296: hook blocks hold in `bypassPermissions`
mode; wrapped bypasses (`cd .claude && cp …`, `bash -c -- 'gh pr merge 3'`)
are blocked; harmless commands run.
