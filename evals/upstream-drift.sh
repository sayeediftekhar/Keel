#!/usr/bin/env bash
# Upstream drift check — do the Pocock skills Keel names still exist upstream?
#
# mattpocock/skills ships as a self-updating, unpinned plugin, so a rename
# upstream silently breaks keel-dev (2026-10: `grill` became `grill-with-docs`
# and nothing failed). This compares the spine's `routes` list in manifest.json
# against the live upstream tree, and against the Keel docs that name those
# skills, so the manifest, the docs and upstream can't drift apart quietly.
#
# Needs network + jq + (gh or curl). Not a CI gate — CI stays offline and
# deterministic. Run it before any Keel PR that touches keel-dev.
#
#   Usage:  evals/upstream-drift.sh        # from anywhere
#   Exit 0 = no drift, 1 = drift found, 2 = could not run.

set -uo pipefail

KEEL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$KEEL_ROOT/manifest.json"
UPSTREAM_REPO="mattpocock/skills"
ENTRY="mattpocock-skills"
# Claude Code's own skill/command names. A routed skill with one of these names
# must be written with its plugin prefix, or the built-in runs instead (2026-10:
# the built-in `/code-review` shadowed Pocock's two-axis review). Snapshot of
# the bundled skills + core slash commands as of 2026-10-17 — refresh it from a
# session's skill list when Claude Code adds built-ins.
BUILTINS=(code-review simplify security-review init run loop schedule update-config
  keybindings-help fewer-permission-prompts claude-api workflow-authoring
  plugin-authoring dataviz artifact-design artifact-diagramming artifact-capabilities
  help clear compact config model memory mcp agents status resume export hooks
  permissions doctor cost context plugin login logout rewind add-dir review)
# Docs that name upstream skills. catalog.md is left out on purpose: its
# "Match status" log records retired names.
SCAN=("$KEEL_ROOT/skills/keel-dev/SKILL.md" "$KEEL_ROOT/HOWTO.md" "$KEEL_ROOT/CONTRIBUTING.md" "$KEEL_ROOT"/conventions/*.md)

PASS=0; FAIL=0; WARN=0
ok()   { printf '  \033[32mok\033[0m   %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33mwarn\033[0m %s\n' "$1"; WARN=$((WARN+1)); }

command -v jq >/dev/null || { echo "needs jq"; exit 2; }

fetch_tree() {
  local api="repos/$UPSTREAM_REPO/git/trees/main?recursive=1"
  if command -v gh >/dev/null && gh api "$api" 2>/dev/null; then return 0; fi
  command -v curl >/dev/null && curl -fsSL "https://api.github.com/$api"
}

tree_json="$(fetch_tree)" || { echo "could not fetch the $UPSTREAM_REPO tree (network, gh or curl)"; exit 2; }

# One "<category> <skill>" line per skills/<category>/<skill>/SKILL.md upstream.
upstream="$(printf '%s' "$tree_json" | jq -r '.tree[].path
  | select(test("^skills/[^/]+/[^/]+/SKILL\\.md$"))
  | split("/") | "\(.[1]) \(.[2])"')"
[ -n "$upstream" ] || { echo "upstream tree lists no skills — has its layout changed?"; exit 2; }

routes="$(jq -r --arg e "$ENTRY" '.lanes[].upstreams[] | select(.name == $e) | (.routes // [])[]' "$MANIFEST")"
setup="$(jq -r --arg e "$ENTRY" '.lanes[].upstreams[] | select(.name == $e) | .setup // empty' "$MANIFEST")"
[ -n "$routes" ] || { echo "manifest.json: $ENTRY has no routes list"; exit 2; }
# Skills load as "<plugin>:<skill>"; the plugin name is the id before "@".
ns="$(jq -r --arg e "$ENTRY" '.lanes[].upstreams[] | select(.name == $e) | (.plugin // .name) | split("@")[0]' "$MANIFEST")"

category_of()   { printf '%s\n' "$upstream" | awk -v s="$1" '$2 == s { print $1; exit }'; }
bare_in_docs()  { grep -qF -- "\`$1\`" "${SCAN[@]}" 2>/dev/null; }
prefixed_in_docs() { grep -qF -- "\`$ns:$1\`" "${SCAN[@]}" 2>/dev/null; }
named_in_docs() { bare_in_docs "$1" || prefixed_in_docs "$1"; }
is_routed()     { printf '%s\n' "$routes" | grep -qxF -- "$1"; }
is_builtin()    { printf '%s\n' "${BUILTINS[@]}" | grep -qxF -- "$1"; }

echo "upstream drift — $UPSTREAM_REPO vs Keel"
echo

echo "[1] every routed skill still exists upstream, in a stable folder"
while read -r s; do
  c="$(category_of "$s")"
  case "$c" in
    engineering|productivity) ok "$s ($c)" ;;
    misc|in-progress)         warn "$s is upstream but under $c/ — not a stable skill" ;;
    "")                       bad "$s — not found upstream (renamed or removed?)" ;;
    *)                        bad "$s — upstream moved it to $c/" ;;
  esac
done <<< "$routes"

echo "[2] the one-time setup command still exists upstream"
if [ -z "$setup" ]; then
  warn "no setup command declared"
elif [ -n "$(category_of "${setup#/}")" ]; then
  ok "$setup"
else
  bad "$setup — not found upstream"
fi

echo "[3] every routed skill is named somewhere in Keel's docs"
while read -r s; do
  if named_in_docs "$s"; then ok "\`$s\` is named"; else bad "\`$s\` is in routes but no doc names it — drop it from routes"; fi
done <<< "$routes"

echo "[4] every upstream skill Keel's docs name is declared in routes"
undeclared=0
while read -r _ s; do
  named_in_docs "$s" || continue
  if ! is_routed "$s"; then bad "docs name \`$s\` but manifest routes doesn't list it"; undeclared=$((undeclared+1)); fi
done <<< "$upstream"
[ "$undeclared" -eq 0 ] && ok "no undeclared upstream skill names"

echo "[5] routed skills that share a Claude Code built-in's name are written with the \`$ns:\` prefix"
clashes=0
while read -r s; do
  is_builtin "$s" || continue
  clashes=$((clashes+1))
  if bare_in_docs "$s"; then
    bad "docs write bare \`$s\` — Claude Code's built-in would run; write \`$ns:$s\`"
  else
    ok "\`$ns:$s\` (prefixed, so the built-in \`/$s\` can't shadow it)"
  fi
done <<< "$routes"
[ "$clashes" -eq 0 ] && ok "no routed skill shares a built-in's name"

echo
echo "----------------------------------------"
printf 'passed: %d   warnings: %d   failed: %d\n' "$PASS" "$WARN" "$FAIL"
[ "$FAIL" -eq 0 ]
