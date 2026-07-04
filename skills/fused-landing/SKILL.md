---
name: fused-landing
description: >-
  Build or restyle landing/marketing pages by fusing a structured workflow
  (read DESIGN.md → plan sections → build → self-check) with strict token
  discipline: DESIGN.md tokens only, no ad-hoc hex, one focal point per view,
  no AI-slop anti-patterns. Defers to keel-v2 tripwires. Use for landing
  pages, marketing pages, hero sections, and pricing/CTA blocks.
---

# Fused Landing

Structured build + strict conformance. Two halves, one skill: the **workflow**
says in what order; the **token discipline** says with what materials.

## 0. Routing (keel-v2 decides)

A static landing page trips no danger surface → FAST lane under keel-v2.
Scan anyway. Common flips to HEAVY: a form posting to an auth'd or
PII-collecting endpoint, real prices computed (not copywritten), analytics
that stores personal data. If a surface goes live mid-build, STOP and flip —
keel-v2 §1 rules.

## 1. Deference (non-negotiable)

keel-v2 (CLAUDE.md + LAWS.md) is the arbiter. Its /review tripwires run on
every build from this skill. Accessibility and design conformance are never
cut — not for speed, not for laziness levels, not for "it's just a landing
page."

## 2. Workflow (in order, one turn on FAST)

1. **Read DESIGN.md first — fully, before any code.** It is the design
   Authority (keel-v2 §1 rule 2): conform, don't invent. If the project has
   no DESIGN.md, copy this skill's starter next to the page, state you did,
   and proceed on its defaults — do not invent tokens inline.
2. **Plan sections.** 3-6 lines at the top of the turn: ordered section list
   (e.g. hero → proof → features → pricing → CTA → footer) with THE one focal
   point named per view. No separate planning round-trip.
3. **Build.** Semantic HTML first; tokens only (§3); mobile-first; real copy
   over lorem ipsum where the prompt gives any.
4. **Self-check in-turn.** Run keel-v2 /review tripwires + the checklist in
   §4. Report pass/fail inline. Fix fails this turn.

## 3. Token discipline (the conformance half)

- **Color:** only the role tokens in DESIGN.md §Color. No ad-hoc hex, no
  opacity-hacked variants, no gradients that aren't in §Signature.
- **Type:** only the faces/sizes/weights in §Type. No new font imports.
- **Space & shape:** spacing steps and radii from §Space-&-shape only.
- **Motion:** durations/easings from §Motion; respect `prefers-reduced-motion`.
- **One focal point per view.** Each viewport-height of page has exactly one
  element that wins; everything else supports it.
- **The signature appears once** (see DESIGN.md §Signature) — not sprinkled.
- **Anti-patterns list in DESIGN.md §Anti-patterns is a hard blocklist.**

## 4. Self-check (report inline, pass/fail each)

- [ ] keel-v2 tripwires all run (dead code, secrets, a11y, conformance).
- [ ] Every color/size/space value traces to a DESIGN.md token.
- [ ] One focal point per view; signature used exactly once.
- [ ] a11y: labels, alt text, contrast ≥ 4.5:1 body / 3:1 large, focus
      visible, heading order sane, works keyboard-only.
- [ ] No §Anti-patterns violations.
- [ ] Responsive: no horizontal scroll at 360px; readable at 1440px.

## 5. Output shape

FAST lane: the page + the section plan + the self-check report. Terse.
Git repo → named branch, human commits. No repo → files in place, say so.
(Both per keel-v2 §1 rule 4.)
