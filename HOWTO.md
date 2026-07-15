# Keel — How to use (simple)

Your workflow for every project and every session. Keel is the **toolbox**;
keel-v2 is always-on and tells you which tool fits. Lanes are user-invoked —
you reach for them by name.

---

## Once per project (setup)

1. **Grill first.** Before any code, run a grill session — get interrogated
   about what you're actually building until it's clear. (`grill` / `grill-me`.)
2. **Install Keel + the lanes you'll use.**
   ```bash
   git submodule add https://github.com/sayeediftekhar/Keel .claude/skills
   cat .claude/skills/skills/keel-v2/CLAUDE.md >> CLAUDE.md   # arbiter always-on
   (cd .claude/skills && ./install.sh dev design)            # only the lanes you need
   ```
3. **Build the graph.** Run graphify on the repo so comprehension is cheap
   later (`graphify-out/` persists). Vendored upstreams are **not** host code —
   `install.sh` already adds the ignore entries (`.gitignore` / `.graphifyignore`
   / `.claudeignore`) so your code index skips `.claude/skills/keel/vendor/`.
   Never index vendored third-party code as your own; it drowns real queries.
4. **Capture shared language** in `CONTEXT.md` as terms emerge.

---

## Every session (the loop)

1. **Say what you want.** keel-v2 scans and sets the lane:
   `Rigor: FAST` (safe) or `Rigor: HEAVY` (auth/money/data/migrations).
2. **Reach for the tool** by name: `/keel-dev`, `/keel-design`, `/keel-marketing`…
   keel-v2 will name the right one if you're unsure.
3. **Let the pipeline run** (dev example): grill → to-spec → to-tickets →
   implement (`tdd` at seams) → code-review → verify. Use **graphify** to
   navigate the code, not grep.
4. **Reach for a power-tool by name** when you want it: `/qa` (real browser),
   `/cso` (security), the superpowers autonomous executor for a big approved plan.
5. **Stop at the gate.** keel-v2 stops before commit / deploy / send. **You**
   commit — Keel never auto-commits.
6. **Capture & hand off.** Note learnings; if you'll continue later, write a
   `handoff` doc so the next session picks up clean.

---

## The rules that never bend
- **keel-v2 wins.** Rigor, a11y, design conformance, security, human gates —
  above every shortcut and every tool.
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
| Test a live app | `/qa` (gstack power-tool) |
| Security-check a diff | `/keel-secure` → VibeSec (+ `/cso`) |
| Run a big plan hands-off | superpowers autonomous executor (stops at gates) |
| Design/UI | `/keel-design` (impeccable) |
| Add a capability | `./install.sh <lane>` |

Deeper reference: [PLAYBOOK.md](PLAYBOOK.md) · [ARCHITECTURE.md](ARCHITECTURE.md) ·
[catalog.md](catalog.md) · conventions in [conventions/tickets-and-context.md](conventions/tickets-and-context.md).
