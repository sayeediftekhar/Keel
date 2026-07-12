---
name: keel-content
description: >-
  Content & social lane router. Routes writing and media tasks — de-AI-ing
  drafts, social posts/reels/captions, and cinematic video — to the right
  vendored skill (humanizer, social-media-skills) or MCP (higgsfield). Defers
  to keel-v2. Use for social content, captions, carousels, reels scripts,
  making a draft sound human, or generating short video from a prompt.
---

# Keel Content — content & social lane router

**Index, not an implementation.** Routes the content task; the specialist runs.

## Deference — keel-v2 is the arbiter
Run the keel-v2 scan first. Content is usually FAST. It flips HEAVY only when
publishing is the action (irreversibility, surface 6) or personal data is
used. **Publishing/posting is never automatic** — draft, then stop for the
human to post (keel-v2 §1 rule 4 + the harness send/publish gate).

## Dispatch table
| When the task is… | Dispatch to | Type | Source |
|---|---|---|---|
| Strip AI-writing tells (em-dashes, "delve", rule-of-three) → natural voice | `humanizer` | skill | blader/humanizer |
| Social content OS: voice, posts, carousels, reels scripts, captions, scoring | `social-media-skills` | skill | charlie947/social-media-skills |
| Generate cinematic image/short video from a prompt (Soul, Veo, Kling) | `higgsfield` | MCP (hosted) | higgsfield.ai |

## Precedence & chaining
- **Always finish with `humanizer`** on any long-form draft this lane or
  `keel-marketing` produced — it's the last pass before a human reads it.
- Social copy → `social-media-skills` for structure/scoring, then `humanizer`
  for voice.
- Video from a script → `higgsfield` for footage; `keel-dev` → `hyperframes`
  instead when the video is HTML-driven/deterministic rather than generative.

## If the target isn't installed
Say so; fall back to base Claude Code under keel-v2. `higgsfield` is a hosted
generative service and cannot be faked locally. Install: `./install.sh content`.

Sources: blader/humanizer · charlie947/social-media-skills · higgsfield.ai
(MCP). Upstreams unmodified. Note: `social-media-skills` is a common repo name
— this lane pins charlie947's.
