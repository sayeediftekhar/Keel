#!/usr/bin/env bash
# Keel installer — lane-gated. Vendors the upstreams a lane routes to,
# WITHOUT modifying them. Reads manifest.json. Nothing is installed unless
# you name a lane. See ARCHITECTURE.md + catalog.md.
#
# Usage:
#   ./install.sh                 # list lanes and what each would install
#   ./install.sh dev design      # install those lanes' upstreams
#   ./install.sh all             # install every non-optional lane
#   ./install.sh mcp             # just scaffold .mcp.json from the template
#
# Behavior by upstream type:
#   skill  -> git clone into ./vendor/<name>  (point Claude Code at ./vendor)
#   plugin -> prints the marketplace/clone command (bundles install their own way)
#   mcp    -> reminds you to fill .mcp.json (connectors need credentials)
#   local  -> already in this repo; skipped
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$ROOT/manifest.json"
VENDOR="$ROOT/vendor"

command -v jq >/dev/null 2>&1 || { echo "! needs 'jq' (brew install jq)"; exit 1; }
[ -f "$MANIFEST" ] || { echo "! manifest.json not found at $MANIFEST"; exit 1; }

lanes_all() { jq -r '.lanes | keys[]' "$MANIFEST"; }

list() {
  echo "Keel lanes (manifest.json):"
  for l in $(lanes_all); do
    opt=$(jq -r --arg l "$l" '.lanes[$l].optional // false' "$MANIFEST")
    tag=""; [ "$opt" = "true" ] && tag="  (optional vertical)"
    echo "  • $l$tag"
    jq -r --arg l "$l" '.lanes[$l].upstreams[] | "      - \(.name)  [\(.type)]  \(.repo)"' "$MANIFEST"
  done
  echo
  echo "Install:  ./install.sh <lane> [lane...]   |   all   |   mcp"
}

scaffold_mcp() {
  if [ -f "$ROOT/.mcp.json" ]; then
    echo "= .mcp.json already exists — not overwriting. Merge from .mcp.json.template by hand."
  else
    cp "$ROOT/.mcp.json.template" "$ROOT/.mcp.json"
    echo "+ wrote .mcp.json from template — now fill in the \${ENV} credentials."
  fi
}

install_lane() {
  local lane="$1"
  jq -e --arg l "$lane" '.lanes[$l]' "$MANIFEST" >/dev/null 2>&1 \
    || { echo "! unknown lane: $lane"; return 1; }
  echo "== lane: $lane =="
  local n=$(jq -r --arg l "$lane" '.lanes[$l].upstreams | length' "$MANIFEST")
  for i in $(seq 0 $((n-1))); do
    local name type repo
    name=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].name' "$MANIFEST")
    type=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].type' "$MANIFEST")
    repo=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].repo' "$MANIFEST")
    case "$type" in
      skill)
        mkdir -p "$VENDOR"
        if [ -d "$VENDOR/$name/.git" ]; then
          echo "= $name: already vendored, pulling"; git -C "$VENDOR/$name" pull --ff-only || true
        else
          echo "+ $name: cloning skill -> vendor/$name"; git clone --depth 1 "$repo" "$VENDOR/$name"
        fi ;;
      plugin)
        echo "» $name: PLUGIN — install via the Claude Code plugin marketplace,"
        echo "         or:  git clone $repo  into your .claude/plugins" ;;
      mcp)
        echo "» $name: MCP — add credentials to .mcp.json (see .mcp.json.template). Source: $repo" ;;
      local)
        echo "= $name: local to this repo — nothing to install" ;;
      *) echo "? $name: unknown type '$type'" ;;
    esac
  done
}

main() {
  [ $# -eq 0 ] && { list; exit 0; }
  local need_mcp=false
  for arg in "$@"; do
    case "$arg" in
      mcp) scaffold_mcp ;;
      all) for l in $(lanes_all); do
             opt=$(jq -r --arg l "$l" '.lanes[$l].optional // false' "$MANIFEST")
             [ "$opt" = "true" ] && { echo "~ skipping optional lane: $l (install explicitly)"; continue; }
             install_lane "$l"; need_mcp=true
           done ;;
      *)   install_lane "$arg"; need_mcp=true ;;
    esac
  done
  if [ "$need_mcp" = true ]; then
    echo
    echo "Next: any 'MCP' upstreams above need credentials — run  ./install.sh mcp  then edit .mcp.json."
    echo "Point Claude Code at ./vendor for the cloned skills, and commit vendor/ (or add as submodules)."
  fi
}
main "$@"
