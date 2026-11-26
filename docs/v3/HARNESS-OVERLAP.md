# Keel vs Claude's own harness — redundancy and clashes

*Assessment, first written 2026-10-10 against Claude Code 2.1.296; refreshed 2026-11-23 against
Claude Code 2.1.330 and Keel `main` at 2291052 (3.0.0-alpha.4). Nothing in Keel's behavior changes
with this refresh: it is an assessment.*

*Evidence for the refresh. First-hand: `claude --help` and `claude plugin --help` on 2.1.330; Keel's
test suite on Node 22.23.5 (443 tests: 442 pass, 1 skipped); a read of Keel's skills, engine and
decision log; the committed `.claude/settings.json`, `keel.policy.json` and `.keel/` of five projects
that use Keel. From the Claude Code docs and changelog: everything about hooks, mods, managed settings,
permission modes, sandboxing, memory and review commands. **Not done this time: a live session run.**
Changelog entries for 2.1.313, 2.1.315 and 2.1.320 were not read. Anything the docs did not settle is
marked **unverified**; the list of what a live run must settle is at the end.*

## Verdict

- **The October verdict holds.** Keel's rules overlap with what Claude Code does itself; Keel's gates
  complement it. Keep what only Keel can do (project-specific policy, enforcement outside the agent,
  proof) and defer to the built-ins for the rest.
- **Six of the seventeen October recommendations are applied, three partly, four are open.** The other
  four rows needed no change. The open four are memory, comprehension, output style and evals: all
  rules-side, none touch a gate. See the Status column.
- **The harness moved in Keel's favor on fail-closed behavior** (2.1.299, 2.1.314, 2.1.316) and
  against it in one way: there are now start-up flags that switch installed plugins' hooks off.
- **The biggest gap is coverage, not design.** A gate only runs where the plugin is loaded and the
  project has a compiled policy. Today that is two of five projects, and neither ERP. See
  *Where the gates actually run*.

## What changed in Claude Code since October (2.1.296 → 2.1.330)

| Change | Since | Effect on Keel |
|---|---|---|
| `--bare` and `--safe-mode` start a session with the hooks of installed plugins switched off (hooks of *managed* plugins and managed settings still apply) | In 2.1.330's `--help`; when added is unverified | **Gates off** for that session: no push, merge, migration, secrets or governance gate. Deny rules in project settings still load under `--safe-mode` ("permissions work normally"); under `--bare` this is unverified. GitHub-side rules still apply. No user or project setting was found that forbids either flag. |
| `--restricted` ignores user, project and local settings files (managed settings and `--settings` still apply) and refuses `bypassPermissions` | In 2.1.330's `--help` | The compiled deny rules live in project settings, so they are ignored in this mode. Whether a user-installed plugin still loads is unverified. |
| A plugin hook's blocked action is refused, not let through, when the hook can't be handed the action or can't return its answer | 2.1.299 | In Keel's favor. Removes a fail-open path. |
| Hooks matching `Bash` now also run on the Monitor tool's shell commands | 2.1.314 | In Keel's favor. Closed a way around the Bash gate. |
| A PreToolUse hook that *errors* in Code Mode no longer refuses a script's tool call unless it sets `onFailure: "block"` | 2.1.329 | No change needed: every Keel gate hook already sets `onFailure: "block"`. Worth a `keel doctor` line so it stays true. |
| Hooks from settings files, managed policy and plugins "also run inside subagents" (docs) | Documented now | Settles half of October's open risk. Workflow-tool agents, `claude --bg` background sessions and `claude -p` are still **unverified** for plugin hooks. |
| Mods: precedence is now documented | Docs | Sharper than October's one-line risk. See *Risks*. |
| `plugin.json` accepts `"engines": {"claude-code": ">=…"}`; an out-of-range plugin is not installed, updated or loaded | 2.1.323 | Keel's "needs 2.1.295 or later" is prose in GUIDE §0 today. It can be enforced. |
| Sandbox: sandboxed Bash follows the normal permission flow by default (2.1.325); a sandbox that can't start makes the next sandboxed command fail with a message instead of silently running unsandboxed (2.1.328); some sensitive home folders are write-protected by default (2.1.326); `sandbox.failIfUnavailable` exits at startup | 2.1.325–2.1.328 | Keel has no sandbox story. This is a complementary layer (filesystem and network), and it backs up the secrets gate for shell commands. |
| `permissions.denyInsteadOfPrompting` | 2.1.319 | Useful for unattended runs: a prompt nobody can answer becomes a refusal. |
| `claude -p` with no mode set starts in Manual; project settings or a plugin can no longer switch the auto-mode check back on | 2.1.302, 2.1.319 | Neutral. Keel's hooks do not depend on the mode. |
| `/code-review` reviews the whole branch against the default branch and reports only bugs and CLAUDE.md violations; `/simplify` takes the cleanups; `/security-review` asks before it runs; `claude ultrareview` runs a cloud multi-agent review | 2.1.323–2.1.329; `ultrareview` in 2.1.330's `--help` | Row 6. The built-in now reads the project's CLAUDE.md as criteria, which is what October asked a `REVIEW.md` to do. |
| `/loop` recurring tasks run up to 30 days; the Workflow tool keeps a run journal for resume; `claude --bg` background sessions with `claude agents` | 2.1.305, 2.1.330 | Row 12. More unattended mechanisms, so surface 10 (unattended execution) matters more. |
| Skill listing: description plus `when_to_use` is cut at 1,536 characters per skill | Docs | Row 9. A hard reason to keep lane descriptions short. |
| Cloud sessions "don't read your local `~/.claude/settings.json`"; a plugin runs in a cloud session only if it reaches that session | Docs | A plugin installed at user level does not follow you into a cloud session. See *Where the gates actually run*. |

