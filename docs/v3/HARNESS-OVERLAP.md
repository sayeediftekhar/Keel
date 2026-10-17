# Keel vs Claude's own harness — redundancy and clashes

*Assessment, 2026-10-10, against Claude Code 2.1.296 and the behavior Claude's
system prompt sets by default. Evidence: Claude Code docs and changelog, a
live run of the Keel v3 plugin, and audits of three projects using Keel.*

## Verdict

- **Keel's rules (keel-v2, the card-set, the lanes) overlap heavily** with
  things Claude Code now does itself, and clash in a few places. The overlap
  costs context on every turn and creates "which one do I follow?" moments.
- **Keel's gates (v3 plugin) mostly complement** the harness. Claude Code
  enforces *permissions*; it doesn't know your danger paths, your GitHub
  rules, your migration approvals or your CI. That's the gap Keel fills.
- **Direction:** keep the parts only Keel can do (project-specific policy,
  enforcement outside the agent, proof), and **defer to built-ins** for
  everything Claude Code already ships.

## Where they meet

| # | Area | Claude's built-in behavior | Keel | Relationship | Recommendation |
|---|---|---|---|---|---|
| 1 | Git safety | Commit or push only when asked; branch first; in cloud sessions, no PR unless asked | keel-v2 "never auto-commit"; card-set "commit only on the human's go-ahead" | **Redundant** (reinforcing) | Fine. But v3's LIGHT auto-merge *needs* an explicit standing authorization in CLAUDE.md (GUIDE 1.6), or the defaults and Keel pull in opposite directions. |
| 2 | Hard-to-reverse actions | Confirm before destructive or outward-facing actions | HEAVY gates, human gate, no live migrations without approval | **Redundant in intent; Keel adds enforcement** | Keep. Keel turns "should confirm" into "can't without approval". |
| 3 | Permission modes | Auto mode is the default (since late Sep 2026); a classifier decides; bypass mode exists | Hooks block (exit 2) before the permission flow | **Complementary** | Keep. Hooks never *ask*, so no double prompts. Verified live: Keel blocks hold even in `bypassPermissions`. |
| 4 | Planning | Native plan mode (plan, then approve) | HEAVY: "plan first, write no code that turn, wait for approval" | **Redundant** | Use native plan mode as the mechanism for the HEAVY plan gate; keep Keel's *content* rules (code shape, laws touched, facts pinned). |
| 5 | Asking | `AskUserQuestion` when a decision is genuinely the user's | keel-v2: "never stop to ask which lane"; card-set: "human decides rigor" | **Clash between the two Keels**, not with Claude | **Done (D2, 2026-10-17):** keel-v2 §0/§2.1 now follow the card-set's model — FAST is recorded and proceeds (D6), HEAVY is the human's to confirm and only the human downgrades, asked with `AskUserQuestion`. |
| 6 | Code review | `/code-review` (effort levels, finding→verify), `/simplify`, `/security-review`, the Claude Code Review GitHub app, the Claude Approvals check | Pocock code-review, gstack `/review`, `/codex`, VibeSec, card-set `review` | **Redundant; coin-flip risk** | Make a built-in reviewer the default. Keep Keel's laws and tripwires as the *criteria* (e.g. a `REVIEW.md`). Use cross-model review for HEAVY only. |
| 7 | Skill names | Account skills (`anthropic-skills:route`, `:away`), built-in commands | Project skills `route`, `review`, `design`, `spec` | **Collision** | **Done (2026-10-17):** Keel's rules ship as plugin skills (`/keel:keel-dev`, `/keel:keel-design`, …; the router + LAWS go into `CLAUDE.md` via `keel init`). Remove project copies of `route`, `review`, `design`, `spec` once the block is in place. |
| 8 | Memory | Auto-memory (`MEMORY.md`), CLAUDE.md/AGENTS.md, memory "dreaming" for Managed Agents | MEMORY-CONTRACT's four layers + claude-mem + graphify LESSONS | **Redundant and conflicting** ("one fact, one home" is broken by a fifth layer) | Adopt built-in auto-memory as the episodic layer; keep `CONTEXT.md`/`LEARNINGS.md` as the reviewed semantic layer; drop claude-mem unless measured to help. |
| 9 | Context cost | A large system prompt is already loaded every turn | keel-v2 arbiter ≈ 1.8k tokens always-on (+ LAWS ≈ 0.6k on HEAVY) + project overrides; lane routers cost nothing (`disable-model-invocation`) | **Redundant text** | Shrink the arbiter: a rule enforced by a hook or CI no longer needs a paragraph of prose. D11's token budget makes this measurable. |
| 10 | Code comprehension | Grep/Glob/Read tools, the Explore subagent | "graphify-first; grep is the exception" | **Method clash** | Make graphify an optional accelerator, never the default (one audited project's own rules already say this). A stale graph gives confident wrong answers. |
| 11 | Output style | Clear prose by default; built-in output styles (e.g. Concise) | lazy-loop / caveman compression | **Clash** | Prefer built-in output styles. Keel already exempts plans and reviews from compression; keep that. |
| 12 | Orchestration | Workflow tool, `/loop`, routines, agent teams, cloud sessions | superpowers autonomous executor, card-set `away` | **Redundant mechanisms** | `away` stays as the *policy* (tray, stop-line, independence); the built-ins are the *mechanism*. Drop the superpowers executor from the default path. |
| 13 | Evals | `claude plugin eval` (with/without Δ, CI threshold), `/skill-doctor`, `/doctor prompt-audit` | Keel's own routing/lane evals, "curate don't hoard" | **Redundant** | Move Keel's evals to `claude plugin eval`; use `/skill-doctor` for curation and `prompt-audit` for stale instructions. |
| 14 | Environment hooks | Cloud environments can add their own hooks (e.g. a Stop hook that asks for uncommitted work to be committed and pushed) | Push gate blocks protected branches only | **Compatible** | Session branches are feature branches, so these coexist. A project rule like "never push without go-ahead" *would* clash with such a hook; prefer "never push to main". |
| 15 | GitHub checks | Claude Approvals / Claude Code Review can gate PRs | `keel-rigor` requires the approver's approval on HEAVY PRs | **Complementary** | Fine to require both; make sure neither treats a missing human approval as a failure to fix with a push. |
| 16 | Other gate plugins | — | lean-context's opt-in commit gate (Bash `git commit` only) | **Duplicate** | Retire it once Keel v3 is installed (D3 folds lean-context into Keel). |
| 17 | Instruction precedence | Project CLAUDE.md overrides default behavior | Projects granted "autonomous merge" and "live migrations" in CLAUDE.md | **Risky, not a clash** | CLAUDE.md *can* loosen defaults, which is exactly why those delegations were dangerous without enforcement. v3 replaces them with gated equivalents. |

## Things Keel does that Claude Code doesn't

- Knows **your** danger paths and turns them into CODEOWNERS + a CI check.
- Applies **GitHub-side** rules (ruleset, required checks, approver identity).
- **Batch-approved live migrations**, verified on GitHub, in order, test first.
- **Proves** its gates (`keel doctor` plants violations).
- Catches **context gaming** (line-length budget) and **phantom references** in docs.

## Things Keel should stop doing

- Re-implementing review, planning, memory, orchestration, eval and output-style
  features that Claude Code ships.
- Shipping two rule sets with opposite answers to "who decides rigor".
- Describing gates in prose that a hook or CI now enforces.

## Risks the gates themselves add

- **False positives** stop real work. The red-team allow-list
  (`plugin/test/redteam.test.mjs`) is the guard: every reported false
  positive becomes a test.
- **Latency.** Each Bash, edit and read call runs a small Node process (tens of
  milliseconds; a live migration adds one GitHub call).
- **Mods** can override hook decisions unless hooks come from managed
  settings. `keel doctor` flags this as something to review.
- **Workflow-tool agents**: not yet verified that hooks fire for them; until
  then, treat unattended Workflow runs as outside the hook layer (GitHub still
  applies).
