# Keel v3 — design reference

*Brainstorm output, 2026-10-10. Nothing here has been implemented. Keel, lean-context,
builder-stack and the project repos are unchanged. This is the basis for the build
plan, not the plan itself.*

---

## 0. TL;DR

Keel today is a set of **instructions the agent reads**. The evidence from three real
projects shows the instructions are good and are being followed most of the time,
but **nothing outside the agent enforces them**:

- 0 of 3 projects can block a bad merge.
- The agent merges under your account.
- In one project, tests can write to the live database.

v3 keeps the instructions and adds the part that is missing: **enforcement the agent
can't talk its way past**. The time it costs you is spent only where it buys safety.

The v3 shape:

```
 ┌───────────────────── ONE PLUGIN · ONE VERSION · PINNED PER PROJECT ─────────────────────┐
 │  GOVERN    route → rigor record (LIGHT / HEAVY), laws, spec, verify-fact, review, away │
 │  ROUTE     lane routers → only the upstream tools you actually use (pinned)            │
 │  CONTEXT   resolution order · tiers · provenance · budgets that measure the right thing│
 │  QUALITY   CODE.md authority · exemplars · quality zones · no-new-debt ratchet         │
 ├─────────────────────────────── the new part: outside the agent ─────────────────────────┤
 │  ENFORCE   bot identity · branch protection · required CI · danger-path CODEOWNERS     │
 │            hooks on commit/push/merge/migration · batch-authorized live migrations      │
 │  RECORD    ledger + decisions + receipts = the "forge" (system of record)              │
 │  LEARN     the audit pack as an eval · plugin eval · change-one-thing-and-measure      │
 └──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Why v3: the inputs

| Input | Key idea taken |
|---|---|
| **Gil Feig (Merge), context graphs** | Route *context* the way Keel already routes rigor. Check skill/memory first, then synced data, then a live lookup, then write back. Tag every fact with provenance (source, age, scope). |
| **Dex Horthy (HumanLayer), software factories** | Unattended agents erode architecture. Plan the *shape* of the code before building, and align on it visually. Autonomy should equal what can be cheaply verified (back pressure). Keep a system of record for decisions and traces (the forge). |
| **SlopCodeBench** (arXiv 2603.24755) | When agents keep extending their own code, quality decays in most runs. Quality *prompts* don't stop the decay; you have to **measure** it. (Top strict solve rate 14.8%.) |
| **Claude Code, Aug–Oct 2026** | Auto mode is now the default permission mode, so permission prompts no longer reliably stop risky actions. New tools: hooks with `onFailure: "block"`, `claude plugin eval`, `/skill-doctor`, `/doctor prompt-audit`, mods, AGENTS.md support, Workflow tool, routines, `/loop`. |
| **Research consensus 2026** | The harness matters as much as the model. Policy is moving from prose into config. Self-generated skills without validation perform *worse* than no skill. Skill supply chains are actively attacked: pin, scan, review. |
| **Your own toolkit** | lean-context already says "gates in hooks, not prose" and ships a commit-gate hook. builder-stack's LAWS template already requires two enforcement layers per law. Neither reached the projects. |

---

## 2. The evidence: audits of your projects

| | Project A (content site) | Project B (booking ERP) | Project C (clinic ERP) |
|---|---|---|---|
| Size / commits (90 days) | 4.8k lines / 46 | 97k / 377 | 148k / 880 |
| AI-written commits | 88% | 99% | 93% |
| Tests | 52 (all pass) | 2,893 | 3,596 |
| Strict types, 0 errors | ✅ | ✅ | ✅ |
| Lint | ✅ | ❌ | ❌ |
| CI that can **block** a merge | ❌ | ❌ (CI exists, branch unprotected) | ❌ |
| GitHub reviews | 0 | 0 | 0 |
| Fixes landing within 7 days of a feature merging | 3 | 6 | 29 |
| UI / end-to-end tests | ❌ | ❌ | ❌ |
| Money as JS float in app code | n/a | one screen | ~109 sites |
| DB role bypasses RLS | n/a | yes | yes |
| Keel version | submodule (current) | vendored card-set, unversioned | submodule, 12 behind |

**Patterns:**
1. **Every gate exists; none is enforced.** Tests, typecheck, review and CI all exist, but they are run by hand by the same agent that merges. This is a maker-checker failure.
2. **Autonomy runs opposite to back pressure.** Project C has the most autonomy (merge, live migrations, auto-deploy, no staging) and the least enforcement.
3. **Agent-on-agent review misses specific kinds of bugs.** 171 review mentions in Project C, yet 29 post-merge fixes. The misses cluster where no deterministic check exists: UI behaviour, repeat bugs, duplicated helpers.
4. **Pattern drift and duplication.** Both ERPs do fetching, errors, auth, validation and money 4–5 different ways. There are helpers copied up to 15×, even with graphify in use.
5. **Safety in the database but not in the app.** Money is exact in the DB but float in the app. RLS is on every table, but the app connects with a role that bypasses it. By Keel's own law, both are PARTIAL.
6. **Agent context is partly false, and one budget was gamed.** Docs describe things that don't exist. A 400-line cap on `CONTEXT.md` was "met" by writing lines up to 16,701 characters long: Goodhart's law in practice.
7. **Two Keels under one name.** The card-set Keel (human decides) lives in Project B and the owner's account. The Keel repo, "Model B", lets the agent decide. builder-stack describes one and links to the other.
8. **The commit-gate hook can't see the risky actions.** It is off by default, matches only `git commit`, and only watches Bash. But merges go through `gh` or the GitHub MCP, and live migrations go through the Supabase MCP's `apply_migration`.

Project-specific urgent fixes found by the audits are tracked privately, not in this public repo.

---

## 3. Decisions taken

| # | Decision |
|---|---|
| D1 | You merge only HEAVY work. LIGHT auto-merges when the required checks are green. |
| D2 | Merge both Keels: the card-set's governance plus Model B's lane routing. |
| D3 | Keel, lean-context and builder-stack become **one plugin with one version**, pinned per project. |
| D4 | The agent gets its **own GitHub identity** (bot or App). You approve HEAVY. |
| D5 | Agents run live migrations **with your permission, batch-authorized**: a named batch, each file content-hashed, with an expiry. A hook checks it. |
| D6 | LIGHT work proceeds with no confirmation stop. It is recorded and auditable afterwards. |
| D7 | Danger surfaces use the card-set definitions, plus two new ones: **unattended execution** and **points at live**. |
| D8 | Keep only the upstream tools you actually use, pinned by commit. |

**Guiding principle (yours):** as safe as possible without costing disproportionate
human time. Spend human attention only where it buys safety, and batch it.

---

## 4. Components

### 4.1 Governance: the merged rigor router

**Flow per task:**
```
task → route (scan 11 surfaces) → rigor record
   LIGHT: build → deterministic checks → review (separate pass) → PR → auto-merge on green
   HEAVY: spec → verify-fact → plan + show-me shape → [you approve] → build test-first
          → review (decorrelated) → real-env check → PR → [you approve merge]
