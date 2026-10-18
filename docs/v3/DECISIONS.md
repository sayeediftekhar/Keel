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

## One plugin: context discipline, architecture layer, clean-code limits (2026-10-18)

D3 said Keel, lean-context and builder-stack ship as one plugin; it was never done. The
2026-10-18 audit found Keel enforcing lean-context's harness half (gates in hooks, least
privilege, approvals, `keel doctor`) while breaking its context half: `keel init` wrote the
whole router and LAWS (263 lines, 14.8k characters, ~5.1k tokens est.) into every project's always-on
`CLAUDE.md`, against a Tier-1 budget of ~80 lines / ~1.5k tokens. Nothing in CI measured code
cleanliness, and Keel's own `gates.mjs` was 766 lines with 102 lines over 120 characters.
(Numbering: D17 is claimed twice, by PR #12 and PR #13; this is D20, after both.)

| # | Decision | Implication |
|---|---|---|
| D20 | Keel absorbs lean-context's context discipline and builder-stack's architecture layer, and adds mechanical clean-code limits to the compiled CI, **on the condition that shipping speed is kept**: FAST work must feel unchanged | lean-context's standalone plugin and commit gate retire (PR body says how); builder-stack stays the source of its templates and framework, copied verbatim with provenance |
| D20a | **Tier 1 is a thin router.** `keel init` writes the lane rule, the eleven surface names, the FAST/HEAVY record lines, the invariants by name, an authorities index, a truth-order line (live > code > docs) and one `@docs/INDEX.md` import. Budget: the Keel-written `CLAUDE.md` plus its import ≤ 80 lines and ≤ 1.5k tokens (est.), asserted by `init.test.mjs`. LAWS (definitions, layers, tripwires) and the full router move verbatim to the model-invoked `keel-v2` skill | Measured on a fresh repo (estimates; no API key was available for count_tokens): `CLAUDE.md` 263 → 54 lines, ~5,107 → ~1,242 tokens; with the imported `docs/INDEX.md`, 65 lines and ~1,451. Every session stops paying ~3.9k tokens (est.) for rules most tasks never read; the definitions load when a surface might be yes, before a plan and before a review. `install.sh arbiter` (the submodule layout) still writes the full block |
| D20b | **Token numbers are labeled.** `keel-ci.mjs budget` replaces chars/4 with a conservative heuristic (every word by length, every symbol, newline and indent run; ~1.4× chars/4 on Keel's own docs) and prints "est."; numbers are only called measured when they come from the count_tokens API. `budget.alwaysOnTokens` defaults to 2000; with the default, overage warns (`budget.mode: warn`); a project that sets the number itself keeps the old failing behavior | lean-context PLAYBOOK §6: chars/4 undercounted by 65%. A real default means every project gets the signal; warn-by-default means adopting Keel doesn't turn a big existing `CLAUDE.md` red on day one |
| D20c | **lean-context's habits ship as files and a skill.** `keel init` scaffolds `docs/INDEX.md` (pointer table only); the model-invoked `doc-sync` skill runs the lesson / history / state test, drains to numeric budgets, writes the handoff, and runs before the window degrades (DIRECTIVE §5, PLAYBOOK §3, §7) | Tier 2 costs a description line, not a document; history moves to `docs/HISTORY.md` receipts instead of rotting in `CONTEXT.md` |
| D20d | **builder-stack's layer ships too.** `keel init` scaffolds `docs/ARCHITECTURE.md` (load-bearing pieces, a module map with a Path column, one-sentence jobs and stable/volatile, sequencing with Phase 0), `LEARNINGS.md` (Trap → Rule → Why, seeded with L1/L2) and `LAWS.md` (the project's own Iron Laws). `docs/SYSTEMS_THINKING_FRAMEWORK.md` is an on-demand reference; keel-dev's G1/G2 walk the seven rungs for HEAVY features only; Ship (HEAVY) and retro run the three feedback signals and file each hit as its own ticket | FAST never walks the rungs or writes signal lines; HEAVY pays a few lines of spec it mostly wrote anyway |
| D20e | **Clean-code limits in the compiled CI** (`quality.limits`): file length 400, function length 80, line length 120, cyclomatic complexity 15, module boundaries; one step in `keel-checks`, `keel-ci.mjs limits`. Speed rules, enforced in code: **(a)** only files the PR changes are checked, never the whole repo; **(b)** a ratchet: a changed file may not get worse than its base version and a new file meets the caps — a file over the length cap may not grow, no new over-long line, no function newly over the length or complexity cap or bigger than it was, no new boundary violation. Code the PR only moves keeps its old measure (a line or function, matched by name or first line, that already existed anywhere in the PR's base), so splitting a big file never fails; **(c)** formatting is never a CI failure: the project's formatter (detected, or `quality.limits.formatter`) runs on every agent write through a PostToolUse hook; **(d)** every limit ships in `warn`; `quality.limits.mode` or a per-limit `{max, mode}` switches to `fail`; **(e)** with a module map in `docs/ARCHITECTURE.md`, `keel compile` writes `.keel/ci/modules.json` and a stable module may not import a volatile one (relative imports in JS/TS); **(f)** the step adds seconds: it needs no install unless JS/TS files changed and the project has no ESLint ≥ 9 (then the pinned `eslint@9.39.5`), and semgrep and dependency-cruiser stay opt-in (D17c/D17d) | Function length and complexity use ESLint's built-in `max-lines-per-function` and `complexity`; `keel compile` also writes `.keel/ci/eslint.limits.mjs` (all four built-in rules) for the project's own `eslint.config.*` to extend. Non-JS files get the language-neutral line and file-length ratchet. Legacy debt never blocks a PR that doesn't touch it, and a PR that touches it can't add to it. Known trade-off: rewrapping a long function to the line cap adds lines to it, so a pure reflow of an already-long function is flagged; split the function in that PR, or set `functionLines` to `warn` |
| D20f | **Keel meets its own bar.** `plugin/lib/gates.mjs` splits into one module per gate (bash dispatch, governance, ledger, secrets, migration + SQL, push, merge, deploy, MCP) behind the same `decide()`; every line in `plugin/**/*.mjs` is ≤ 120 characters; the full suite passed unchanged before and after. Keel's CI runs `keel-ci.mjs limits --mode=fail` | Landed as its own PR first (refactor only), so the behavior diff and the formatting diff are reviewable apart. Remaining debt the ratchet now holds in place (none may grow): `doctor.mjs` 426 lines, `shell.mjs` `tokenize` 149 and `unwrap` 118 lines, `doctor.mjs` `plantedCases` 112, `policy.mjs` `normalizePolicy` ~100, `push.mjs` `pushBash` 83, `compile.mjs` `renderWorkflow` 81; and the gate functions over complexity 15 (`secretsBash`, `governanceTargets`, `classifyMigrationCommand`, …). The quality floor moved from `compile.mjs` (491 lines) to `quality.mjs`, so `compile.mjs` is under the cap again |

Existing projects: re-run `keel init` (it replaces the managed block in place and scaffolds only
missing files), then `keel compile` once and merge the result: the lock now carries
`quality.limits`, `budget.mode` and the detected `formatter`, and `.keel/ci/` gains `limits.mjs`,
`eslint.limits.mjs` (JS/TS projects) and `modules.json` (once the module map is filled in).
