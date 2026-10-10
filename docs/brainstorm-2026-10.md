# Keel — brainstorm, Oct 2026: toward v3

Status: **brainstorm, not a decision.** Nothing here changes Keel's behavior
until it lands as its own reviewed PR. Inputs:

1. Gil Feig (Merge) — *context graphs / the company brain*: synced data +
   router + summarizer + memory + skills; tiers of context; provenance.
2. Dex Horthy (HumanLayer) — *software factories*: unattended models erode
   architecture; plan before building, align visually, back pressure, a
   "forge" as the system of record.
3. What shipped in the Claude Code harness / API, mid-Aug → Oct 10, 2026.
4. Practitioner + research consensus on agentic engineering (2026).

Sources and confidence notes are at the bottom. `[unverified]` = single or
secondary source.

---

## The thesis in one picture

Keel v2 has **two routers** and enforces both **in prose**:

- **Rigor router** (keel-v2) — *how careful* (FAST / HEAVY).
- **Capability router** (lanes) — *which tool* (L2 → L3 upstreams).

The three inputs converge on what's missing:

```
            ┌──────────────── Keel v3 (proposal) ─────────────────┐
  TASK ───▶ │ RIGOR router      how careful      (keel-v2, exists) │
            │ CAPABILITY router which tool       (lanes, exists)   │
            │ CONTEXT router    which source     (NEW — Feig)      │
            ├──────────────────────────────────────────────────────┤
            │ ENFORCEMENT  hooks / plugin eval / pins  (NEW —      │
            │              policy moves from prose into config)    │
            ├──────────────────────────────────────────────────────┤
            │ FORGE  decisions + plans + traces as the system of   │
            │        record (00-status grows up — Horthy)          │
            └──────────────────────────────────────────────────────┘
```

Autonomy is earned by **back pressure** (how cheaply the work can be
verified), not granted by a prose rule.

---

## A. Context router — "the company brain" for a project (Feig)

Keel already has most of the parts: a router (keel-v2), memory layers
(MEMORY-CONTRACT), skills, a glossary (CONTEXT.md), live connectors
(keel-ops MCPs), freshness (R6), promotion (R4). What it lacks is the
**resolution order** and **provenance**.

**A1. Context resolution order** (Feig's flowchart → keel-v2 §4):

1. **Skill / memory match?** CLAUDE.md, CONTEXT.md, `memory.md`, a skill
   that encodes the procedure → use it, stop.
2. **Synced / cached?** graphify graph, claude-mem index, ADRs, gate
   digests → retrieve by file/symbol (R3).
3. **Missing or stale?** Live lookup: grep the just-edited area, MCP
   (Slack/Notion/Granola), web.
4. **Write back.** Store the *outcome* as a derived summary or a memory
   *proposal* (see A5) so the next query stops at step 1 or 2.

**A2. Four tiers of context** (maps onto what Keel already owns):

| Tier | Feig | Keel today | Cost / depth |
|---|---|---|---|
| T0 | Prompt / instructions | keel-v2, CLAUDE.md/AGENTS.md, CONTEXT.md, skills | always loaded → keep tiny |
| T1 | Live API | grep, MCP connectors, web | cheap per call, shallow, can time out |
| T2 | Synced / cached | graphify, claude-mem, (new) synced connector snapshots | deep + semantic, can be stale |
| T3 | Derived | (new) gate digests, module summaries, LESSONS, ADRs | computed once, reused forever |

**A3. Provenance on everything injected.** Generalize R6 (freshness) from the
graph to every layer. Each `memory.md` entry / derived summary carries:
`source` (session/PR/doc), `as_of` (date + commit SHA), `scope`
(project / user / org / client), `trust` (human-written · agent-proposed ·
imported). Rule: a fact without provenance is a hint, not an Authority.

**A4. A fifth memory layer the contract ignores.** Claude Code's built-in
**auto-memory** (MEMORY.md) now overlaps both claude-mem and `memory.md`, and
Claude Code now reads **AGENTS.md** when there's no CLAUDE.md. The contract
must say who owns what, or R1 ("one fact, one home") is already broken.

**A5. Promotion is a proposal, never an auto-write.** Research this year is
consistent: curated skills raise pass rates; *self-generated* skills land
below the no-skill baseline. So R4 (episodic → semantic) becomes: the agent
*proposes* a rule with evidence from ≥2 sessions; a human approves. A weekly
"consolidation" routine ("dreaming") opens a PR — it never edits rules in
place.

**A6. Operational definitions.** Feig's "how *we* define a happy customer"
= extend CONTEXT.md entries from *what a term means* to *how to judge or
compute it*. This is where client brands/businesses (RECIPES) get encoded.

**A7. Synced company data is HEAVY by Keel's own laws.** Syncing
Slack/Notion/meeting notes into a local index touches PII (3) and scope (2),
and — once an agent reads it — untrusted input. Widen surface 5 from
"unattended/looping" to also cover **"an agent consumes untrusted input and
can reach data or act"** (your account-level `route` skill already defines
it this way). Any synced snapshot carries a scope label.