```

**The 11 danger surfaces:**
1. Value — exact money and quantities
2. Scope / tenancy
3. Personal data
4. Access / auth
5. Agent surface — the agent consumes untrusted input and can act
6. Irreversible — sends, deletes, payments, third-party writes
7. Scale / hot path
8. Schema / migration
9. Secrets
10. **Unattended execution** — loops, routines, away-mode
11. **Environment** — anything pointed at live or prod data

**Rigor record:** one line in the PR or spec, made machine-readable so CI can read it.
It holds the scan result, LIGHT or HEAVY, and who decided it (agent for LIGHT, you
for HEAVY or for any override). A LIGHT call is never silent: it sits in the record
for later audit.

**From the card-set:** `laws`, `spec`, `verify-fact`, `review`, `tdd`,
`agent-security`, `performance`, `design`, `handoff`, `away`. **From Model B:** the
lane routers and FAST one-turn economy for LIGHT work.

### 4.2 Enforcement, outside the agent (the new core)

| Mechanism | What it guarantees |
|---|---|
| **Bot identity** (GitHub App or bot account) | The agent can't use your approval stamp. Your approval means *you*. |
| **Branch protection + required checks** | Nothing merges with red CI. No direct pushes to `main`. |
| **Danger-path CODEOWNERS** | Danger surfaces become a file map (`migrations/`, `lib/money/`, `lib/auth/`, tenancy helpers…) owned by you. PRs touching them need your approval; everything else auto-merges on green. *(Alternative: a "rigor" status check that stays red on HEAVY until you approve.)* |
| **Hooks** (PreToolUse, `onFailure: "block"`) on **every** world-changing tool | Commit, push, PR merge (Bash *and* GitHub MCP), migration apply (Bash *and* Supabase MCP), deploy, sends. A hook that watches only `git commit` in Bash is not enough. |
| **Permission deny-list** | No `printenv` of credentials, no broad `git commit -m '*'` allows, no live-DB credentials for test runs. |
| **Test-DB guard** | Test setup refuses any database not named like a test DB. Tests can never touch live. |
| **Batch-authorized migrations** (D5) | See below. |

**The batch-authorization spec (D5):**
1. The agent prepares the migrations, applies them to the test DB, gets tests green, and confirms a backup or down-migration exists.
2. The agent writes a **batch record** listing each file with its content hash, the target, the order and an expiry (e.g. 48h).
3. You approve the batch once, by merging a PR or with a one-line approval.
4. Before each `apply_migration`, whether through MCP or shell, the hook checks:
   - the file hash matches the batch
   - the order is right
   - the batch hasn't expired
   - the target matches
   - the test-DB-first and backup checks are green

   Any mismatch blocks the call.
5. After each apply, the agent runs a verification query and records a **receipt** in the ledger.

*Analogy: a pre-approved payment run. You sign off the list once; any edit after your sign-off bounces automatically.*

### 4.3 Back pressure: autonomy is earned

Each project declares a **back-pressure ladder**, i.e. which automated checks
actually exist and are enforced:
```
typecheck → lint → unit → integration (DB) → UI/component → browser E2E → preview deploy → canary
```
**Rule:** the agent may act unattended only up to the highest rung that CI
*enforces*. A rung that exists but isn't required doesn't count.

### 4.4 Code quality

- **`CODE.md` authority:** for code what `DESIGN.md` is for UI. It holds:
  - one **exemplar file** per recurring pattern: endpoint, data fetch, error handling, auth check, money calculation and formatting, form validation
  - **layer rules**, e.g. UI never imports the DB layer
  - a **quality-zone map**:
    - core domain: strict
    - app glue: normal
    - prototypes/spikes: loose but quarantined
- **Reuse before write:** before creating a helper, search the graph or code for an existing one. This targets the biggest measured problem, duplication.
- **Executable conventions over prose:** lint rules, architecture tests (dependency rules), and a branded `Money` type with a lint ban on raw float money operations.
- **No-new-debt ratchet:** snapshot today's violations as a baseline. CI fails only if a PR makes them worse. Never demand perfection; forbid regression.
- **Quality floor in every lane:** no swallowed errors, no type escapes, no test weakening. Rigor varies *completeness*, never these.
- **Per-PR metrics, logged:**
  - complexity delta
  - duplication delta
  - file and function growth
  - type-escape count
  - mutation score on touched code, where feasible

### 4.5 Review

- **Layered:** deterministic checks first, then LLM review on what tools can't see: design, spec conformance, *did the build match the approved shape*.
- **Decorrelated:** the second reviewer gets a fresh context, a different role ("break this", not "review this"), and on HEAVY work a different model. Agreement between same-model agents is weak evidence.
- **Find, then verify:** broad finding pass, then each finding is verified by a separate agent. This raises precision and saves your attention.
- **Hunk-level risk map:** the PR tells you which changed blocks touch danger surfaces, so you read those and skim the rest.
- **Measured:** seed known bugs to measure reviewer *recall*; track findings accepted versus dismissed for *precision*.
- **Encode once:** a finding seen 3× becomes a lint rule, a `REVIEW.md` rule or a law, not a recurring comment.

### 4.6 Refactoring

- **Where:** hotspots = change frequency × complexity, plus coupling from the dependency graph. In the audited projects the top hotspots were a 3,872-line reporting service changed 40 times and an 809-line booking validator.
- **How:**
  - *Characterization tests* first, to snapshot current behaviour.
  - Mechanical changes are done by **codemod**, a script you review once, not 200 hand edits.
  - Judgment refactors (abstraction design) go through the show-me alignment with you.
- **When:** triggered by erosion thresholds, proposed by a scheduled routine, never mixed with feature PRs. Refactors touching danger surfaces stay HEAVY.

### 4.7 Context you can trust

- **Resolution order:**
  1. skill or memory match
  2. synced or derived (graph, ADRs, ledger)
  3. live lookup (code at HEAD, DB, MCP, web)
  4. write back as a *proposal*
- **Tiers:**
  - T0 always-on: tiny
  - T1 live lookups
  - T2 synced/cached
  - T3 derived summaries
- **Provenance on every fact:** source, as-of date and commit, scope, trust (human / agent-proposed / imported). A fact without provenance is a hint, not an authority.
- **Memory ownership:** five layers now, counting Claude Code's built-in auto-memory and AGENTS.md. Each fact has one home.
- **Budgets that measure the right thing:** measure tokens/bytes, not lines. Cap line length. Check that docs still match code: every path, model or check a LAWS/CONTEXT file names must exist (a CI "phantom check").
- **Promotion is a proposal:** an agent may *propose* a new rule with evidence from at least 2 sessions; you approve. Never auto-promote.

### 4.8 The forge: system of record

Per feature: `00-status.md` (gates and slices), `decisions.md` (what, why,
alternatives rejected, who approved, session link), and receipts (SHA, PR, checks,
migrations applied, render checks). Logged as **structured events** (JSON lines)
so they can be counted, not just read. The forge feeds context (T3) and learning (§4.9).

### 4.9 Learning loop: RL without weights

You can't retrain Claude, but you can run the RL *loop* on Keel itself:
- **Reward signals Keel already produces:**
  - gate approve/reject
  - LIGHT calls you later overturn
  - review findings accepted or dismissed
  - CI failures
  - post-merge fixes within 7 days
  - erosion deltas
- **Evals:**
  - the **audit pack** from this session becomes a portfolio eval: re-run after each Keel release and compare the JSON
  - `claude plugin eval` for skill triggering and behaviour: 3 runs with versus 3 without, Δ score, CI threshold
- **Hillclimbing:** change one thing, then keep it only if both the training set and the held-out set improve. Otherwise revert.
- **Guardrails:**
  - eval and test files are hook-protected during builds
  - keep a held-out set
  - run graders twice to check stability
  - never use "human approved" as the only reward (it breeds sycophancy)

### 4.10 Supply chain

- `keel.lock.json`: every upstream pinned to a commit SHA. Bumps go through a reviewed PR showing the instruction-file diff.
- A weekly drift routine: new upstream commits, instruction diffs, hidden-Unicode scan, then a bump PR.
- MCP tools are runtime trust, not install-time trust: allowlists, and connector writes are always surface 6.
- Keel itself is versioned. Every project records which Keel version it runs, so "vendored, unversioned" disappears.

### 4.11 Unattended runs

- `away` mode: a tray of prepared HEAVY work stopped at the gate, plus LIGHT work merged on green.
- Runs on `/loop`, routines and worktrees, with Workflow scripts for fan-out:
  - review axes plus verification
  - independent tickets in parallel
  - eval runs
- **Allowed only within the back-pressure ladder (§4.3).** Independence between tray items is proven, never assumed.

### 4.12 Packaging (one plugin)

```
keel/                         (one repo, one version)
  .claude-plugin/plugin.json, marketplace.json
  skills/      route laws spec verify-fact review tdd agent-security performance
               design handoff away  · lane routers · lean-context · harness-engineering
  hooks/       commit/push/merge/migration/deploy gates · test-DB guard · protect-evals
  workflows/   keel-review · keel-frontier · keel-eval
  templates/   CLAUDE · CONTEXT · LAWS · CODE · DESIGN · LEARNINGS · ARCHITECTURE · 00-status · decisions
  ci/          reusable GitHub Actions: checks · ratchet · phantom-check · rigor-check
  evals/       routing · lanes · audit-pack (portfolio)
  keel.lock.json
  docs/        systems-thinking · playbook · harness · memory contract
