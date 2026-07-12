---
name: keel-finance
disable-model-invocation: true
description: >-
  Finance lane router (optional / vertical). Routes financial-analysis work —
  IB, equity research, PE, wealth management, DCF/LBO/3-statement models — to
  Anthropic's official financial-services plugin. Defers to keel-v2, which
  forces HEAVY rigor on anything touching real money. Install only if you do
  finance work.
---

# Keel Finance — finance lane router (optional vertical)

**Index, not an implementation.** Thin by design — this is an optional
vertical; skip installing it unless you do finance work.

## Deference — keel-v2 is the arbiter, and it forces HEAVY here
Anything in this lane trips keel-v2 **surface 1 (value — real money computed)**
and usually **surface 3 (PII)**. That means **HEAVY lane, always**: route
first, plan before code, build+review in one turn, stop for human sign-off. The
keel-v2 **exact-money invariant** (decimal type in storage+compute, explicit
rounding on display — never float) is mandatory in every model this lane
produces.

## Dispatch table
| When the task is… | Dispatch to | Type | Source |
|---|---|---|---|
| DCF/LBO/3-statement models, CIMs, IC memos, equity research, wealth reviews | `financial-services` | plugin | anthropics/financial-services |

## Guardrail
Not investment advice. This lane builds models and analyses; it does not issue
personalized financial recommendations or execute any trade/transfer — those
are prohibited actions the human performs.

## If not installed
This is optional and off by default. Install: `./install.sh finance`.

Sources: anthropics/financial-services (official). Unmodified.
