# claude-skills

Reusable, private collection of [Claude Code](https://claude.com/claude-code) skills,
designed to be consumed by projects as a git submodule under `.claude/skills`.

## Skills

| Skill | Purpose |
|-------|---------|
| [`fused-landing`](skills/fused-landing/) | _Placeholder — no files yet._ Reserved for the fused landing-page skill. |
| [`keel-v2`](skills/keel-v2/) | Two-lane rigor router for Claude Code: a **FAST** lane one-shots no-danger tasks end-to-end, auto-upgrading to **HEAVY** for correctness-critical work (auth, money, migrations). |
| [`lazy-loop`](skills/lazy-loop/) | Umbrella skill fusing **ponytail** (write ~54% less code) and **caveman** (~65% fewer output tokens) — two non-overlapping laziness layers under one `/lazy` toggle. |

## Install as a submodule

From the root of the consuming project (a git repo):

```bash
git submodule add https://github.com/sayeediftekhar/claude-skills .claude/skills
git submodule update --init --recursive
```

Skills then resolve under `.claude/skills/skills/<skill-name>/`.

## Update to the latest skills

```bash
git submodule update --remote .claude/skills
```

## Editing the skills

Work in this repo (e.g. cloned at `~/claude-skills-src/claude-skills`), commit, and push.
Consuming projects pick up changes via `git submodule update --remote`.
