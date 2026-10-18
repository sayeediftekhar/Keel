# DESIGN.md — keel-governance design contract

The single visual authority. If a value isn't here, it doesn't go on the
page; a FAST build that names this file as its Authority conforms to it
exactly (keel-v2 §1 rule 2). Replace the defaults, don't append to them.

## 1. Voice
<three adjectives; sentence length; what we never say>

## 2. Type
- Display / headings: `<family>`, weight <n>, tracking <em>.
- Body: `<family>`, weight <n>, line-height <n>.
- Scale (px): 14 · 16 · 20 · 28 · 40 · 56. Nothing between steps.
- Max line length: 68ch body.

## 3. Color — roles, not hex in components
| Role | Value | Use |
|---|---|---|
| `bg` | `#______` | page background |
| `fg` | `#______` | body text (≥ 4.5:1 on `bg`) |
| `muted` | `#______` | secondary text (≥ 4.5:1 for small text) |
| `accent` | `#______` | one focal action per view |
| `border` | `#______` | hairlines |

## 4. Space, radius, motion
- Space scale (px): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.
- Radius: <n>px cards, <n>px controls. One radius family.
- Motion: <duration>ms, <easing>; off under `prefers-reduced-motion`.

## 5. Components
<the few you have: button, card, input — states listed, tokens named>

## 6. Anti-patterns (the review tripwire reads these)
- Ad-hoc hex or spacing values outside the scales above.
- More than one focal point per view.
- Gradient text, glassmorphism, decorative blur, stock "AI" imagery, emoji
  as icons — unless this file says otherwise.
- Text below 4.5:1 contrast; focus states removed; missing alt text.
