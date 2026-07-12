---
name: keel-ops
description: >-
  Operations & connectors lane router. Routes memory, workspace connectors,
  and meta/skills-management to the right tool — claude-mem, granola, slack,
  notion, zapier MCPs, plus find-skills and the claude-skills library. Defers
  to keel-v2. Use for persistent memory, pulling meeting notes, reading/writing
  Slack or Notion, wide app automation, or discovering/installing new skills.
---

# Keel Ops — operations & connectors lane router

**Index, not an implementation.** Routes to a connector or meta tool; most
here are **MCP servers** (wired in `.mcp.json`), not skills.

## Deference — keel-v2 is the arbiter
Run the keel-v2 scan. Connector *reads* are usually FAST/no-artifact.
Connector **writes are irreversible/outward-facing (surface 6)** → HEAVY, and
the harness send/publish/settings gates apply: posting to Slack, writing a
Notion page, or firing a Zapier action is confirmed with the human first, never
auto-run.

## Dispatch table
| When the task is… | Dispatch to | Type | Source |
|---|---|---|---|
| Persistent cross-session memory (capture, compress, re-inject context) | `claude-mem` | skill/tool | thedotmack/claude-mem |
| Pull meeting transcripts / notes into context | `granola` | MCP | granola.ai |
| Read/search or post Slack messages, threads, canvases | `slack` | MCP | slackapi/slack-mcp-plugin |
| Read/write Notion pages and databases | `notion` | MCP | makenotion/notion-mcp-server |
| Fire an action across 9,000+ apps in plain English | `zapier` | MCP | zapier/zapier-mcp |
| Discover & install new skills from the open ecosystem | `find-skills` | skill | vercel-labs/skills |
| Reach into a large multi-platform skills library | `claude-skills` | library | alirezarezvani/claude-skills |

## Token thrift note
Output-token compression is **not** here — it's your existing `lazy-loop`
skill (`/lazy`), which already wraps caveman + ponytail and defers to keel-v2.
Don't duplicate it in this lane.

## Write-action gate (non-negotiable)
Any Slack post, Notion write, Zapier trigger, or other outward/irreversible
connector action: **state exactly what will be sent/changed and to where, then
wait for an explicit human yes.** One approval does not authorize the next.

## If the target isn't installed
Say so; MCP connectors need credentials in `.mcp.json` (see `.mcp.json.template`
+ `install.sh mcp`) and cannot be faked. Install a skill lane: `./install.sh ops`.

Sources: thedotmack/claude-mem · granola.ai · slackapi/slack-mcp-plugin ·
makenotion/notion-mcp-server · zapier/zapier-mcp · vercel-labs/skills ·
alirezarezvani/claude-skills. Upstreams unmodified.
