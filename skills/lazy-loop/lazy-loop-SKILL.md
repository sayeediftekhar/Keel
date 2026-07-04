---
name: lazy-loop
description: >-
  Umbrella skill that fuses ponytail (write the least CODE) with caveman
  (say the least WORDS). Two orthogonal layers, zero overlap. ponytail decides
  what code to write; caveman decides how to phrase the explanation. Nothing
  from either source skill is lost - both are invoked in full, only namespaced.
triggers:
  - lazy mode
  - write less code and talk less
  - minimal code, minimal words
license: MIT
sources:
  - ponytail (DietrichGebert/ponytail, MIT) - code minimization
  - caveman  (JuliusBrussee/caveman, MIT)  - output compression
---

# Lazy Loop Skill

**Write the least code that works, then say the least about it.**

Two independent axes, applied in order every turn:

1. **CODE layer -> ponytail.** Before writing any code, climb the laziness ladder.
2. **PROSE layer -> caveman.** After the code is decided, compress the explanation.

They never conflict: ponytail governs *what gets written*, caveman governs
*how it's described*. Both keep hard safety guarantees.

---

## Layer 1 - ponytail (CODE)

Before writing code, stop at the FIRST rung that holds:

```
1. Does this need to exist?   -> no: skip it (YAGNI)
2. Already in this codebase?  -> reuse it, don't rewrite
3. Stdlib does it?            -> use it
4. Native platform feature?   -> use it
5. Installed dependency?      -> use it
6. One line?                  -> one line
7. Only then: the minimum that works
```

Run the ladder AFTER understanding the problem - read the code the change
touches, trace the real flow, then pick a rung. Lazy about the solution,
never about reading.

**Never on the chopping block:** trust-boundary validation, data-loss handling,
security, accessibility. Lazy, not negligent.

Deferred shortcuts get a `ponytail:` marker comment so they can be harvested later.

## Layer 2 - caveman (PROSE)

Once the code exists, compress the surrounding explanation:

- Drop filler, hedging, preamble, and postamble. Use fragments.
- Keep **code, commands, file paths, and error strings byte-for-byte exact** -
  never compress or paraphrase those.
- Keep the user's language; compress style, don't translate.

Example: "New object ref each render. Inline object prop = new ref = re-render.
Wrap in `useMemo`." instead of a 60-word paragraph.

---

## Levels

Both layers share a single intensity word. `/lazy <level>` sets both at once;
you can still tune each side independently with its native command.

| Level  | CODE (ponytail)                 | PROSE (caveman)              |
|--------|---------------------------------|------------------------------|
| `lite` | reuse/native only, keep it safe | trim filler, keep near-normal|
| `full` | full ladder (default)           | tight caveman fragments      |
| `ultra`| aggressive minimization         | maximal compression          |
| `off`  | normal coding                   | normal prose                 |

`ultra` on both = smallest possible diff, smallest possible words.

---

## Commands (all preserved, namespaced)

Unified:
| Command | Effect |
|---|---|
| `/lazy [lite\|full\|ultra\|off]` | Set BOTH layers to the same level. No arg = report both. |

ponytail suite (CODE):
| Command | Effect |
|---|---|
| `/ponytail [lite\|full\|ultra\|off]` | Set only the code layer |
| `/ponytail-review` | Review current diff for over-engineering, return delete-list |
| `/ponytail-audit`  | Audit whole repo for over-engineering |
| `/ponytail-debt`   | Harvest deferred `ponytail:` shortcuts into a ledger |
| `/ponytail-gain`   | Show measured code/cost/speed impact |
| `/ponytail-help`   | ponytail quick reference |

caveman suite (PROSE):
| Command | Effect |
|---|---|
| `/caveman [lite\|full\|ultra\|wenyan]` | Set only the prose layer |
| `/caveman-commit`   | Conventional Commit, <=50-char subject, why-over-what |
| `/caveman-review`   | One-line PR comments |
| `/caveman-stats`    | Session token savings + lifetime + USD |
| `/caveman-compress <file>` | Rewrite a memory file into caveman-speak |

> `wenyan` is caveman-only (classical Chinese, max density) - it has no code-layer
> equivalent, so it applies to PROSE only when set.

---

## Order of operations (every turn)

1. Understand the request; read the relevant code.
2. **ponytail:** climb the ladder, write the minimum safe code.
3. **caveman:** compress the explanation around that code (code stays byte-exact).
4. Emit deferred `ponytail:` markers if any rung was skipped for later.

## Self-check before responding

- [ ] Did I pick the lowest ladder rung that still fully works?
- [ ] Are validation / security / data-loss / a11y guards intact?
- [ ] Is every code block, command, path, and error string unmodified?
- [ ] Is the prose compressed to the active level with no lost meaning?
- [ ] Are skipped shortcuts marked `ponytail:` for `/ponytail-debt`?
