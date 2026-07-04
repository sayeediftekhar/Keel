# Lazy Loop - ponytail x caveman, fused

Combines two MIT-licensed Claude Code skills into one umbrella skill,
**without losing anything from either**:

- **ponytail** (DietrichGebert/ponytail) - writes the least *code* via a 7-rung laziness ladder (~54% less code).
- **caveman**  (JuliusBrussee/caveman)  - says the least *words* via caveman-speak compression (~65% fewer output tokens).

## Why they combine cleanly

They act on different layers and never overlap:

| | ponytail | caveman |
|---|---|---|
| Governs | what code is written | how it's explained |
| Cuts | lines of code | output tokens (prose) |
| Safety | never cut validation/security/a11y | never touch code/commands/errors |

ponytail's own benchmark even uses caveman as a separate control arm - proof they
measure different axes. Run both: ponytail writes the one-liner, caveman explains
it in a grunt.

## Install

Recommended: install the two original plugins (full features + hooks + stats),
then add this umbrella skill on top for the unified `/lazy` toggle.

```bash
# 1. ponytail (two separate prompts in Claude Code)
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail

# 2. caveman
claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman

# 3. umbrella skill
mkdir -p .claude/skills/lazy-loop
cp lazy-loop-SKILL.md .claude/skills/lazy-loop/SKILL.md
```

If you only want the fused behavior without the two plugins' hooks/commands,
the umbrella `SKILL.md` alone reproduces the *rules* of both (ladder + compression)
- you just lose the plugin-only extras like `/caveman-stats` and the statusline.

## Use

```
/lazy full          # both layers on, default intensity
/lazy ultra         # smallest diff + smallest words
/ponytail ultra     # tune code layer only
/caveman lite       # tune prose layer only
/ponytail-review    # code over-engineering delete-list
/caveman-stats      # token savings scoreboard
```

## Conflict notes (handled, not lost)

- **Shared level words** (`lite/full/ultra`): resolved by namespacing - `/ponytail`
  vs `/caveman` vs unified `/lazy`.
- **Both inject a prompt each turn** (caveman ~1-1.5k input tokens + ponytail ruleset):
  extra input overhead is real; drop to `lite`/`off` on already-terse work.
- **`wenyan`** is caveman-only and applies to prose only.

Both projects are MIT. Attribution preserved in the skill frontmatter.
