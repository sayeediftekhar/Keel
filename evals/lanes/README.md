# Lane-triggering eval

Checks that the **lane routers** (`keel-design`, `keel-marketing`, …) dispatch a
task to the correct specialist upstream — the layer *below* keel-v2's FAST/HEAVY
decision.

## Design

- `cases.jsonl` — each: `id`, `lane`, `task`, `expected_dispatch` (the specialist
  the lane's `SKILL.md` dispatch table should pick), `note`.
- Covers each dispatch-table row plus the two ambiguity rules that are easy to get
  wrong: the design **collision rule** (`impeccable` vs `frontend-design` vs
  `fused-landing`) and the marketing **precedence rule** (`claude-seo` vs
  `marketingskills` for SEO).

## How it's run

Each case goes to a **fresh agent** given the lane's actual `SKILL.md` router and
one task — nothing else. It returns strict JSON:

```json
{"dispatch": "<specialist>", "rigor": "FAST"|"HEAVY", "reason": "<one sentence>"}
```

Scored on `dispatch` (does the right specialist get named). This validates the
router's *decision*, not the specialist's install state or output quality — see
the caveats in [RESULTS.md](RESULTS.md).