```

---

## 5. Rollout

| Phase | What | Where | Needs v3? |
|---|---|---|---|
| **0 · Now** | Urgent project fixes found by the audits (tracked privately) | affected projects | No |
| **1 · Enforcement baseline** | CI with required checks + branch protection + no direct pushes; add CI to the two repos without it | all 3 | No: plain GitHub config, highest return |
| **2 · Identity** | Agent bot/App identity; danger-path CODEOWNERS; HEAVY needs your approval | all 3 | No |
| **3 · v3 plugin build** | Merge the Keels, package as one plugin, lockfile, hooks, templates, evals | Keel | Yes |
| **4 · Pilot** | Install v3, re-run the audit pack, compare | Project A (smallest) | Yes |
| **5 · Roll out** | Project B, then Project C; batch-authorized migrations go live with Project C | ERPs | Yes |
| **6 · Learn** | Quality ratchets, hotspot refactors, eval loop, drift routine | all | Yes |

Phases 0–2 don't depend on Keel v3 and close most of the measured risk.

---

## 6. Scorecard: how we'll know it worked

Re-run the audit pack per project and track:

| Metric | Now (A / B / C) | Target direction |
|---|---|---|
| Merge-blocking CI steps | 0 / 0 / 0 | ≥ typecheck + tests + build, required |
| Post-merge fixes within 7 days | 3 / 6 / 29 | ↓ |
| Pattern variants (fetch/errors/auth/validation/money) | — / 4-5 / 4-5 | ↓ toward 1–2 each |
| Duplicated helpers | 5 / 5 / 5+ | ↓ (ratchet) |
| Money-as-float sites | 0 / few / ~109 | 0 in core zone |
| Docs naming things that don't exist | several | 0 (phantom check) |
| Your time per week on gates | unknown, start logging | flat or ↓ while coverage ↑ |

---

## 7. Open questions

1. Which GitHub mechanism for "HEAVY needs you": danger-path CODEOWNERS (simple, file-based) or a rigor status check (task-based)? Possibly both.
2. Which upstream tools survive (D8)? Run `/skill-doctor` on your machine for real usage numbers.
3. Name and home of the merged plugin: keep the Keel repo, or start fresh and archive the old two?
4. Staging for Project C, which chose "no staging". With batch-authorized live migrations, is a Supabase branch or preview DB worth adding as rung "integration (DB)"?
5. How often do you want the tray? Daily, or on demand?

---

## 8. Final guidance: how to get much faster, more accurate and more creative

"10x" is a direction, not a measured promise; Keel's own honesty rule applies.
Gains of that size come from **multiplying** a few levers, not adding many small ones.

### The core insight

Your bottleneck is no longer typing code; agents do 90%+ of that already. The
bottleneck is **your attention** and **rework**. So:
- **Speed** = fewer interruptions × more parallel work × less rework.
- **Accuracy** = checks that can't be skipped × context that is true.
- **Creativity** = cheap divergence early × firm convergence late.

### Speed

1. **Batch your attention.** One daily tray review (HEAVY approvals, migration batches, LIGHT audit sample) instead of being pinged per task. This is the biggest single lever: your time becomes reviewing finished, inspectable work rather than babysitting.
2. **Let LIGHT flow.** Auto-merge on green for no-surface work. Most tasks are LIGHT; each one no longer waits for you.
3. **Parallelize independent work.** Tracer-bullet tickets in separate worktrees, run by several agents at once, each stopping at its gate. Independence is proven by files touched, not assumed.
4. **Kill rework at the front.** Spend 10 minutes on the shape (show-me: signatures, file tree, flow diagram) before code. Rework is the hidden tax: Project C's 29 post-merge fixes are days of time.
5. **Keep context lean and true.** A small, accurate context makes the agent faster *and* smarter. Measure context in tokens, cap line length, run the phantom check.
6. **Encode every correction once.** Repeated feedback becomes a lint rule, an exemplar or a law. Every encoded lesson removes a future round-trip permanently. This is the compounding lever.

### Accuracy

1. **Maker ≠ checker.** The agent proposes, CI checks, you approve HEAVY under your own identity. Fixing this alone closes most measured risk.
2. **Deterministic first.** Types, lint, tests, architecture rules and the money type have a vote no agent can argue with. LLM review is for what machines can't see.
3. **Decorrelate your second opinion.** Fresh context, adversarial role, a different model on HEAVY. Two copies of the same reviewer share blind spots.
4. **Verify facts against the live system, not docs.** Your projects already follow the truth order (live > code > graph > docs). Make docs fail CI when they name things that don't exist.
5. **Measure the checkers.** Plant bugs to test your reviewer and your tests (mutation score). A check you've never seen fail is faith, not enforcement. One audited project already has this as a rule; make it standard.
6. **Close the PARTIAL laws.** Money exact in the app (not just the DB), tenancy enforced by the DB role (not just by convention). Two layers or it isn't done.

### Creativity

1. **Diverge cheaply, converge firmly.** For anything net-new (a screen, a feature concept, a landing page) have agents produce **3 genuinely different directions in parallel** (best-of-N), then *you* pick. Divergence is nearly free now; your taste is the scarce input.
2. **Quarantine exploration.** A "prototype" quality zone where agents can move fast and loose (spike branches, throwaway code), clearly separated from production. Creativity dies when every experiment needs HEAVY ceremony; safety dies when experiments leak into core code.
3. **Encode taste, not just rules.** `DESIGN.md` plus reference boards plus exemplar components, and a `CODE.md` with exemplar files. Agents imitate examples far better than they follow adjectives ("clean", "modern").
4. **Grill before build.** The grill session forces *you* to articulate the product intent. Most "uncreative" AI output comes from a vague brief, not a weak model.
5. **Use different minds for different jobs.** Different models and roles for ideation versus critique. Diversity of generators beats repeated sampling from one.
6. **Let constraints do creative work.** The laws, tokens and danger surfaces free agents to be bold everywhere else. A clear boundary is what makes it safe to say "go wild inside it."

### Your weekly operating rhythm

- **Daily (≈20–30 min):** clear the tray (approve or reject HEAVY packages and migration batches), spot-check 2–3 LIGHT merges.
- **Per feature:** grill → shape (show-me) → approve → let it run → tray.
- **Weekly:** read the scorecard (post-merge fixes, ratchet trend, open decisions); encode the week's repeated corrections.
- **Monthly:** re-run the audit pack across projects; bump pinned upstreams via a reviewed PR; prune unused skills.

---

## Appendix A: glossary (terms used in this doc)

| Term | Meaning |
|---|---|
| **Maker-checker** | The person or agent that does the work is not the one that approves it. |
| **Back pressure** | Automated checks that push back on bad work. Autonomy should not exceed them. |
| **Branch protection / required checks** | GitHub settings that physically block merging unless named checks pass and named people approve. |
| **CODEOWNERS** | A GitHub file assigning owners to paths; owners' approval can be required for changes there. |
| **Hook (PreToolUse)** | A script Claude Code runs before a tool call; it can block the call. Enforcement, not instruction. |
| **Content hash** | A fingerprint of a file's exact contents; any change produces a different hash. |
| **Ratchet** | A quality gate that only forbids getting worse, measured against a baseline. |
| **Hotspot** | Code that is both complex and frequently changed; the best place to refactor. |
| **Codemod** | A script that transforms code structurally (via its syntax tree), reviewed once and applied everywhere. |
| **Characterization test** | A test that snapshots what code currently does, so a refactor can prove it changed nothing. |
| **Mutation score** | % of deliberately injected bugs your tests catch. A stronger signal than coverage. |
| **Precision / recall (review)** | Of findings raised, how many were real / of real bugs, how many were found. |
| **Correlated errors** | Two checkers sharing the same blind spots, so their agreement proves little. |
| **Provenance** | Where a fact came from, how old it is, what it applies to. |
| **Goodhart's law / reward hacking** | When a measure becomes a target, it gets gamed (e.g. the 16,701-character line). |
| **RLVR** | RL with verifiable rewards (tests pass, build succeeds) rather than a judge's opinion. |
| **Best-of-N** | Generate N options; pick with a verifier or with taste. |
| **Hillclimbing** | Change one thing, measure, keep only if it improves on a held-out set. |

## Appendix B: sources and confidence

- Audits: read-only audits of three private projects (reports kept private); key numbers spot-checked by hand.
- Claude Code changes: anthropics/claude-code CHANGELOG v2.1.234–v2.1.296 (npm-dated), code.claude.com docs, platform.claude.com release notes.
- Feig/Merge: talk summary as provided, plus merge.dev "context graph misconceptions". Router/summarizer specifics unverified.
- Horthy/HumanLayer: "software factories" essays (~Jul 2026), `/show-me` skill post (Aug 2026). The "12-Factor Factories" title is unverified.
- SlopCodeBench: arXiv 2603.24755. 14.8% is the strict checkpoint solve rate under iterative extension.
- Skill-learning papers (e.g. arXiv 2608.28638), Snyk ToxicSkills, OWASP Agentic Skills Top 10 draft, harness study arXiv 2609.00006: via search summaries, not full reads.
- Lance Martin, "Automating eval design and hillclimbing" (Sep 28) and "Building effective agent automations" (Oct 8): via secondary summaries.
