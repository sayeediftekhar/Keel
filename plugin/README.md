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

## What the gates stop

| Gate | Blocks | Allows |
|---|---|---|
| **push** | `git push` to a protected branch (any spelling: `HEAD:main`, `+x:refs/heads/main`, bare push while on main, `--all`, `--delete main`), GitHub MCP file writes to main | pushes to feature branches |
| **merge** | immediate merges: `gh pr merge` without `--auto`, `--admin`, the GitHub MCP `merge_pull_request` tool, direct merge API calls | `gh pr merge --auto` — GitHub merges once required checks pass and, for HEAVY changes, the approver has reviewed |
| **migration** | live migrations (Supabase/Prisma/Drizzle/Knex/psql/… and the Supabase MCP tools) unless an approved, unexpired batch covers the exact SQL, in order, already applied to test; data-changing SQL on live | test-database migrations; read-only SQL on live |
| **secrets** | `printenv`/`env`/`echo $DATABASE_URL`, scripts that print credential variables, reading `.env` files | `.env.example`, unrelated variables |
| **governance** | the agent editing its own gates: the policy, the lock, Claude settings, CODEOWNERS, the Keel workflow | everything else |
| **deploy** | production deploy commands (`vercel --prod`, `railway up`, …) | previews |

Wrapped and hidden forms are unwrapped first: `sh -c "…"`, `env X=Y …`,
`npx …`, `$(…)`, backticks, chains, and `npm run <script>` (the script body
from package.json is checked too).

Every gate hook sets `"onFailure": "block"`: Claude Code's default is to let an
action through when a hook crashes or times out, so Keel opts out of that.

## The layers, and what each can't stop

Hooks read command **text**. A program that performs the action itself (a
script calling the GitHub API, say) is invisible to them. That's why the
GitHub layer exists:

| Layer | Stops | Bypassed by |
|---|---|---|
| GitHub ruleset + CODEOWNERS + agent identity | any merge of HEAVY work, any direct push | only a repo admin — so the agent's identity must not be one |
| Database credentials | live writes from anything without them | whoever holds them |
| Permission deny rules | named commands/tools, in every permission mode | command-text tricks |
| Hooks (this plugin) | early, explained blocks before anything happens | command-text tricks; disabling the plugin or all hooks |

The hooks are the fast layer; GitHub and credentials are the wall. You need both.

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

## Live migrations: batch authorization

```bash
keel batch create 2026-10-12-fees supabase/migrations/0055_fee.sql supabase/migrations/0056_idx.sql
# commit .keel/approvals/2026-10-12-fees.json with the migrations, open a PR
# the approver merges it → the batch is approved (it lives on the default branch)
keel batch status
```

The gate then allows each live apply only if: the batch is on the default
branch, not expired, the SQL's hash matches what was approved, earlier entries
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
public repo.

## Test-database guard

`keel guard-snippet` prints a check for your test setup file that refuses to
run tests against anything but a test database. Point
`environments.test.guardFile` at that file; the doctor verifies it's there.

## Tests

```bash
node --test plugin/test/*.test.mjs
```

The suite has the gate decision table (70+ cases, including the
documented gaps), end-to-end hook runs against real git repos (including the
full batch lifecycle), compiler outputs, and doctor tests that remove each gate
in turn and check the doctor flags exactly that one.
