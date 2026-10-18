# Keel v3 — decision log (brainstorm, 2026-10-10)

Nothing implemented. Decisions taken by Sayeed during the brainstorm session.

| # | Decision | Implication |
|---|---|---|
| D1 | Human merges only HEAVY work | LIGHT auto-merges on green required checks |
| D2 | Merge both Keels | Card-set governance (route/laws/spec/verify-fact/review/tdd/agent-security/performance/design/handoff/away) + Model B lane routing |
| D3 | One plugin | Keel + lean-context + builder-stack ship as one installable, one version, pinned per project |
| D4 | Agent gets its own GitHub identity | Bot/App pushes + opens PRs; Sayeed approves HEAVY; enforce via path-based CODEOWNERS or a rigor status check |
| D5 | Agents run live migrations with permission, batch-authorized | Approval = named batch of migration files + content hashes + target + expiry; PreToolUse hook on the migration tool (MCP or shell) checks hash/order/expiry + test-DB-first + backup/rollback; receipt in ledger |
| D6 | LIGHT work: no confirmation stop | Agent records LIGHT + scan, proceeds, auto-merges on green; LIGHT calls auditable later |
| D7 | Surfaces: card-set definitions + two extras | 5 = agent consumes untrusted input and can act; 7 = hot path/large data; ADD "unattended execution" and "environment points at live" |
| D8 | Keep only upstreams actually used | Pinned by commit in a lockfile; needs usage evidence first |

Guiding principle (Sayeed): as safe as possible without costing disproportionate human time —
spend human attention only where it buys safety; batch it.

Evidence base: read-only audits of three private projects (reports kept private)
+ read of lean-context and builder-stack.

## Strategy decisions (later in session)

| # | Decision | Implication |
|---|---|---|
| D9 | Keel v3 is a public product | Open source, Claude plugin directory listing, KeelBench results published; signed releases + reviewed PRs (it ships agent instructions to strangers) |
| D10 | Milestone 1 = policy compiler + `keel doctor` | One `keel.policy.yaml` compiled to hooks (Bash + MCP), CI, CODEOWNERS, branch-protection settings, deny-lists; doctor proves each gate blocks by planting violations |
| D11 | Hard token budget for the core | Always-on context ceiling checked in CI; lanes opt-in; prune unused skills each release |

Positioning: Keel = the control plane above Claude Code built-ins and upstream packs —
decides what may happen, enforces it, records it, learns from it. "Strongest" is measured by
KeelBench (red-team block rate, erosion over iterations, portfolio audit deltas, human minutes per change).

## M1 spec decisions

| # | Decision | Implication |
|---|---|---|
| D12 | Policy file is JSON + published JSON Schema | `keel.policy.json`; zero-dependency parsing in hooks (supersedes the `.yaml` name in D10) |
| D13 | Gate scripts are dependency-free Node scripts | Revisit Claude Code mods once they mature |
| D14 | Keel v3 lives in this repo | Lands as a new major version; Model B layout migrates in place |
| D15 | Agent identity is a GitHub App | Fine-grained per-repo permissions, short-lived tokens, never a repo admin |

## D2 applied (2026-10-17)

| # | Decision | Implication |
|---|---|---|
| D2a | Who decides rigor: the agent records FAST and proceeds; HEAVY is the human's to confirm, and only the human may downgrade | keel-v2 §0, §2.1. The card-set's model, as HARNESS-OVERLAP §5 recommended; D6 kept |
| D2b | How work ends: FAST → PR with the rigor record, auto-merge on green; HEAVY → PR, the approver reviews on GitHub, auto-merge completes it; deploys/sends/live migrations stay human (batch or explicit go) | keel-v2 §1.4, §2.4-2.5; keel-dev Ship gate. Depends on the *Standing authorization* block `keel init` writes; without it the router falls back to "stop on the branch, the human commits" |
| D2c | Eleven surfaces (D7) are the routing truth in LAWS.md; surface 5 is the agent surface, 10 unattended execution, 11 environment points at live | Routing eval has H5/H10/H11; `keel.policy.json` → `surfaces` maps them to paths |
| D2d | Lane names stay (`keel-dev`, …); FAST keeps its name, LIGHT is the policy/CI spelling (`keel-rigor` accepts both) | No rename churn across projects; one lane, two spellings |

*Applied from the recorded recommendations (HARNESS-OVERLAP §5/§7, D1, D6, D7); confirmed by Sayeed 2026-10-17.*

## Upstream decisions

| # | Decision | Implication |
|---|---|---|
| D16 | Add supabase/agent-skills as a pinned, opt-in stack upstream | Pinned to c9be0e9; installed only on Supabase/Postgres projects; keel-dev and keel-secure name it explicitly (its own evals show ~60% auto-activation); Keel's gates still govern live data. Prompted the `supabase db query` gate. |

## Quality floor (2026-10-18)

The gates hard-enforce agent *safety*; code quality, architecture and app security were only
shaped by skills, and the same day's review found bugs Keel's own model review and 366 tests
missed. A floor that CI runs is the check a model can't talk past.