## Where they meet

Status is where Keel `main` stands today against October's recommendation.

| # | Area | Claude's built-in behavior | Keel | Relationship | Recommendation | Status (2026-11-23) |
|---|---|---|---|---|---|---|
| 1 | Git safety | Commit or push only when asked; branch first; in cloud sessions, no PR unless asked | keel-v2 "never auto-commit"; card-set "commit only on the human's go-ahead" | **Redundant** (reinforcing) | Fine. But v3's LIGHT auto-merge *needs* an explicit standing authorization in CLAUDE.md (GUIDE 1.6), or the defaults and Keel pull in opposite directions. | **Done.** `keel init` writes the standing authorization block. |
| 2 | Hard-to-reverse actions | Confirm before destructive or outward-facing actions. Since October: bypass mode asks or refuses root, home and top-level `rm` (2.1.330) | HEAVY gates, human gate, no live migrations without approval | **Redundant in intent; Keel adds enforcement** | Keep. Keel turns "should confirm" into "can't without approval". | No change needed. |
| 3 | Permission modes | Auto mode is the default for interactive sessions; `claude -p` starts in Manual (2.1.302); bypass mode exists; deny rules hold in every mode | Hooks block (exit 2) before the permission flow | **Complementary** | Keep. Hooks never *ask*, so no double prompts. | No change needed. The live check (a hook block holding in `bypassPermissions`) was on 2.1.296 and has **not been repeated** on 2.1.330. |
| 4 | Planning | Native plan mode; can be forced with `--permission-mode plan` or `permissions.defaultMode: "plan"` | HEAVY: "plan first, write no code that turn, wait for approval" | **Redundant** | Use native plan mode as the mechanism for the HEAVY plan gate; keep Keel's *content* rules (code shape, laws touched, facts pinned). | **Done.** keel-v2 §2 names native plan mode as the mechanism. |
| 5 | Asking | `AskUserQuestion` when a decision is genuinely the user's | keel-v2: "never stop to ask which lane"; card-set: "human decides rigor" | **Clash between the two Keels**, not with Claude | Follow the card-set's model. | **Done (D2, 2026-10-17).** |
| 6 | Code review | `/code-review` (whole branch, bugs and CLAUDE.md violations, effort levels, `--fix`, `--comment`), `/simplify` (cleanups), `/security-review`, `claude ultrareview`. The Claude Code Review GitHub app and Claude Approvals check were named in October and are **unverified** this time | Pocock code-review (Standards and Spec axes), VibeSec, the built-in bug pass | **Redundant; coin-flip risk** | Make a built-in reviewer the default. Keep Keel's laws and tripwires as the *criteria*. Use cross-model review for HEAVY only. | **Partly.** D19 made the built-in `/code-review` bug pass required at Ship; gstack and codex were removed. The Pocock two-axis review is still the default first pass, so two reviewers run on every change. |
| 7 | Skill names | Account skills (`anthropic-skills:route`, `:away`), built-in commands | Project skills `route`, `review`, `design`, `spec` | **Collision** | Ship Keel's rules as namespaced plugin skills; remove project copies. | **Done in Keel (2026-10-17). Open in projects:** two projects still carry copied-in card-set skills; three carry Keel as a submodule. |
| 8 | Memory | Auto-memory: on by default, stored per repository under `~/.claude/projects/<project>/memory/`, first 200 lines or 25KB of `MEMORY.md` loaded, off with `autoMemoryEnabled: false`. It is local to a machine; the docs do not say it syncs | MEMORY-CONTRACT's four layers + claude-mem + graphify LESSONS | **Redundant and conflicting** ("one fact, one home" is broken by a fifth layer) | Adopt built-in auto-memory as the episodic layer; keep `CONTEXT.md`/`LEARNINGS.md` as the reviewed semantic layer; drop claude-mem unless measured to help. | **Open.** claude-mem is still in MEMORY-CONTRACT, keel-v2 §4 and keel-ops. New fact that matters with two machines: auto-memory does not travel, `CONTEXT.md` and `LEARNINGS.md` do. That strengthens the recommendation: anything that must survive a machine switch belongs in the repo files. |
| 9 | Context cost | A large system prompt is already loaded every turn; each skill's listing is cut at 1,536 characters | Tier-1 router in `CLAUDE.md`; lane routers cost nothing (`disable-model-invocation`) | **Redundant text** | Shrink the arbiter: a rule enforced by a hook or CI no longer needs a paragraph of prose. | **Done (D20a).** Tier 1 is a thin router with a CI-checked budget (~80 lines, ~1.5k tokens est.). The on-demand router (`skills/keel-v2/CLAUDE.md`, 174 lines) still describes in prose several things a gate enforces. |
| 10 | Code comprehension | Grep/Glob/Read tools, the Explore subagent | "graphify-first; grep is the exception" | **Method clash** | Make graphify an optional accelerator, never the default. A stale graph gives confident wrong answers. | **Open.** keel-v2 §6 and keel-dev still say "Default graphify; grep is the exception". |
| 11 | Output style | Clear prose by default; built-in output styles (the current list is unverified) | lazy-loop / caveman compression | **Clash** | Prefer built-in output styles. | **Open.** lazy-loop (128 lines) still ships. |
| 12 | Orchestration | Workflow tool (with a resumable run journal), `/loop` (up to 30 days), scheduled tasks, agent teams, `claude --bg` background sessions, cloud sessions | card-set `away` | **Redundant mechanisms** | `away` stays as the *policy*; the built-ins are the *mechanism*. Drop the superpowers executor from the default path. | **Done.** superpowers was removed in October. |
| 13 | Evals | `claude plugin eval` (cases as `case.yaml` or `prompt.md` plus graders, with a no-plugin baseline arm), `/skill-doctor`. `/doctor prompt-audit` is **unverified** | Keel's own routing, lane and gate evals as `cases.jsonl` with hand-recorded `RESULTS.md` | **Redundant** | Move Keel's evals to `claude plugin eval`; use `/skill-doctor` for curation. | **Open.** No `case.yaml` in the repo. |
| 14 | Environment hooks | Cloud environments can add their own hooks | Push gate blocks protected branches only | **Compatible** | Prefer "never push to main" over "never push without go-ahead". | No change needed. |
| 15 | GitHub checks | Claude Approvals / Claude Code Review can gate PRs (unverified this time) | `keel-rigor` requires the approver's approval on HEAVY PRs | **Complementary** | Fine to require both. | No change needed. D21 added the self-authored HEAVY rule. |
| 16 | Other gate plugins | — | lean-context's opt-in commit gate | **Duplicate** | Retire it once Keel v3 is installed. | **Done in Keel (D20).** lean-context should not be installed next to Keel. |
| 17 | Instruction precedence | Project CLAUDE.md overrides default behavior | Projects granted "autonomous merge" and "live migrations" in CLAUDE.md | **Risky, not a clash** | Replace those delegations with gated equivalents. | **Partly.** True only for the two projects with a compiled policy. |
| 18 | Start-up flags | `--bare`, `--safe-mode` and `--restricted` switch off some or all of what an installed plugin and project settings add | Gates assume the plugin is loaded | **Gap (new)** | A launcher that never passes them, a `keel doctor` note, and reliance on the GitHub side for anything that must hold regardless. | **Open (new).** |
| 19 | Sandbox | Bash sandbox for filesystem and network on macOS, Linux and WSL2; fail-closed with `sandbox.failIfUnavailable` | Nothing | **Complementary (new)** | Recommend it in GUIDE §0 beside the bypass-mode setting; let the launcher turn it on. | **Open (new).** |
| 20 | Minimum version | `plugin.json` `engines` (2.1.323) | "Claude Code 2.1.295 or later" in GUIDE §0, checked by hand | **Redundant prose (new)** | Declare `"engines": {"claude-code": ">=2.1.295"}`. Note it cannot protect a session older than 2.1.323, which ignores the field. | **Open (new).** |

