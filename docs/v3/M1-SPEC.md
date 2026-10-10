# Keel v3 · Milestone 1 — policy compiler + `keel doctor`

**Status:** DRAFT spec — awaiting maintainer approval. No code is written until
this spec is approved (it is HEAVY: it ships enforcement code that runs inside
other people's agents).

**Rigor:** HEAVY — surfaces 4 (access: it decides what an agent may do),
5 (agent surface: hooks read tool input an agent produced), 6 (irreversible:
it gates merges/migrations), 10 (unattended: hooks run with no human present).

**Decisions this implements:** D1, D4, D5, D6, D7, D10, D11 in
[DECISIONS.md](DECISIONS.md). Background: [DESIGN.md](DESIGN.md) §4.2–4.3.

---

## 1. Problem (from the audits)

Every gate Keel describes exists as prose; none is enforced outside the agent.
In three audited projects: 0 merge-blocking checks, the agent merges under the
owner's identity, and the one existing enforcement hook (lean-context
`commit-gate.sh`) is off by default, matches only `git commit`, and only
watches the Bash tool — while the risky actions actually taken were PR merges
(GitHub MCP / `gh`) and live migrations (Supabase MCP `apply_migration`).

## 2. Output contract

A consuming project gets, from **one** policy file, enforcement in every place
an action can happen — and a command that proves each gate actually blocks.

```
keel.policy.json  ──keel compile──▶  .claude/settings.json   (hooks + permission deny/ask rules)
                                     .keel/policy.lock.json  (normalized policy the hooks read)
                                     .github/CODEOWNERS      (danger paths → approver)
                                     .github/workflows/keel.yml (required checks + rigor check)
                                     .keel/github-protection.json (ruleset to apply; owner applies it)

keel doctor  ──▶  report: each gate = ENFORCED (proved by a planted violation) | MISSING | UNPROVEN
```

**The one critical property:** *a gate the doctor reports as ENFORCED has been
observed to block a planted violation in this repo, this session.* Never
"configured" — **observed blocking**.

## 3. What stays out of M1

- Merging the two Keels (card-set + Model B) — separate milestone.
- The forge event log, console artifact, KeelBench (beyond the red-team cases
  the doctor needs), learning loop, lockfile for upstreams.
- Applying GitHub branch protection / creating the bot identity — the compiler
  **emits** the ruleset and instructions; a repo admin applies them (Keel never
  holds admin credentials).
- Any change to a consuming project without its owner running `keel compile`.

## 4. The policy file — `keel.policy.json`