| # | Decision | Implication |
|---|---|---|
| D17 | `keel.policy.json` gains a `quality` section; the compiled `keel-checks` job runs it **after** the project's own `backPressure` ladder. Each check has `mode: fail \| warn \| off` (`warn` = the step runs with `continue-on-error`) and anything it installs is pinned to an exact version | Defaults give every governed project a dependency audit and a diff secret scan with no setup; turning one off is a policy edit, so a governance PR the approver merges |
| D17a | **audit** — default `fail` at `level: high`. The command follows the lockfile: npm → `npm audit --audit-level=high`, pnpm → `pnpm audit --audit-level high`, Yarn Berry → `yarn npm audit --all --recursive --severity high`, Yarn classic → `yarn audit` with its exit bitmask cut at the level. Other stacks set `quality.audit.command`; with neither, the step warns and `keel compile` says so | Dev dependencies count (CI tooling is attack surface). A project adopting Keel with known high advisories goes red until it upgrades or the approver sets `warn` |
| D17b | **secrets** — default `fail`, engine `builtin`: `keel-ci.mjs secrets` scans the **added lines** of the diff (PR: base...head; push: before..sha; first push: the whole tree) for the same shapes as the write-time secrets gate (`SECRET_LITERAL`, kept identical by a test). Exceptions are policy globs (`quality.secrets.allowPaths`), never inline markers the agent could type. Opt-in engine `gitleaks` downloads gitleaks 8.30.1 checked against a pinned sha256 (overriding the version requires the matching sha256) | Zero install, no network for the default; the log shows file:line and an 8-character prefix, never the value. gitleaks buys broader rules at a download per run |
| D17c | **sast** — semgrep, **opt-in** (`off` by default: ~1 min install per run). Pinned twice: `semgrep==1.178.0` via `pipx run`, and the rules from `semgrep/semgrep-rules` fetched at commit `a84ff9c…` (content-addressed, not the moving registry). Rule directories follow the detected stack (or `quality.sast.rules`); a project's own `.semgrep.yml` / `.semgrep/` is added. PRs scan with `--baseline-commit`, so only new findings fail | Legacy findings don't block adoption; new ones do. Registry packs (`p/…`) are deliberately not the default because they can change under a pinned version |
| D17d | **architecture** — dependency-cruiser 18.4.0 with the project's own config (`.dependency-cruiser.{js,cjs,mjs,json}`), detected at compile time, so deleting the config fails CI rather than silently skipping. No config → `keel compile` notes it and the step prints a notice | Keel doesn't invent architecture rules; it enforces the ones the project wrote. Projects that want the rules agent-proof add the config to `governancePaths` |
| D18 | `keel-rigor` checks a HEAVY PR's **threat model**: the feature ledger (`<ledger.dir>/<slug>/00-status.md`, slug from a `Feature: <slug>` line in the PR body, else a ledger path the body names, else the longest ledger slug in the branch name) must sit beside a `spec.md` with a non-empty §Threat model. `quality.threatModel.mode`: `warn` (default), `fail` (opt-in), `off`. Separate from the approval check: an approved HEAVY PR still fails in `fail` mode | G2's content becomes a CI fact, not a skill's hope. `fail` also covers governance-only HEAVY PRs, which then need a ledger + spec too; that is why it is opt-in |
| D19 | keel-dev's Ship checklist makes the built-in `/code-review` bug pass **required** next to the two-axis review | Two different axes: Pocock's review checks standards and spec; the built-in hunts correctness bugs. The review that found four missed bugs was the second kind |

Existing projects: the policy lock now carries `quality`, so after upgrading the plugin run
`keel compile` once and merge the result (as with the ledger gate).

## Self-authored HEAVY work (2026-10-18)

Found while piloting on a real repo (sugabalance-website PR #22, authored by
the approver): GitHub does not let a user approve their own pull request, so a
HEAVY PR the approver authors can never get the approver's APPROVED review.
`keel-rigor` stayed red by design; the PR merged only because the ruleset was
not yet enforced (private repo, GitHub Free). With the ruleset active and
`bypass_actors` empty, nobody could have merged it — including every
governance PR, which §1.4 of the guide tells the approver to author and merge.

| # | Decision | Implication |
|---|---|---|
| D21 | A HEAVY PR **authored by the approver** passes `keel-rigor` without a review; the author's own review is the approval | `rigorVerdict` reads the PR author (`PR_AUTHOR` ← `github.event.pull_request.user.login`, a new env var in the compiled workflow) and passes HEAVY when it equals `approver.github` (case-insensitive). Any other author — the agent's identity above all — still waits for the approver's APPROVED review. **Loss:** nobody but the author reviews the approver's HEAVY work; that is the same person who would have approved it. Projects compiled before this need `keel compile` again. |

**Invariant kept:** an agent never counts as the approver. Policy validation
already refuses `agentIdentity.github == approver.github`; it now compares
case-insensitively (GitHub logins are), and the verdict refuses the exemption
when the two logins coincide anyway. So the exemption is reachable only by the
human's own account. If an agent runs on the approver's token (cloud session
before the GitHub App is wired), Keel cannot tell them apart at any layer —
`keel doctor` reports the identity as unproven until D15 is done, and the
guide now says so instead of claiming `keel-rigor` still separates them.

**Rejected:**
- *(b) a second approver list* — does not help the main case, a solo
  maintainer, and adds policy surface for a problem GitHub creates.
- *the agent approves on the human's behalf* — the merge gate blocks
  `gh pr review --approve` on purpose; an approval from the agent's shell
  would pass as the human's review.
- *keep `keel-rigor` strict and let the approver merge via a ruleset bypass* —
  same number of human acts, but every governance PR then shows a red
  required check and a logged rule bypass, and it needs a ruleset change
  (a `RepositoryRole` admin bypass actor in `pull_request` mode) that cannot
  be verified from a GitHub Free private repo.

**Open, to verify when a ruleset is first enforced (paid plan or public
repo):** the compiled ruleset also sets `require_code_owner_review: true`
with `required_approving_review_count: 0`. If GitHub applies the code-owner
rule at count 0, the approver's own danger-path PRs are still blocked at the
GitHub layer (the sole code owner cannot approve their own PR) even though
`keel-rigor` is green. The recorded fallback is that admin bypass actor in
`pull_request` mode, which the agent cannot use (its identity is not a repo
admin; the doctor checks that) and which GitHub logs — plus the matching
`keel doctor` relaxation. Not changed here because it is unverified.