---

## B. Keel as a software factory (Horthy)

Keel already has: plan-first HEAVY, phase gates, `00-status.md` (adapted
from a Software Factory Playbook), tracer-bullet tickets, two-axis review.
What the talk exposes:

**B1. Back pressure as a first-class concept.** *A loop gets only as much
autonomy as can be cheaply and reliably verified.* Define a per-project
**back-pressure ladder** in `00-status.md` / CONTEXT.md:

```
typecheck/lint → unit tests → integration → browser QA (agent-browser,
gstack /qa) → feature flag → canary
```

keel-v2 uses it: unattended or FAST-autonomous work is only allowed up to
the highest rung the project actually has. No tests → no unattended build.

**B2. Plan at the level of code shape, and align visually.** Horthy's fix
for slop is planning *types, signatures, layout, call stacks* up front, and
calls reviewing long plan prose "anti-leverage". HEAVY gate G2 should
require a **show-me** artifact: the smallest visual that pins the shape —
file tree, signatures, call tree, Mermaid, or an HTML Artifact — instead
of a wall of text. (HumanLayer ships `/show-me`; Claude Code has Artifacts.)

**B3. Erosion is measured, not exhorted.** SlopCodeBench: quality *prompts*
improve the starting point but do **not** slow degradation over iterative
extension (erosion rose in ~77% of trajectories). So add a tripwire that
*measures*: complexity delta, duplication, file/function growth,
verbosity — per PR — and schedule phase 9 (arch health) as a recurring
routine, not "periodic" in prose. Humans keep reading merges to core code.

**B4. The forge: decisions as the system of record.** Foundation Capital's
"decision traces" + Horthy's "forge" = for Keel: add
`.scratch/<feat>/decisions.md` — what was decided, why, alternatives
rejected, who approved, session link. Link session/trace URLs in
`00-status.md` and PR bodies. These become T3 derived context (A2), so the
next feature retrieves *why*, not just *what*.

**B5. Unattended runs need a mechanism, not a sentence.** keel-v2 says
"unattended runs stop AT the gate" but ships no way to run them. Your
account-level **`away`** skill already defines one (tray, hard stop-line,
proven independence, park-on-question). Bring it into Keel and bind it to
the harness: `/loop`, Routines, worktrees, Workflow scripts.

**B6. Ship workflows, not just skills.** The harness Workflow tool runs
deterministic multi-agent scripts. Candidates in `.claude/workflows/`:
`keel-review` (fan out review axes → adversarial verify each finding),
`keel-frontier` (work independent tickets in parallel worktrees up to the
gate), `keel-eval` (run the routing/lane suites).

---

## C. Move policy from prose into the harness

Research consensus (and a source-code study of 11 harnesses): behavioral
policy is migrating from prompt prose into configuration. Keel is ~100%
prose today.

**C1. Auto mode is now the default permission mode** (Claude Code, late
Sep). Permission prompts no longer reliably stop a commit/push/migration —
so Keel's "human gate" is currently enforced only by the model reading
keel-v2. Make the gates real with **hooks**:
- `PreToolUse` on `git commit` / `git push` / migration / deploy commands →
  block unless `00-status.md` shows the gate approved (now supports
  `onFailure: "block"`).
- `Stop` / `SubagentStop` prompt hook → run the /review tripwires.
- `UserPromptSubmit` / `SessionStart` → inject the rigor line + current
  gate from `00-status.md`.

