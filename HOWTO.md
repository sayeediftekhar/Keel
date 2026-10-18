# Keel — How to use (simple)

Your workflow for every project and every session. Keel is the **toolbox**;
keel-v2 is always-on and tells you which tool fits. Lanes are user-invoked —
you reach for them by name (`/keel:keel-dev` with the plugin, `/keel-dev` in
the submodule layout).

---

## Once per machine

```
/plugin install keel --marketplace sayeediftekhar/Keel
```

and an alias for the CLI (`/plugin` shows the plugin directory):
`alias keel='node <plugin>/plugin/bin/keel.mjs'`. Create the agent's GitHub
App once ([docs/v3/GUIDE.md §0](docs/v3/GUIDE.md)).

## Once per project (setup)

1. **Grill first.** Before any code, run a grill session — get interrogated
   about what you're actually building until it's clear. (`grill-with-docs` for
   code work, `grill-me` for anything else.)
2. **`keel init`** (or `/keel:keel-setup` in a session). It writes
   `keel.policy.json`, the keel-v2 Tier-1 router block and the standing
   authorization into `CLAUDE.md`, and scaffolds `CONTEXT.md`, `GLOSSARY.md`,
   `CODING_STANDARDS.md`, `DESIGN.md`, `LAWS.md`, `LEARNINGS.md`, `docs/INDEX.md`,
   `docs/ARCHITECTURE.md` and `.scratch/` — only the ones you don't
   have. Fill the policy (approver, the App's bot login, your danger paths,
   the checks CI must pass) and run `keel init` again; fill the scaffolds
   (`DESIGN.md` + `CONTEXT.md` are the brand — see [RECIPES.md](RECIPES.md)).
3. **`keel compile`**, one PR marked `Rigor: HEAVY — governance`, merged by
   you. Apply the ruleset it printed (repo admin, once). **`keel doctor`**
   until every required line is `ENFORCED` or `OK`.
