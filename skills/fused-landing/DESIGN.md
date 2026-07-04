# DESIGN.md — brand contract

Starter: **Neutral Dark Modern**. Every value below is a default meant to be
edited — replace, don't append. This file is the single design authority;
if a value isn't here, it doesn't go on the page.

## 1. Voice

Confident, concrete, short. Verbs over adjectives. No exclamation marks.
Numbers beat claims ("2.4× faster", not "blazing fast"). One idea per
sentence. Headlines ≤ 8 words.

## 2. Type

- Display / headings: `Inter`, weight 600, tracking -0.02em.
- Body: `Inter`, weight 400, line-height 1.6.
- Mono (code, numbers-as-proof): `JetBrains Mono`, weight 400.
- Scale (px): 14 · 16 · 20 · 28 · 40 · 56. Nothing between steps.
- Max line length: 68ch body, 20ch display.

## 3. Color — roles + hex

| Role            | Hex       | Use                                    |
|-----------------|-----------|----------------------------------------|
| `bg`            | `#0B0D10` | Page background                        |
| `surface`       | `#14171C` | Cards, nav, footer                     |
| `border`        | `#262B33` | Hairlines, dividers                    |
| `text`          | `#E8EAED` | Primary text                           |
| `text-muted`    | `#9AA0A6` | Secondary text, captions               |
| `accent`        | `#7C93FF` | Links, primary CTA, the focal point    |
| `accent-ink`    | `#0B0D10` | Text on accent fills                   |
| `positive`      | `#6EDCA8` | Success/proof accents only             |

Rules: `accent` on ≤ 10% of any view. `positive` never decorative. No other
hex values exist.

## 4. Space & shape

- Spacing steps (px): 4 · 8 · 12 · 16 · 24 · 40 · 64 · 96. Nothing between.
- Section vertical rhythm: 96 desktop / 64 mobile.
- Radii: 8 (controls) · 12 (cards) · 999 (pills). No other radii.
- Borders: 1px `border`. Shadows: none — depth comes from surface steps.

## 5. Motion

- Durations: 150ms (hover/focus) · 300ms (reveal). Easing: `cubic-bezier(0.2, 0, 0, 1)`.
- Reveals: fade + 8px rise, once, on first scroll into view. No loops, no
  parallax. Honor `prefers-reduced-motion: reduce` → no transform animation.

## 6. The signature

One (1) distinctive element that makes the page ours: a thin `accent`
gradient hairline (`#7C93FF → transparent`) under the hero headline.
It appears exactly once per page. Nothing else may use a gradient.

## 7. References

- Comps / inspiration: <add file paths or URLs>
- Product screenshots: <path>
- Logo + clearspace: <path>

## 8. Anti-patterns (hard blocklist)

- Purple-to-pink gradient heroes; glassmorphism cards; glow/bloom shadows.
- Emoji as icons; icon soup (3-col feature grids with generic line icons).
- "Trusted by" logo walls with fake logos; invented testimonials.
- Centered walls of text; more than one CTA style per view.
- Animated gradient text; typewriter effects; particle backgrounds.
- Stock illustration people; abstract 3D blobs.

## 9. Project notes

<Project-specific decisions go here — overrides above sections when in
conflict, and says why. Empty = defaults stand.>
