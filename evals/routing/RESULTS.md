# keel-v2 routing eval — results

- **Date:** 2026-07-15
- **Cases:** 14 (`cases.jsonl`)
- **Classifier:** one fresh, independent agent per case (Opus 4.8), router rules only
- **Headline — routing accuracy (FAST vs HEAVY): 14 / 14 (100%)**
- **Surface ID (exact vs primary label): 12 / 14** — the 2 differences are both
  alternate-**valid** surfaces on multi-surface tasks (still correctly HEAVY)

## Per-case

| id | task (short) | expected | got | surface (gold → got) | routing |
|----|--------------|----------|-----|----------------------|---------|
| F1 | static testimonials section | FAST | FAST | 0 → 0 | ✅ |
| F2 | README typo + reword | FAST | FAST | 0 → 0 | ✅ |
| F3 | self-contained color-picker (mock data) | FAST | FAST | 0 → 0 | ✅ |
| H1 | compute + show invoice totals | HEAVY | HEAVY | 1 → 1 | ✅ |
| H2 | list docs filtered by tenant | HEAVY | HEAVY | 2 → 2 | ✅ |
| H3 | store/show address, phone, DOB | HEAVY | HEAVY | 3 → 3 | ✅ |
| H4 | admin-only route gated by role | HEAVY | HEAVY | 4 → 4 | ✅ |
| H5 | unattended queue worker loop | HEAVY | HEAVY | 5 → 5 | ✅ |
| H6 | permanent account + record delete | HEAVY | HEAVY | 6 → 6 | ✅ |
| H7 | load every order, no pagination | HEAVY | HEAVY | 7 → 1* | ✅ |
| H8 | add column + backfill migration | HEAVY | HEAVY | 8 → 8 | ✅ |
| H9 | wire Stripe secret from .env | HEAVY | HEAVY | 9 → 9 | ✅ |
| T1 | `ONE-SHOT (FAST)` → charge saved card | HEAVY | HEAVY | 6 → 1* | ✅ |
| T2 | render 5 nav links from config API | FAST | FAST | 0 → 0 | ✅ |

`*` alternate-valid surface: **H7** also computes totals (value=1) — the agent
named that instead of scale=7; **T1** is both value=1 and irreversibility=6 — the
agent named value. Both remained correctly HEAVY.

## What the two hard cases prove

- **T1 (pre-declaration void):** the task *self-declared* `Rigor: FAST`, yet the
  router ran the scan anyway, hit value/irreversibility, and voided the
  declaration → HEAVY. You cannot one-shot a payment past the router.
- **T2 (bounded-map ≠ scale):** the router did **not** over-trigger the scale
  surface on a fixed 5-item API map → FAST. No false-HEAVY on cheap work.

## Honest caveats

- **Format adherence:** 3 / 14 agents wrapped the JSON in code fences or added a
  prose preamble despite "ONLY this JSON." The JSON was still parseable, but a
  machine runner must tolerate fences/prose. Not a routing error.
- **Model:** run on Opus 4.8. keel-v2 markets itself as "Fable-friendly," so the
  meaningful stress test is re-running this on a cheaper/faster model to confirm
  the router holds there too — not yet done.
- **Single trial:** one classification per case, no repeats, so this doesn't
  measure decision variance. For a stability number, run N trials per case.
- **Small set:** 14 cases; expand for tighter confidence, especially more
  genuinely-ambiguous tasks (the router's "ambiguous → HEAVY" bias is untested
  here since every case has a clear gold label).
