# Keel — Playbook

How to run Keel at full potential. This is the operating discipline; the skills
are just the tools it wields. Read [ARCHITECTURE.md](ARCHITECTURE.md) for the
*why*, this for the *how*.

---

## The one principle

**Centralize judgment; parallelize labor; relentlessly lower coordination cost.**

You (with keel-v2 as your encoded judgment) are the orchestrator. Lane skills
and subagents are the specialists. The highest-output systems in history aren't
one genius *or* a flat swarm — they're a skilled individual who decomposes work
to specialists and re-integrates. Keel is that structure:

```
  YOU        ── taste, intent, the "why"        ← non-delegable
   │
  keel-v2    ── your judgment, encoded           ← coordination protocol
   │
  lane routers ── decompose & assign             ← keep coordination cheap
   │
  specialists / subagents ── parallel labor      ← disposable, cheap, many
```

Your scarce resource is the same as the model's: **attention / context**. Spend
it on judgment. Delegate everything else.

---

## The task loop (every task, four beats)

```
   TASK ─▶ keel-v2 scans rigor ─▶ lane router picks the specialist
                                         │
        human gate ◀─ tripwires/verify ◀─┘  (specialist does the work)
```

1. **Rigor** — keel-v2 scans the nine danger surfaces → FAST or HEAVY.
2. **Route** — the lane router triggers, picks the upstream specialist.
3. **Work** — the specialist does it; keel-v2 /review tripwires run in-turn.
4. **Gate** — security-relevant diffs pass keel-secure; outward/irreversible
   actions stop for a human yes. Verify before "done."

---

## The 5 habits (these matter more than the skills)

1. **Name your Authorities up front.** Point every build task at its source of
   truth (DESIGN.md, a comp, a spec). FAST collapses to one turn only when an
   Authority is named — otherwise it burns a round-trip asking.
2. **Use the one-shot FAST block** ([keel-v2/CLAUDE.md](skills/keel-v2/CLAUDE.md)
   §3) for anything low-risk. 1 turn instead of plan→ask→build.
3. **Curate per project — don't hoard.** Every installed skill's *description*
   taxes every turn (progressive disclosure keeps names+descriptions always
   loaded). Install only the lanes a repo actually uses.
4. **Verify, don't trust.** Use the `verify` skill or drive the real flow at the
   human gate keel-v2 already stops at. Verification is what lets you delegate
   at scale without re-reading everything.
5. **Encode every learning once.** A correction or constraint goes into
   CLAUDE.md / a skill / keel-v2 — never re-explained. This is the compounding
   move; it's how coordination cost keeps dropping.

---

## Per-workflow flows

| You're doing… | Flow through Keel |
|---|---|
| **Product development** | keel-v2 → `keel-dev` (superpowers/gstack) → `keel-secure` gate on trust-boundary code → verify → human commit. Design forks to `keel-design`. |
| **Systems / architecture** | Usually HEAVY (plan-first). Map first with the `Plan` agent + `graphify`; build via `keel-dev`; `keel-secure` before done. |
| **Automation** | Leave the synchronous lanes for the harness's own automation: `Workflow` (deterministic fan-out), `schedule`/cron (recurring), `keel-ops` MCP connectors (Zapier/Slack/Notion as the hands). |
| **Marketing** | `keel-marketing` (SEO/CRO/copy) → `keel-content` → humanizer (voice) → `keel-design`/fused-landing (the page). A pipeline; each stage a specialist. |
| **Research** | Mostly keel-v2's no-artifact lane — answer directly, no ceremony. `keel-research` picks the source-of-truth; `deep-research` for a big cited report. |

---

## The scaling levers (they multiply, not add)

1. **Parallelism** — independent work → many subagents at once (fan-out).
2. **Context hygiene** — keep the main thread lean; push mess into subagents and
   files. A clean context is a smart context; a bloated one degrades.
3. **Codified judgment** — every decision encoded once is never paid for again.
4. **Verification loops** — adversarial checks make output trustable un-read.
5. **Automation** — Workflows + schedules + MCP turn one-offs into infrastructure.

"1000x" is a mindset, not a number — but these stack multiplicatively, which is
where outsized gains actually come from.

---

## Anti-patterns (don't)

- Installing all lanes everywhere → description bloat + trigger dilution.
- Skipping the Authority → wasted planning round-trips.
- Running two overlapping engines (e.g. impeccable *and* frontend-design) on one
  task → coin-flip. Pick one primary per project.
- Merging upstreams into monolithic skills → freezes them, kills their internal
  structure, license soup. Route, don't merge.
- Re-explaining a constraint you've hit before → encode it instead.
- Auto-committing / auto-sending / auto-migrating → always stop at the human gate.
