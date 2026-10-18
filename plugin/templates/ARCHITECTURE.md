# Architecture: <Project>

<!--
  The project's application of the seven-rung Systems Thinking framework (the Keel
  plugin's docs/SYSTEMS_THINKING_FRAMEWORK.md; keel-dev G1/G2 walk it for HEAVY features).
  Tier 3: reached through CLAUDE.md's authorities index, fetched on demand.
  Keel reads the module map: `keel compile` turns its Path and Stable/volatile columns
  into module-boundary rules (a stable module may not import a volatile one), checked
  by CI on the files a PR changes. Use one path or glob per row (e.g. src/billing/**).
-->

## Load-bearing pieces (built first, thin but correct)
Build these before any user-facing feature. Thinnest correct version only.
- [ ] Identity and tenancy model: <who is the user, what can they see>
- [ ] Core data model: <the core things and how they relate>
- [ ] Money model (if applicable): <how money is represented, stored, calculated>
- [ ] Core transaction: <the one thing the system exists to do>

## Module map (one job per module)
| Module | Path | Single job (one sentence, no "and also") | Stable or volatile |
|---|---|---|---|
| <module> | <src/module/**> | <one-sentence job> | <stable or volatile> |

## Iron Laws
The commit-blocking invariants live in LAWS.md; see them there, don't duplicate.
What they protect: <one line>

## Change surface decisions
- **Volatile (changes often):** <pieces>
- **Stable (foundation):** <pieces>
- **Separation mechanism:** <how volatile and stable are kept apart>

## Sequencing plan
- **Phase 0 (foundation):** <thin, correct load-bearing pieces>
- **Slice 1:** <first complete vertical feature, database → UI>
- **Slice 2:** <next slice, ordered by dependency, not excitement>

<!-- Each slice: database → logic → interface → UI, verified in the real environment
     before the next begins. -->