## Where the gates actually run

Read from each project's committed files on 2026-11-23. The projects are private, so they are
labeled, not named; the mapping is kept outside this repo.

| Project | Keel rules | Compiled policy and gates (`keel.policy.json`, lock, CI, ruleset) | Plugin declared in project settings |
|---|---|---|---|
| A: marketing website (the v3 pilot) | submodule at `.claude/skills` | **Yes** (27 deny rules) | No |
| B: static website | copied-in | **Yes** (25 deny rules) | No |
| C: ERP (ledger, live database) | submodule at `.claude/skills/keel` | No | No |
| D: multi-tenant SaaS ERP | copied-in card-set (`.keel/`) | No (6 hand-written deny rules) | No |
| E: management system (accounting) | submodule at `.claude/skills` | No | No |

Three consequences:

1. **The two projects with money, tenants and live databases have Keel's rules and none of its
   gates.** The gated projects are the two static websites. Risk and enforcement are inverted.
2. **No project declares the plugin**, and `keel init` / `keel compile` do not write
   `extraKnownMarketplaces` or `enabledPlugins` into the project's `.claude/settings.json`. The hooks
   therefore run only on a machine where someone installed the plugin by hand. A new machine, and
   (per the docs) a cloud session, start without them. Whether a project-level declaration is enough
   to load the plugin in a cloud session is unverified.
