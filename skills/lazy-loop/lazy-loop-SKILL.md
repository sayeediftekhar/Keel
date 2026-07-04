---
name: lazy-loop
description: >-
  Umbrella skill that fuses ponytail (write the least CODE) with caveman
  (say the least WORDS). Two orthogonal layers, zero overlap. ponytail decides
  what code to write; caveman decides how to phrase the explanation. OFF by
  default — /lazy or a trigger phrase turns it on. Defers to keel-v2.
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

**Default state: OFF.** Both layers activate only when `/lazy <level>` is run
or a trigger phrase above is used; activation without a level = `full`.
`/lazy off` deactivates both. When off, code and prose are normal.

**Deference: keel-v2 is the arbiter.** Its /review tripwires, design
conformance, and a11y requirements outrank every laziness rung and every
compression level. Where this file and keel-v2 disagree, keel-v2 wins.

Two independent axes, applied in order every active turn:

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
security, accessibility, design conformance (DESIGN.md tokens — keel-v2
tripwire). Lazy, not negligent.

**Deferred shortcut (defined):** a deliberately-minimal implementation shipped
in place of a fuller version you consciously skipped — the shortcut you TOOK,
not work skipped at rung 1 (rung-1 skips are plain YAGNI; nothing to record).
Record each in the turn's review note as
`ponytail: took <minimal thing> — fuller: <what was deferred>`.
Never as TODO-shaped comments in the code (keel-v2 §5 forbids them).

## Layer 2 - caveman (PROSE)

Once the code exists, compress the surrounding explanation:

- Drop filler, hedging, preamble, and postamble. Use fragments.
- Keep **code, commands, file paths, and error strings byte-for-byte exact** -
  never compress or paraphrase those.
- Keep the user's language; compress style, don't translate.
- **Exempt from compression** (keel-v2 §5): HEAVY plans awaiting approval and
  tripwire/review reports — full sentences there, always.

Example: "New object ref each render. Inline object prop = new ref = re-render.
Wrap in `useMemo`." instead of a 60-word paragraph.

---

## Levels

Both layers share a single intensity word. `/lazy <level>` sets both at once.

| Level  | CODE (ponytail)                                                    | PROSE (caveman)              |
|--------|--------------------------------------------------------------------|------------------------------|
| `lite` | reuse/native only (rungs 1-5), keep it safe                        | trim filler, keep near-normal|
| `full` | full ladder                                                        | tight caveman fragments      |
| `ultra`| full ladder + edit-don't-add: no new files, no new deps, no new abstractions; if one seems genuinely required, say so instead of adding it | maximal compression          |
| `off`  | normal coding                                                      | normal prose                 |

`ultra`'s CODE tightening is exactly the edit-don't-add rule above — the
ladder itself has no rung past 7. Everything past that is prose compression.

---

## Commands

| Command | Effect |
|---|---|
| `/lazy [lite\|full\|ultra\|off]` | Set BOTH layers to the same level. No arg = report both. |

The full suites (`/ponytail-review`, `/ponytail-debt`, `/caveman-commit`,
`/caveman-stats`, token/USD tracking, statusline) require installing the two
source plugins — this umbrella file alone provides only `/lazy` and the rules
above.

---

## Order of operations (every active turn)

1. Understand the request; read the relevant code.
2. **ponytail:** climb the ladder, write the minimum safe code.
3. **caveman:** compress the explanation around that code (code stays byte-exact).
4. List any deferred shortcuts in the review note (`ponytail:` lines).

## Self-check before responding

- [ ] Did I pick the lowest ladder rung that still fully works?
- [ ] Are validation / security / data-loss / a11y / design-conformance guards intact?
- [ ] Is every code block, command, path, and error string unmodified?
- [ ] Is the prose compressed to the active level - except plans and review
      reports, which stay full sentences?
- [ ] Are taken shortcuts recorded in the review note, not as code comments?
