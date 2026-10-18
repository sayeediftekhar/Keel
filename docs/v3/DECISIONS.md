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
| D17 | A HEAVY PR **authored by the approver** passes `keel-rigor` without a review; the author's own review is the approval | `rigorVerdict` reads the PR author (`PR_AUTHOR` ← `github.event.pull_request.user.login`, a new env var in the compiled workflow) and passes HEAVY when it equals `approver.github` (case-insensitive). Any other author — the agent's identity above all — still waits for the approver's APPROVED review. **Loss:** nobody but the author reviews the approver's HEAVY work; that is the same person who would have approved it. Projects compiled before this need `keel compile` again. |

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

**Verified (2026-10-18, session laughing-chatterjee, throwaway public repo
`keel-ruleset-probe`, the compiled ruleset applied as-is, PRs authored by the
sole code owner):** `require_code_owner_review: true` at
`required_approving_review_count: 0` does **not** block the owner's own
danger-path PR. The GitHub layer was blocking, but for another reason —
see D18. The admin bypass fallback is therefore not adopted (the API does
accept `{actor_id: 5, actor_type: RepositoryRole, bypass_mode: pull_request}`
on a user-owned repo; whether the merge box then offers the owner a bypass
merge was not checked, and it would not have helped LIGHT auto-merge anyway).

## Last-push approval blocks everything (2026-10-18)

Same probe, isolating the two review parameters with the status-check rule
removed (two PRs by the owner: one on a CODEOWNERS path, one not):

| `require_code_owner_review` | `require_last_push_approval` | owned-path PR | plain PR |
|---|---|---|---|
| true | true (as compiled before D18) | BLOCKED | BLOCKED |
| true | false | CLEAN | CLEAN |
| false | true | BLOCKED | BLOCKED |
| false | false | CLEAN | CLEAN |

`reviewDecision` was null throughout: GitHub asks for no review, yet the
last-push rule blocks. With it on, nothing merges — not the approver's own
governance PRs, and not the agent's LIGHT PRs that D1/D6 say auto-merge on
green (an agent-authored PR would need a human approval of its last push).

| # | Decision | Implication |
|---|---|---|
| D18 | The compiled ruleset sets `require_last_push_approval: false` | What the setting guarded is covered elsewhere: `dismiss_stale_reviews_on_push: true` drops an approval when new commits land, and `keel-rigor` re-runs on every `synchronize` and reads the reviews again. `keel doctor` reports a ruleset that still sets it (or that has any bypass actor) as **BROKEN** with the `gh api -X PUT …/rulesets/<id>` call that fixes it, instead of lumping it with "missing". Projects whose ruleset was applied before this must re-apply `.keel/github-ruleset.json` with that PUT. |

**Still open:** whether GitHub enforces code-owner review at count 0 for a
*non-owner* author (the agent). The probe had one account, so it could not
tell "the owner's own review is implied" from "the rule is inert at count 0".
Keel does not depend on the answer: `keel-rigor` is a required check and
refuses a HEAVY PR by any other author until the approver's APPROVED review
exists. Verify when the GitHub App identity (D15) is wired.
