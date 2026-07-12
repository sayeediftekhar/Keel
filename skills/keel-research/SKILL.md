---
name: keel-research
disable-model-invocation: true
description: >-
  Research lane router. Routes knowledge tasks — querying your own documents,
  real-time web search, and building a searchable second brain — to the right
  vendored skill (notebooklm-skill, ai-second-brain) or MCP (perplexity).
  Defers to keel-v2. Use for grounded research, citation-backed answers from
  your notes, live web lookups, or mining your own AI history.
---

# Keel Research — research lane router

**Index, not an implementation.** Routes the research task; the specialist runs.

## Deference — keel-v2 is the arbiter
Research/answer tasks that produce no diff are the keel-v2 **no-artifact lane**
— answer directly, no plan/branch/tripwires (keel-v2 §0). Rigor only re-enters
when research output becomes a committed artifact.

## Dispatch table
| When the task is… | Dispatch to | Type | Source |
|---|---|---|---|
| Query your own Google NotebookLM notebooks, citation-backed answers | `notebooklm-skill` | skill | PleasePrompto/notebooklm-skill |
| Real-time web search / deep research via Sonar | `perplexity` | MCP | perplexityai/modelcontextprotocol |
| Build/search a Karpathy-style wiki from your ChatGPT/Claude history | `ai-second-brain` | skill | charlie947/ai-second-brain |

## Precedence & overlap
- **Grounded in your docs** → `notebooklm-skill`. **Grounded in the live web**
  → `perplexity`. **Grounded in your past conversations** → `ai-second-brain`.
  Pick by source-of-truth, not by habit.
- The harness also ships a built-in **`deep-research`** skill (multi-source,
  adversarially verified, cited report). For a big multi-source report prefer
  it; use `perplexity` for quick real-time lookups.

## If the target isn't installed
Say so; fall back to the built-in `deep-research` skill or base web tools.
Install: `./install.sh research`.

Sources: PleasePrompto/notebooklm-skill · perplexityai/modelcontextprotocol
(MCP) · charlie947/ai-second-brain. Upstreams unmodified.