3. **Where the plugin is absent the GitHub side still holds** on the two compiled projects: ruleset,
   CODEOWNERS, `keel-rigor` and `keel-checks`. That is the layer no flag or mod can switch off, and
   the reason to compile the ERPs first.

## Things Keel does that Claude Code doesn't

- Knows **your** danger paths and turns them into CODEOWNERS + a CI check.
- Applies **GitHub-side** rules (ruleset, required checks, approver identity).
- **Batch-approved live migrations**, verified on GitHub, in order, test first.
- **Proves** its gates (`keel doctor` plants violations).
- Catches **context gaming** (line-length budget) and **phantom references** in docs.
- Runs a **quality floor** in CI the model can't talk past (audit, secrets, limits; D17, D20e).

## Things Keel should stop doing

- Re-implementing memory, comprehension, output-style and eval features that Claude Code ships
  (rows 8, 10, 11, 13). Planning and orchestration are already handed over.
- Running two reviewers on every change (row 6).
- Describing gates in prose that a hook or CI now enforces.
- Supporting three install layouts.

## Risks the gates themselves add

- **False positives** stop real work. The red-team allow-list
  (`plugin/test/redteam.test.mjs`) is the guard: every reported false
  positive becomes a test.
- **Latency.** Each Bash, edit and read call runs a small Node process (tens of
  milliseconds; a live migration adds one GitHub call).
