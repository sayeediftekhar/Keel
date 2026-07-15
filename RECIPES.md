# Keel — Recipes

How to use Keel on real projects: landing pages, ERPs, apps — for your own
brands or clients'. [HOWTO.md](HOWTO.md) is the loop, [PLAYBOOK.md](PLAYBOOK.md)
is the discipline; this is the practical cookbook.

---

## The one mental model

**keel-v2 is always-on and decides *how careful* to be. Lanes are tools *you*
name. Always grill before you build.**

- **keel-v2** silently scans every task → **FAST** (safe, one turn) or **HEAVY**
  (risky, plan-first). You don't invoke it; it's the arbiter.
- **Lanes** (`/keel-dev`, `/keel-design`, `/keel-marketing`…) are specialists you
  call by name.
- **Grill first** — let it interrogate you until the goal is crisp, *before* any
  code.

---

## Setup, once per project (this is where "brand" lives)

```
1. Grill me on what we're building.
2. git submodule add https://github.com/sayeediftekhar/Keel .claude/skills
   cat .claude/skills/skills/keel-v2/CLAUDE.md >> CLAUDE.md
   (cd .claude/skills && ./install.sh dev design)   # only the lanes this project needs
3. Create DESIGN.md (visual tokens) + CONTEXT.md (voice, terms) — the brand, encoded.
4. Run graphify on the repo so "how does X work" is cheap later.
```

**`DESIGN.md` + `CONTEXT.md` ARE the brand.** They are the most important thing
you create. Everything else points at them.

---

## Recipe 1 — Landing pages (mostly FAST, cheap, fast)

Rigor reality: **FAST** — static pages trip no danger surface. The sweet spot for
a cheap model.

Lane: `keel-design` → `fused-landing`.

Opening prompt — the one-shot block is the money move:

```
ONE-SHOT (FAST):
  Rigor: FAST — static marketing page.
  Authorities: DESIGN.md, my-hero-comp.png
  Authorization: build end-to-end this turn; no plan-first; no divergence.
  Commit: do NOT commit — leave on branch feat/landing for review.
  Review: run tripwires and report inline.

Task: build the hero + pricing + CTA landing page for <brand>.
```

→ Reads your tokens, builds the whole page, self-reviews, stops on a branch. One
turn. You review and commit.

---

## Recipe 2 — ERPs (almost all HEAVY — respect it)

Rigor reality: **HEAVY nearly everywhere.** An ERP is money, logins, roles,
multi-tenant data, DB migrations, PII — 6 of the 9 danger surfaces. **Do not try
to one-shot ERP features.** This is where Keel earns its keep by slowing you down
correctly.

Lane: `keel-dev`, with `keel-secure` gating anything touching auth/money/data.

Work it **feature by feature, never "build the ERP":**

```
Grill me on the invoicing module: tenancy model, who sees what, rounding rules, audit trail.
```

Then let the HEAVY flow run per feature: **grill → spec → tickets → plan (you
approve) → build + review → keel-secure gate → verify → you commit.** It stops for
your plan approval before writing code. That's the feature, not a bug.

Invariants it enforces for you (LAWS.md): exact-money (never floats), server-side
auth checks (not just UI), tenant ID from the session (never the request),
immutable audit records.

---

## Recipe 3 — Apps (mixed — route per feature)

An app is a blend. **Route each piece on its own:**

- UI shell, marketing site, a settings component with mock data → **FAST**
  (`keel-design`)
- Login, payments, user data, the API, migrations → **HEAVY** (`keel-dev` +
  `keel-secure`)

Don't set one rigor for "the app." Describe each feature; keel-v2 re-scans each
time. A "FAST" task that turns out to touch auth auto-upgrades to HEAVY
mid-build — you can't accidentally cut a corner.

---

## Your brands vs client brands

Same mechanism; only the source of the brand differs.

- **Your own brands:** build a solid `DESIGN.md` + `CONTEXT.md` once per brand and
  reuse across that brand's projects. Your identity becomes a reusable Authority.
- **Client brands:** at grill time, capture *their* brand into that project's
  `DESIGN.md` + `CONTEXT.md` (colors, type, voice, terminology). Naming those
  files as Authorities makes every FAST build match the client, not generic AI
  defaults.

One brand = one `CONTEXT.md`/`DESIGN.md`. Keep them per-project so client A's
voice never bleeds into client B's.

---

## Driving design changes — dictate the goal, not the technique

When you want to improve a design, there are three framings. The lever that
controls quality is **whether you named an Authority to conform to**, not which
engine you named.

```
❌ Vague:      "make the landing page look better / more modern"
   → generic AI-slop risk; nothing to conform to.

✅ Technique:  "make the pricing cards frosted-glass with a subtle blur,
                keep the DESIGN.md tokens"
   → precise tweak, you own the taste. Good for a known change.

✅✅ Goal+ref: "improve the pricing section to feel like Linear's — lighter
                cards, clearer hierarchy, more restrained motion.
                Authority: DESIGN.md + linear-screenshot.png"
   → the engine brings craft AND conforms to your brand + the reference.
```

Notes:

- **You don't need to name `impeccable` for a landing page** — the design lane
  auto-routes it to `fused-landing` (wins outright). `impeccable` is the
  polish/critique engine for general UI. Naming a tool is allowed, rarely needed.
- **A reference beats a tool name.** "Look like X" (a real site or a comp) is an
  Authority; that's what elevates the result.
- **Unsure if a technique even fits?** Ask for the *effect* ("make the cards feel
  light and layered"), not the *technique* ("glassmorph") — then the engine picks
  the method and won't apply a trend that fights the page.

---

## The 5 habits that make it work (PLAYBOOK)

1. **Name your Authority** (`DESIGN.md`, a comp, a spec) in every build prompt —
   it's what collapses FAST to one turn.
2. **Use the one-shot FAST block** for anything safe. Don't pay the
   plan→ask→build tax on a landing page.
3. **Curate per project — don't install every lane.** Each lane taxes every turn.
4. **Verify, don't trust.** At the human gate, drive the real flow (`/qa`, the
   `verify` skill) before "done."
5. **Encode every correction once** — into `CONTEXT.md` or a skill — so you never
   re-explain it.

---

## One-line version

**Grill → name your Authority → let keel-v2 pick the rigor → call the lane → stop
at the gate and commit yourself.** FAST for anything safe (landing pages), HEAVY
for anything with money/auth/data (ERPs), route apps piece by piece.
