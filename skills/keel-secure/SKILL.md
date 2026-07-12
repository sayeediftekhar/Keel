---
name: keel-secure
description: >-
  Security lane router and gate. Runs VibeSec over security-relevant code to
  catch vulnerabilities before they ship, and wires that check into keel-v2's
  security tripwire. Defers to keel-v2. Use when a change touches auth, input
  handling, secrets, uploads, queries, or any trust boundary — or when asked
  to review code for vulnerabilities.
---

# Keel Secure — security lane router & gate

**Index + gate.** Unlike the other lanes this one is also a **checkpoint**:
any security-relevant change routed from `keel-dev` passes through here before
it's called done.

## Deference — keel-v2 is the arbiter
This lane *implements* the keel-v2 security posture; it never relaxes it. A
change touching danger surfaces 3/4/9 (PII, auth, secrets) is HEAVY by
definition (keel-v2 LAWS). VibeSec's findings feed the keel-v2 /review
tripwire "if any danger surface is live, both named enforcement layers are
present."

## Dispatch table
| When the task is… | Dispatch to | Type | Source |
|---|---|---|---|
| Write/review code for vulnerabilities (injection, authz, secrets, SSRF, XSS) | `VibeSec-Skill` | skill | BehiSecc/VibeSec-Skill |

## Gate rule (how it plugs into keel-v2)
1. `keel-dev` (or any lane) produces a change touching a trust boundary.
2. Route here → run `VibeSec-Skill` over the diff.
3. Map each finding to a keel-v2 invariant (server-enforces, identity-from-
   session, exact-money, immutable-records). A finding with only one
   enforcement layer present = **PARTIAL, not done** (keel-v2 LAWS).
4. Unresolved high-severity finding = block the commit gate. Upgrading rigor
   is yours to enforce; downgrading is only the human's explicit call.

## If the target isn't installed
Do **not** silently skip the security pass. Say VibeSec isn't installed, run
the keel-v2 tripwire manually (trace each trust boundary, name both enforcement
layers), and flag that an automated scan was unavailable. Install:
`./install.sh secure`.

Sources: BehiSecc/VibeSec-Skill (vibesec.sh). Upstream unmodified.