**C2. Real evals with `claude plugin eval`.** Port `evals/routing` and
`evals/lanes` to its format: 3 runs with / 3 without, Δ score, graders
(`tool_used: Skill` catches lanes that don't trigger), `--threshold` in CI.
Fixes today's caveat (single trial, one model, Opus 4.8) and finally tests
the "Fable-friendly" claim on Fable 5.1. Then *hillclimb* descriptions
against a held-out set.

**C3. Hygiene pass with new built-ins.** Run `/skill-doctor` (context cost,
never-invoked skills) and `/doctor prompt-audit` (patterns written for
older models, contradictions, broken refs). Known stale refs: "Opus 4.8"
in evals, the "≈15× Opus vs Fable" cost claim in MEMORY-CONTRACT (unsourced
— re-check against current pricing).

**C4. Distribute as a plugin / marketplace.** Hooks, skills, workflows,
agents and evals travel together in a plugin; install.sh's CLAUDE.md block
injection and submodule dance could shrink. Open question: how the
always-on arbiter loads (SessionStart hook vs CLAUDE.md/AGENTS.md block).

**C5. One source of truth for routing.** Your account-level `route` and
`away` skills use Keel's nine surfaces but differ on substance:

| | keel-v2 | `route` skill |
|---|---|---|
| Who decides rigor | agent; never stops to ask | agent recommends, **human decides** |
| Default when unsure | HEAVY | HEAVY (and HEAVY if no decision recorded) |
| Surface 5 | unattended/looping execution | agent consumes untrusted input + can act |
| Surface 7 | unbounded queries at prod N | hot path (frequency / large data) |
| Extras | — | `/laws`, `/verify-fact`, override record |

Running both is Keel's own "coin-flip" anti-pattern. Pick one canonical
LAWS and make the other a thin pointer.

---

## D. Supply chain (Keel routes to third-party instructions)

**D1. Pin upstreams.** `install.sh` clones `--depth 1` at HEAD and re-install
runs `git pull --ff-only` — any upstream commit flows straight into agent
instructions unreviewed. Add a `keel.lock.json` (repo → commit SHA), install
the pinned SHA, bump via reviewed PR that shows the `SKILL.md` diff. This
is the 2026 threat model: Snyk found 76 malicious payloads in one public
skill registry; OWASP's Agentic Skills Top 10 draft recommends pinned
versions and verified publishers; scanners are bypassable.

**D2. Weekly drift routine.** A scheduled run lists new upstream commits,
diffs any instruction files, flags hidden Unicode / instruction-like text,
and opens a bump PR. Human merges.

**D3. MCP is runtime trust, not install-time trust.** Tool metadata can
change after install ("delayed payload" servers). Recommend managed-settings
allowlists for marketplaces / MCP servers `[unverified setting names]`, and
treat every connector *write* as surface 6 (already true in keel-ops).

---

## Suggested order

| When | Item | Why first |
|---|---|---|
| **Now** | D1 pin upstreams | biggest risk, small change |
| **Now** | C5 reconcile `route`/`away` with keel-v2 | removes a coin-flip at the root |
| **Now** | C3 hygiene (stale models, prompt-audit, skill-doctor) | cheap, unblocks evals |
| **Now** | A1–A4 context resolution order + provenance + 5th layer in MEMORY-CONTRACT | doc-only, sets the v3 frame |
| **Next** | C1 hooks for gates (auto mode makes this urgent) | turns prose gates into real ones |
| **Next** | C2 port evals to `claude plugin eval` | measure before tuning |
| **Next** | B1 back-pressure ladder · B2 show-me gate · B4 decisions.md | the factory core |
| **Later** | B5 `away` + loops · B6 workflows · C4 plugin packaging | distribution + autonomy |
| **Later** | A5 consolidation routine · A7 synced company context · B3 erosion metrics · D2 drift routine | needs C1/C2 in place first |

## Open questions for the human

1. Is Keel only a **code** factory, or also the **company brain** for
   clients (marketing/finance/legal lanes reading synced business data)?
   A7 only matters for the second.
2. Which is canonical: keel-v2 ("agent decides, never asks") or `route`
   ("human decides")? They encode different trust models.
3. Distribution: keep submodule + install.sh, or move to a plugin
   marketplace?
4. How much unattended running do you actually want (B5)? That decides how
   much of C1 and B1 is required before anything else.

---

## Sources & confidence

Claude Code facts: anthropics/claude-code CHANGELOG (v2.1.234–v2.1.296,
dated by npm publish time), code.claude.com docs (plugin-evals, skills,
memory, mods, workflows), platform.claude.com release notes.

- Auto mode default (v2.1.283–285, late Sep); hooks `onFailure: "block"`
  (v2.1.295); AGENTS.md read when no CLAUDE.md (v2.1.277); `claude plugin
  eval` (v2.1.269); `/skill-doctor` (v2.1.252/261 — sources disagree);
  `/doctor prompt-audit` (v2.1.283); Claude Mods (v2.1.287); Agent Skills
  GA on the API (Aug 19); API on-demand compaction beta (Sep 14); Managed
  Agents dynamic workflows beta (Oct 9).
- Lance Martin, "Automating eval design and hillclimbing with Claude"
  (claude.dev, Sep 28) and "Building effective agent automations" (Oct 8) —
  read via secondary summaries only.
- Feig / Merge: AI Engineer talk; merge.dev/blog/context-graph-misconceptions.
  Router/summarizer components and the 4th tier come from the talk summary
  supplied by the human; not independently confirmed.
- Foundation Capital, "Context graphs" (Dec 2025) — decision traces.
- Horthy / HumanLayer: "software factories" essays (~Jul 2026),
  humanlayer.com/blog/show-me-skill (Aug 2026), 12-factor-agents. The
  "12-Factor Factories" title is `[unverified]`.
- SlopCodeBench, arXiv 2603.24755: 14.8% is the top *strict checkpoint
  solve rate under iterative extension*, not a "maintainability" score;
  earlier versions reported different numbers.
- Skill-learning papers (arXiv 2608.28638 et al.) — self-generated skills
  below baseline; curated skills help.
- Snyk ToxicSkills; OWASP Agentic Skills Top 10 (draft).
- Harness study, arXiv 2609.00006 — policy migrating from prose to config.