4. **Install the dev spine** (Matt Pocock's skills) — `./install.sh dev` from
   the plugin directory prints this; run it from the project root, then the
   setup once in Claude Code:
   ```bash
   claude plugin install mattpocock-skills@claude-plugins-official --scope project
   ```
   `/setup-matt-pocock-skills` → pick **local files** (tickets in `.scratch/`)
   or **GitHub/GitLab** (needed for parallel or cloud agents — see below).
   Project scope keeps its skills out of your other projects' sessions. Other
   lanes' upstreams install the same way: `./install.sh design`, `… secure`.
5. **Build the graph.** Run graphify on the repo so comprehension is cheap
   later (`graphify-out/` persists). In the submodule layout, vendored
   upstreams are **not** host code — `install.sh` adds the ignore entries
   (`.gitignore` / `.graphifyignore`) and a `permissions.deny` Read rule for
   vendor noise in `.claude/settings.json`, so your code index and Claude's
   search skip `.claude/keel/vendor/`. Never index vendored third-party code
   as your own; it drowns real queries.
6. **Capture shared language** in `GLOSSARY.md` as terms emerge, and track
   gate/slice state in `.scratch/<feat>/00-status.md` (committed) so any
   session resumes from one file (see [conventions](conventions/tickets-and-context.md)).

**Submodule layout instead of the plugin** (still supported, same files):
```bash
git submodule add https://github.com/sayeediftekhar/Keel .claude/keel
(cd .claude/keel && ./install.sh arbiter)      # keel-v2 router + LAWS → CLAUDE.md (keel init writes the Tier-1 version)
(cd .claude/keel && ./install.sh dev design)   # only the lanes you need; links them into .claude/skills/
(cd .claude/keel && ./install.sh check)        # verify the wiring; then /skills in a fresh session
node .claude/keel/plugin/bin/keel.mjs init     # gates: same CLI, same files
```

---

## Updating an existing project (when you want Keel's latest)

**Plugin:** `/plugin update keel@keel` (or reinstall), then `keel init` in each
project to refresh the two managed `CLAUDE.md` blocks, and `keel compile` +
`keel doctor` if the plugin added a gate (the doctor says so).

**Submodule layout:** projects pin Keel to a commit — they don't auto-update.
When you want new improvements, in the consuming project:

```bash
git submodule update --remote .claude/keel          # pull latest Keel
git add .claude/keel && git commit -m "update Keel"

(cd .claude/keel && ./install.sh arbiter)            # refresh keel-v2 router + LAWS (idempotent)
(cd .claude/keel && ./install.sh dev design)         # re-apply lanes, links, pins, ignore + deny rules
(cd .claude/keel && ./install.sh check)
```
Then rebuild the map: **`graphify update .`** (drops any vendored nodes an older
install indexed).

**Migrating from the old `.claude/skills` layout** (projects set up before the
`.claude/keel` convention) — once:

```bash
git mv .claude/skills .claude/keel                   # moves the submodule + updates .gitmodules
(cd .claude/keel && ./install.sh arbiter && ./install.sh dev design && ./install.sh check)
git add -A && git commit -m "keel: move submodule to .claude/keel"
```
The old layout nested the skills at `.claude/skills/skills/<name>/`, a depth
Claude Code does not document scanning. The installer now links each skill at
`.claude/skills/<name>` where discovery is guaranteed.

One-time only: if this project still has an old hand-pasted keel-v2 block in
`CLAUDE.md` (from before `./install.sh arbiter` existed), delete it once — the
managed block replaces it going forward.

One-time catch-ups for projects set up before 2026-10:
- **Spine not installed?** `claude plugin list` — if `mattpocock-skills` is
  missing, do setup step 3. Until then keel-dev only imitates those skills.
- **Glossary inside `CONTEXT.md`?** Move that section to `GLOSSARY.md`; the
  context/brand/rules part stays in `CONTEXT.md`.
- **No `CODING_STANDARDS.md`?** Setup step 4.

---

## Every session (the loop)

1. **Say what you want.** keel-v2 scans and sets the lane:
   `Rigor: FAST` (safe) or `Rigor: HEAVY` (auth/money/data/migrations).
2. **Reach for the tool** by name: `/keel-dev`, `/keel-design`, `/keel-marketing`…
   keel-v2 will name the right one if you're unsure.
3. **Let the pipeline run** (dev example): grill-with-docs → (wayfinder, for
   epics) → to-spec (`prototype` to settle a state model) → to-tickets →
   implement (`tdd` at seams) → mattpocock-skills:code-review → keel-qa /
   keel-verify → pr → retro. Use **graphify** to navigate the code, not grep.
4. **Reach for a second pass by name** when you want one: `/code-review`
   (built-in correctness bug hunt, alongside Pocock's standards/spec review),
   `/security-review` (built-in second security pass).
5. **Stop at the gate.** FAST work ends as a PR that auto-merges on green
   (the standing authorization `keel init` wrote into `CLAUDE.md`); skim a few
   a day. HEAVY work ends as a PR that waits for **your** review — the
   `keel-rigor` check stays red until you approve (your own HEAVY PRs pass:
   GitHub won't let you approve them, so your authorship counts, D21). The gates G1/G2/G3/Ship in
   `00-status.md` are yours to flip (`keel approve <feature> G3 "<why>"`),
   never the agent's. Deploys, sends and live migrations are never automatic.
6. **Capture & hand off.** Note learnings; if you'll continue later, write a
   `handoff` doc so the next session picks up clean.

---

## Running agents in parallel

Tickets are the unit of parallel work. Any tickets whose blockers are all done
(the **frontier**) can run at the same time — one agent session each, in its own
worktree. A `wayfinder` epic works the same way, one session per decision
ticket. For this, use **tracker mode**: every session, local or cloud, sees one
shared board, while `.scratch/` files only reach sessions on your machine.
Each agent still stops at keel-v2's gates; you approve, merge and commit.

---

## Keeping a production app healthy

Once a project ships, set up keel-dev's **Maintain** loop once — each job is a
scheduled routine (`/schedule`) that ends at a PR, a ticket or a step for you:

- **Weekly:** dependency + security updates → a PR you merge.
- **On an alert:** `diagnosing-bugs` on the Sentry issue (connect once:
  `claude mcp add --transport http --scope project sentry https://mcp.sentry.dev/mcp/<org>/<project>`)
  → a fix PR or a ticket.
- **When production breaks:** roll back first (Vercel apps: instant rollback via
  the Vercel plugin — you confirm the target), then diagnose, then `retro` as
  the postmortem.
- **Monthly:** `improve-codebase-architecture` → tickets.

Full table: [keel-dev → Maintain](skills/keel-dev/SKILL.md). Mark any job you
don't need as *not needed* in `CONTEXT.md` so nobody re-asks.

---

## The rules that never bend
- **keel-v2 wins.** Rigor, a11y, design conformance, security, human gates —
  above every shortcut and every tool. Eleven danger surfaces; any one → HEAVY.
- **FAST = minimal, HEAVY = complete.** Rigor decides how much you build.
- **graphify-first** for understanding code; grep only for exact known strings.
- **One spine, power-tools opt-in.** No coin-flip between methodologies.
- **Honest trade-offs.** Every route states what it costs (tokens/accuracy/
  latency), labeled `est.` unless measured. No fake precision.

---

## Cheat sheet
| I want to… | Do |
|---|---|
| Start a project/feature | Grill first, then `/keel-dev` |
| Move fast on safe work | Name your Authority + one-shot FAST block |
| Build something risky | Just describe it — keel-v2 forces HEAVY |
| Understand the codebase | graphify (`query`/`path`/`explain`) |
| Test a live app | `/keel-qa` (real browser, evidence per criterion) |
| Security-check a diff | `/keel-secure` → VibeSec (+ built-in `/security-review`) |
| Run a big plan hands-off | `implement-spec` on the approved tickets, or one session per frontier ticket (both stop at gates) |
| Keep a shipped app healthy | keel-dev → *Maintain* loop (scheduled, ends at PRs) |
| Roll back a bad deploy | Vercel plugin instant rollback — you confirm the target |
| Plan an epic (more than one session) | `wayfinder` |
| Split work across agents | tracker mode + one session per frontier ticket |
| Do steps only I can (secrets, dashboards) | `wizard` |
| Learn from a session | `retro` |
| Design/UI | `/keel-design` (impeccable) |
| Add a capability | `./install.sh <lane>` (parked extras skipped) |
| Add one parked extra (e.g. video) | `./install.sh hyperframes` |
| Prove a change before calling it done | `keel-verify` (paste the real output) |
| Approve a HEAVY gate | `keel approve <feature> <G1\|G2\|G3\|Ship> "<why>"` (or `bin/keel-approve`) |
| Set up / refresh a project | `keel init` → `keel compile` → `keel doctor` (`/keel:keel-setup` in a session) |

Deeper reference: [RECIPES.md](RECIPES.md) (per-project cookbook) ·
[MEMORY-CONTRACT.md](MEMORY-CONTRACT.md) (how the memory layers compose) ·
[PLAYBOOK.md](PLAYBOOK.md) · [ARCHITECTURE.md](ARCHITECTURE.md) ·
[catalog.md](catalog.md) · conventions in [conventions/tickets-and-context.md](conventions/tickets-and-context.md).