- **Mods.** October said mods can override hook decisions unless hooks come from managed settings.
  The docs now give the order: managed PreToolUse hooks run *before* any mod; hooks from plugins and
  other settings files run *after* the last mod. A mod that answers a tool call itself means the tool
  never runs and Keel's hook never sees it, and a mod's own `$.fs` / `$.process` calls skip permission
  rules and PreToolUse hooks. Claude Code's built-in guard keeps deny rules and PreToolUse blocks in
  force against mods by default, but it loads only when managed settings exist or the login is a Team
  or Enterprise one. `keel doctor`'s `mods` line is still right to say UNPROVEN; its wording
  (`tool.check`) should follow the docs.
- **Managed settings are within reach of a solo user** (`/etc/claude-code/managed-settings.json` on
  Linux and WSL, `/Library/Application Support/ClaudeCode/` on macOS). Putting Keel's gate hooks there
  would run them before mods and under `--bare` and `--safe-mode`. They are enforced by Claude Code,
  not the operating system, and on WSL the folder is user-writable, so this raises the bar without
  being tamper-proof. Not yet tried.
- **Start-up flags** (row 18): a session started with `--bare` or `--safe-mode` has no gates.
- **Unattended agents**: hooks run inside subagents (docs). Workflow-tool agents, `claude --bg` and
  `claude -p` are unverified; until checked, treat those runs as outside the hook layer (GitHub still
  applies).

## Direction chosen 2026-11-23 (not applied)

Sayeed's answers when this refresh was scoped. They are recorded here so the next step starts from
them; none is in `DECISIONS.md` yet and nothing below has been built.

1. **Thin Keel.** Finish this document's recommendations: Keel wraps the harness instead of
   duplicating it. In practice that is rows 6, 8, 10, 11 and 13, plus trimming the on-demand router
   of prose a gate already enforces.
2. **A launcher command.** One command that starts Claude Code for a project the governed way. A
   sketch, using flags that exist in 2.1.330: check the Claude Code version, that the plugin is
   loaded and that the policy lock is current; then start `claude` with a `--settings` overlay
   (sandbox on, bypass mode off), `--permission-mode plan` when the task is declared HEAVY, and never
   `--bare` or `--safe-mode`. **Limit:** a launcher is a convenience, not a gate. Anyone can still
   type `claude`. Enforcement stays in the hooks and on GitHub.
3. **Lanes kept:** dev, qa, secure, verify (with doc-sync and keel-setup); design (with
   fused-landing); marketing, content, research. **Lanes to retire:** keel-ops, keel-finance,
   keel-legal and lazy-loop. Retiring keel-ops removes the claude-mem route (row 8) and retiring
   lazy-loop closes row 11. keel-ops also carries the write-action gate text for Slack, Notion and
   Zapier connectors; that rule should move to the arbiter's surface 6 rather than disappear.
4. **Plugin only.** Retire the submodule and copied-in layouts and migrate the five projects above.
   For this to hold on every machine and in cloud sessions, `keel init` or `keel compile` has to
   declare the marketplace and the plugin in the project's `.claude/settings.json`, and the project
   should pin a Keel version.

A suggested order, by risk removed per hour of work: compile a policy for projects C and D;
declare the plugin per project; then the thinning and the launcher.

## What a live run must settle before any of that

1. Do the plugin's PreToolUse hooks fire for Workflow-tool agents, for `claude --bg` sessions and for
   `claude -p`?
2. Does a hook block still hold in `auto` and in `bypassPermissions` on 2.1.330?
3. Under `--bare`, `--safe-mode` and `--restricted`: which of the hooks, the compiled deny rules and
   the plugin's skills survive?
4. Does a plugin declared in a project's `.claude/settings.json` load in a cloud session, and do its
   hooks run there?
5. Does the built-in mod guard load on a personal login once a managed-settings file exists, and do
   hooks placed in managed settings run under `--bare`?
6. Does `"engines"` in `plugin.json` refuse to load on an older Claude Code as documented?
7. Do `/doctor prompt-audit`, the Claude Code Review GitHub app and the Claude Approvals check exist
   as October described them?
