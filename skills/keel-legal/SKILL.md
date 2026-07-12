---
name: keel-legal
description: >-
  Legal lane router (optional / vertical). Routes legal workflows — contract
  review, corporate, privacy, employment, IP, litigation, regulatory — to
  Anthropic's official claude-for-legal plugin suite. Defers to keel-v2.
  Install only if you do legal work.
---

# Keel Legal — legal lane router (optional vertical)

**Index, not an implementation.** Thin by design — optional vertical; skip
unless you do legal work.

## Deference — keel-v2 is the arbiter
Legal drafting is often the no-artifact/FAST lane, but anything that **sends,
files, or executes** a document trips surface 6 (irreversibility) → HEAVY, and
the harness send/publish gate applies: draft, then stop for the human to send.
PII in legal docs (surface 3) is routine — handle under HEAVY.

## Dispatch table
| When the task is… | Dispatch to | Type | Source |
|---|---|---|---|
| Contract review/drafting, corporate, privacy, employment, IP, litigation, regulatory (~12 practice areas, 90+ agents) | `claude-for-legal` | plugin | anthropics/claude-for-legal |

## Guardrail
Not legal advice. This lane assists with drafting and review; it is not a
substitute for a licensed attorney, and it never files or sends on its own.

## If not installed
Optional, off by default. Install: `./install.sh legal`.

Sources: anthropics/claude-for-legal (official). Unmodified.