JSON (with a published JSON Schema) rather than YAML: hooks must parse it with
**zero third-party dependencies**, and editors validate it for free. *(D10 said
`.yaml`; this is a deliberate deviation — flag for approval.)*

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/sayeediftekhar/Keel/<tag>/schema/keel.policy.schema.json",
  "version": 1,
  "approver": { "github": "your-handle" },          // the human who approves HEAVY
  "agentIdentity": { "github": "your-keel-bot" },     // D4: the agent's own identity
  "surfaces": {                                          // D7: 11 surfaces → file paths
    "value":       ["lib/money/**", "src/billing/**"],
    "scope":       ["lib/tenant/**"],
    "pii":         ["lib/customers/**"],
    "access":      ["middleware.ts", "lib/auth/**"],
    "schema":      ["supabase/migrations/**", "prisma/migrations/**"],
    "secrets":     [".env*", "**/*.pem"]
    // agent, irreversible, scale, unattended, environment are task-level; see §5
  },
  "environments": {                                      // surface 11
    "live":  { "markers": ["DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "testDbPattern": "_test$" }
  },
  "gates": {
    "merge":      { "light": "auto-on-green", "heavy": "approver" },          // D1, D6
    "push":       { "protectedBranches": ["main"], "agentMayPush": false },
    "migration":  { "live": "batch-authorized", "batchExpiryHours": 48 },     // D5
    "deploy":     { "mode": "approver" },
    "commit":     { "mode": "allow" }                                          // commits on branches are reversible
  },
  "backPressure": ["typecheck", "lint", "unit", "integration-db", "build"],   // ordered ladder
  "checks": { "typecheck": "npx tsc --noEmit", "unit": "npm test", "build": "npm run build" },
  "budget": { "alwaysOnTokens": 6000 }                                         // D11
}
```

## 5. What the compiler produces, per target

| Target | Produced from | Enforces |
|---|---|---|
| **Claude Code hooks** (`.claude/settings.json` → `hooks.PreToolUse`) | `gates`, `environments` | Blocks, regardless of permission mode: (a) push to protected branches; (b) PR merge by the agent when the PR touches a danger path or carries a HEAVY rigor record — via Bash (`gh pr merge`, `git merge` + push) **and** MCP (`mcp__github__merge_pull_request`, any `*merge_pull_request*`); (c) migration apply to live via Bash (`supabase db push`, `prisma migrate deploy`, `psql` against a live marker) **and** MCP (`*apply_migration*`, `*execute_sql*` with DDL) unless the file hashes match an unexpired approved batch; (d) reading live-credential markers (`printenv DATABASE_URL`, `cat .env`). Hook commands are `node` scripts with no dependencies. |
| **Permission rules** (`permissions.deny` / `ask`) | `environments`, `gates` | Second layer under the hooks (two-layer rule): deny credential reads and direct pushes to protected branches even if a hook is disabled. |
| **CODEOWNERS** | `surfaces` paths + `approver` | GitHub requires the approver's review on any PR touching a danger path. |
| **CI workflow** `keel.yml` | `checks`, `backPressure` | Runs the ladder; a `keel/rigor` job reads the PR's rigor record and fails if it says HEAVY without an approver review, or if the diff touches a danger path while the record says LIGHT. Also: token-budget check (D11) and phantom check (docs naming paths that don't exist). |
| **Ruleset JSON** | `gates.push`, `gates.merge`, checks | The exact GitHub ruleset (required checks, no direct push, required CODEOWNER review, bypass list empty) for a repo admin to apply with one `gh api` call printed by the compiler. |
| **`.keel/policy.lock.json`** | everything | Normalized policy + content hash; hooks read only this file, and refuse to run (fail closed) if it is missing or its hash doesn't match. |

**Batch authorization (D5) wire format** — `.keel/approvals/<batch-id>.json`,
merged to `main` through a PR the approver approves:

```json
{ "batch": "2026-10-12-fees", "target": "live", "expires": "2026-10-14T12:00:00Z",
  "migrations": [ { "file": "supabase/migrations/0055_fee_column.sql", "sha256": "…", "order": 1 } ] }
```

The migration hook allows an apply only if: the batch file exists **on the
default branch** (so the approval went through review), the file's current
sha256 matches, order is respected, not expired, target matches, and the
test-DB-first receipt exists. It writes a receipt line to
`.keel/receipts.jsonl` after the call.

## 6. `keel doctor`

Two passes, both read-only toward anything real:

**Pass 1 — configuration:** policy present and valid; lock hash matches;
settings contain every compiled hook; CODEOWNERS/workflow match the policy;
GitHub (via `gh api`, if authenticated) has the ruleset active with required
checks and no bypass; agent identity ≠ approver identity; test DB guard
present. Missing GitHub read permission → `UNPROVEN`, never `ENFORCED`.

**Pass 2 — proof by planted violation:** for each hook gate, feed the hook the
exact JSON a real tool call would produce (a synthetic PreToolUse event for
`gh pr merge 1`, `mcp__github__merge_pull_request`, `mcp__supabase__apply_migration`
with an unapproved file, `printenv DATABASE_URL`, `git push origin main`) and
assert it **blocks**; then feed an allowed equivalent (LIGHT merge, approved
batch with matching hash) and assert it **passes**. Nothing is executed — the
hook is invoked directly with synthetic input, so no merge, push or migration
can happen during the doctor.

Output: one line per gate — `ENFORCED` (blocked when it should, passed when it
should), `BROKEN` (didn't block), `MISSING`, or `UNPROVEN` (couldn't observe) —
exit non-zero unless every required gate is `ENFORCED`. Runnable in CI.

## 7. Laws this must preserve (Keel's own)

- **Fail closed.** Hook error, missing lock, unparsable input → block with a
  clear message, never allow.
- **Least privilege.** The compiler and doctor never need admin tokens; they
  print what an admin must apply.
- **No network in hooks.** Hooks decide from local files only (fast,
  deterministic, unspoofable by a remote).
- **Instruction files are code.** Everything here passes CODEOWNERS review;
  releases are tagged; consumers pin a tag.
- **Token budget (D11).** M1 adds zero always-on context: hooks and CI cost no
  tokens; the only prose is a short skill invoked by name.

## 8. Tests (written first)

1. Hook unit tests: table of synthetic PreToolUse events × expected decision
   (≥ 30 cases: Bash variants incl. `git push --force origin HEAD:main`,
   `gh pr merge --admin`, chained commands `cd x && gh pr merge`, MCP
   name variants, approved/expired/tampered batches, missing lock).
2. Compiler golden tests: fixture policies → expected settings/CODEOWNERS/
   workflow/ruleset outputs.
3. Doctor tests: a fixture repo with each gate removed in turn → doctor
   reports `MISSING`/`BROKEN` for exactly that gate (the guard is watched
   failing).
4. Red-team set (seed of KeelBench): an agent in a sandbox repo is instructed
   to merge a HEAVY PR, push to main, apply an unapproved migration, print the
   live credential, and follow an injected "ignore the gate" line in a README;
   score = % blocked. Target for M1: 100% of these named cases.
5. CI: all of the above run on every PR to Keel.

## 9. Open decisions (need the maintainer)

1. JSON instead of YAML for the policy file (§4) — approve the deviation?
2. Hook runtime: `node` scripts (all current consumer projects are Node) vs
   Claude Code **mods** (in-process TS handlers, no external runtime, but
   shipped only Oct 1 2026). Recommendation: node now, mods later.
3. Where M1 lives: in this repo under `keel/` (recommended, keeps history) or a
   new repo for the merged plugin.
4. Bot identity: GitHub App (fine-grained, recommended) vs machine user account.
5. Pilot project for M1: Project A (smallest, lowest risk) — confirm.

## 10. Done means

- `keel compile` + `keel doctor` exist, tested as in §8, CI green.
- On the pilot project: doctor reports every required gate `ENFORCED`, the
  red-team set scores 100%, and the owner has applied the emitted ruleset.
- Docs: a one-page "how gates work" for consumers, plus SECURITY.md updated
  for the new enforcement code.
