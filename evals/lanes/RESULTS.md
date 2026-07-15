# Lane-triggering eval — results

- **Date:** 2026-07-15
- **Cases:** 7 (`cases.jsonl`) — 3 design, 4 marketing
- **Classifier:** one fresh agent per case (Opus 4.8), given the lane's real `SKILL.md` router + one task
- **Headline — correct dispatch: 7 / 7 (100%)** · rigor: 7/7 FAST (correct)

## Per-case

| id | lane | task (short) | expected | dispatched | ok |
|----|------|--------------|----------|------------|----|
| D1 | design | brand hero + pricing landing page | `fused-landing` | `fused-landing` | ✅ |
| D2 | design | audit/polish dashboard taste + animate | `impeccable` | `impeccable` | ✅ |
| D3 | design | official Anthropic baseline, de-AI the frontend | `frontend-design` | `frontend-design` | ✅ |
| M1 | marketing | pricing-page copy + CRO | `marketingskills` | `marketingskills` | ✅ |
| M2 | marketing | technical SEO/GEO audit | `claude-seo` | `claude-seo` | ✅ |
| M3 | marketing | LinkedIn DM triage + drafts | `kondo` | `kondo` | ✅ |
| M4 | marketing | full campaign, SEO as one part | `marketingskills` | `marketingskills` | ✅ |

## What the tricky cases prove

- **Design collision rule:** a landing page (D1) went to `fused-landing`, not the
  taste engines; "polish/animate" (D2) took the `impeccable` default; "official
  Anthropic baseline" (D3) correctly switched to `frontend-design`. The two
  overlapping taste engines did not coin-flip.
- **Marketing precedence rule:** a *dedicated* SEO audit (M2) went to the deeper
  `claude-seo`, while SEO *inside a broader campaign* (M4) stayed with
  `marketingskills`. The overlap resolved the way the router intends.

## Honest caveats

- This tests **dispatch** — does the router name the correct specialist — **not**
  whether that specialist is installed or whether its output is good. The targets
  are third-party upstreams (`impeccable`, `claude-seo`, `kondo`, …); their
  install state and quality are separate. `./install.sh design` / `marketing`
  pulls/points to them; `kondo` also needs its own browser extension + account.
- Same as the routing eval: Opus 4.8, single trial per case, small set. Re-run on
  a cheaper model and with more cases for tighter confidence.
