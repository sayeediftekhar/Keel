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

# --- host code-index hygiene -------------------------------------------------
# Vendored upstreams (vendor/, e.g. hyperframes ~162 MB / 4200+ files) are
# third-party code, not the host project's. If a host code-indexer walks them,
# the host's knowledge graph balloons and queries drown in vendored nodes.
# So on install we teach the host repo's ignore files to skip them.
#
# Which file fixes which tool matters — they don't all read the same one:
#   .gitignore      git + any git-aware indexer (graphify reads it too)
#   .graphifyignore graphify (root/ancestor only — it never reads nested ones,
#                   so the entry must live at the host root, not inside vendor/)
#   .claudeignore   Claude Code comprehension
# We write all three, idempotently, keyed on the exact entry line.

add_ignore() { # add_ignore <file> <entry> <why>
  local file="$1" entry="$2" why="$3"
  if [ -f "$file" ] && grep -qxF -- "$entry" "$file"; then
    echo "  = $(basename "$file") already ignores '$entry'"
    return 0
  fi
  { [ -s "$file" ] && printf '\n'
    printf '# keel: %s\n' "$why"
    printf '%s\n' "$entry"
  } >> "$file"
  echo "  + $(basename "$file"): + '$entry'"
}

ensure_host_ignores() {
  [ -d "$VENDOR" ] || return 0
  local host rootp rel
  host="$(git -C "$ROOT" rev-parse --show-superproject-working-tree 2>/dev/null || true)"
  if [ -z "$host" ]; then
    echo
    echo "~ Keel isn't a submodule of a host repo here — skipping host code-index setup."
    echo "  (vendor/ is already gitignored inside this repo.)"
    return 0
  fi
  host="$(cd "$host" && pwd -P)"
  rootp="$(cd "$ROOT" && pwd -P)"
  rel="${rootp#"$host"/}"
  if [ "$rel" = "$rootp" ] || [ -z "$rel" ]; then
    echo "! couldn't locate Keel under host root ($host) — skipping host code-index setup." >&2
    return 0
  fi
  echo
  echo "Keeping vendored upstreams out of the host project's code index ($host):"
  # git + git-aware indexers: the vendor/ dir is the multi-hundred-MB culprit.
  add_ignore "$host/.gitignore"      "$rel/vendor/" "vendored upstreams cloned by keel/install.sh — generated, never host code"
  # graphify + Claude comprehension: exclude the whole keel submodule (agent infra).
  add_ignore "$host/.graphifyignore" "$rel/"        "keel submodule is third-party agent infra, not host-project code"
  add_ignore "$host/.claudeignore"   "$rel/"        "keel submodule is third-party agent infra, not host-project code"
  echo "  → re-run your code-graph indexer (e.g. graphify update .) to drop vendored nodes."
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
    ensure_host_ignores
    echo
    echo "Next: any 'MCP' upstreams above need credentials — run  ./install.sh mcp  then edit .mcp.json."
    echo "Point Claude Code at ./vendor for the cloned skills. vendor/ is gitignored (generated,"
    echo "not committed) and excluded from the host code index — see the ignore entries added above."
  fi
}
main "$@"
