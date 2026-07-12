---
name: keel-design
description: >-
  Design lane router. Routes visual/UI work to the right vendored design
  engine (impeccable, frontend-design) or to the local fused-landing skill for
  landing/marketing pages. Kills generic "AI slop" UI. Defers to keel-v2.
  Use when styling, polishing, critiquing, or building any user-facing UI,
  component, or page and you want it to look deliberate, not defaulted.
---

# Keel Design — design lane router

**Index, not an implementation.** Picks the design engine; the engine does the
work. Design conformance and a11y here are keel-v2 tripwires — never cut.

## Deference — keel-v2 is the arbiter
Run the keel-v2 scan first (most design work is FAST; a form posting to an
auth'd/PII endpoint flips HEAVY — keel-v2 §0). Design-conformance and a11y
tripwires always run, at any laziness level.

## Dispatch table
| When the task is… | Dispatch to | Type | Source |
|---|---|---|---|
| Landing / marketing / hero / pricing / CTA page, DESIGN.md-token-disciplined | `fused-landing` | local skill | this repo |
| Give the whole harness design taste: polish, audit, critique, animate, bolder/quieter | `impeccable` | skill | pbakaus/impeccable |
| Official Anthropic design-system baseline (frontends, "make it not look AI-generated") | `frontend-design` | plugin | anthropics/claude-code |

## Collision rule (read this — the two engines overlap)
`impeccable` and `frontend-design` both fight AI-slop UI. **Pick one per
project, don't run both** — two design skills firing on the same task just
flip a coin.
- Default **`impeccable`** as the primary taste engine (richer command
  vocabulary: `polish`, `audit`, `critique`, `distill`, `animate`).
- Use **`frontend-design`** when you want the official Anthropic baseline or
  it's already the house standard.
- For a **landing/marketing page**, `fused-landing` wins outright — it carries
  the DESIGN.md token discipline and anti-pattern blocklist. It in turn defers
  to keel-v2 the same way this router does.

## If the target isn't installed
Fall back to `fused-landing` (local, always present) for pages; otherwise base
Claude Code under keel-v2 design tripwires. Never claim a design engine ran
when it isn't installed. Install: `./install.sh design`.

Sources: pbakaus/impeccable · anthropics/claude-code (frontend-design plugin) ·
local fused-landing. Upstreams unmodified.
