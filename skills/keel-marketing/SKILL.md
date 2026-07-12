---
name: keel-marketing
description: >-
  Marketing lane router. Dispatches growth work — SEO/GEO, copywriting, CRO,
  analytics, and LinkedIn outreach — to the right vendored marketing skill
  (marketingskills, claude-seo) or MCP (kondo). Defers to keel-v2. Use for
  marketing copy, SEO audits, landing-copy, conversion optimization, growth
  campaigns, or inbound-DM triage.
---

# Keel Marketing — marketing lane router

**Index, not an implementation.** Routes the growth task; the specialist runs.

## Deference — keel-v2 is the arbiter
Run the keel-v2 scan first. Most marketing copy is FAST. It flips HEAVY when
real prices are computed (not copywritten), PII is collected, or analytics
stores personal data (keel-v2 surfaces 1/3). Marketing claims still get the
a11y + conformance tripwires when they land in a page.

## Dispatch table
| When the task is… | Dispatch to | Type | Source |
|---|---|---|---|
| Copywriting, CRO, positioning, growth-engineering, campaign ops (~40 skills) | `marketingskills` | plugin | coreyhaines31/marketingskills |
| SEO / GEO / AEO audit, schema, E-E-A-T, technical SEO, semantic clustering | `claude-seo` | skill | AgriciDaniel/claude-seo |
| Triage LinkedIn DMs / inbox — flag which need a reply, draft responses | `kondo` | MCP (hosted) | trykondo.com |

## Precedence & overlap
- SEO lives in **both** `marketingskills` and `claude-seo`. For a dedicated
  SEO/GEO task prefer **`claude-seo`** (deeper: 25 sub-skills). For SEO *as
  part of* a broader campaign, let `marketingskills` own it.
- Copy that will ship into a page → after drafting, hand the page itself to
  `keel-design` / `fused-landing` for token-disciplined layout.
- Want the copy to not read as AI-written → chain `keel-content` → `humanizer`
  as a finishing pass.

## If the target isn't installed
Say so; fall back to base Claude Code under keel-v2. `kondo` needs its browser
extension + account and cannot be faked. Install: `./install.sh marketing`.

Sources: coreyhaines31/marketingskills · AgriciDaniel/claude-seo ·
trykondo.com (MCP). Upstreams unmodified.
