#!/usr/bin/env bash
# Keel installer — lane-gated. Vendors the upstreams a lane routes to,
# WITHOUT modifying them. Reads manifest.json. Nothing is installed unless
# you name a lane. See ARCHITECTURE.md + catalog.md.
#
# Usage:
#   ./install.sh                 # list lanes and what each would install
#   ./install.sh dev design      # install those lanes' upstreams (parked ones skipped) + link their skills
#   ./install.sh hyperframes     # install one upstream by name — how parked ones install
#   ./install.sh all             # install every non-optional lane
#   ./install.sh mcp             # just scaffold .mcp.json from the template
#   ./install.sh arbiter         # sync the always-on keel-v2 rules (router + LAWS) into host CLAUDE.md
#   ./install.sh check           # verify a consuming project is wired correctly
#   ./install.sh pin             # (maintainers) refresh manifest.json refs to upstream HEAD
#
# Layout in a consuming project (the ONE supported layout):
#   .claude/keel/                      <- this repo, as a git submodule
#   .claude/skills/<name>  -> symlink  <- written by this script; Claude Code
#                                         discovers skills at exactly this depth
#   CLAUDE.md                          <- gets the managed keel-v2 block (arbiter)
#
# Behavior by upstream type:
#   skill  -> git clone into ./vendor/<name> at the PINNED commit (manifest
#             `ref`), then symlink its SKILL.md dir(s) into the host's
#             .claude/skills/ so Claude Code can see them. Re-running moves the
#             checkout to the current pin; it never floats to upstream HEAD.
#   plugin -> prints the exact `claude plugin install … --scope project` command
#             when the manifest entry names its plugin id (+ any one-time setup);
#             otherwise the generic marketplace/clone hint
#   mcp    -> prints the entry's `install` command, else reminds you to fill .mcp.json
#   cli    -> prints the entry's `install` command (shell tool, no context cost)
#   local  -> already in this repo (symlinked into the host's .claude/skills/)
#             or a user-level path (reported)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$ROOT/manifest.json"
VENDOR="$ROOT/vendor"
ARBITER="$ROOT/skills/keel-v2/CLAUDE.md"
LAWS="$ROOT/skills/keel-v2/LAWS.md"

command -v jq >/dev/null 2>&1 || { echo "! needs 'jq' (brew install jq)"; exit 1; }
[ -f "$MANIFEST" ] || { echo "! manifest.json not found at $MANIFEST"; exit 1; }

lanes_all() { jq -r '.lanes | keys[]' "$MANIFEST"; }

list() {
  echo "Keel lanes (manifest.json):"
  for l in $(lanes_all); do
    opt=$(jq -r --arg l "$l" '.lanes[$l].optional // false' "$MANIFEST")
    tag=""; [ "$opt" = "true" ] && tag="  (optional vertical)"
    echo "  • $l$tag"
    jq -r --arg l "$l" '.lanes[$l].upstreams[] | "      - \(.name)  [\(.type)]  \(.repo)\(if .ref then "  @" + .ref[0:7] else "" end)\(if .optional then "  (parked)" else "" end)\(if .when then "  (opt-in: " + .when + ")" else "" end)"' "$MANIFEST"
  done
  echo
  echo "Install:  ./install.sh <lane|upstream> [...]   |   all   |   mcp   |   arbiter   |   check   |   pin"
}

# Relative path of this Keel checkout inside the host repo (e.g. ".claude/keel").
# Empty if Keel isn't under the host root.
keel_rel_path() { # <host-root>
  local rootp rel
  rootp="$(cd "$ROOT" && pwd -P)"
  rel="${rootp#"$1"/}"
  if [ "$rel" = "$rootp" ] || [ -z "$rel" ]; then printf ''; else printf '%s' "$rel"; fi
}

# The host repo this Keel checkout is a submodule of, or empty.
host_root() {
  local h
  h="$(git -C "$ROOT" rev-parse --show-superproject-working-tree 2>/dev/null || true)"
  [ -n "$h" ] && (cd "$h" && pwd -P)
}

scaffold_mcp() {
  if [ -f "$ROOT/.mcp.json" ]; then
    echo "= .mcp.json already exists — not overwriting. Merge from .mcp.json.template by hand."
  else
    cp "$ROOT/.mcp.json.template" "$ROOT/.mcp.json"
    echo "+ wrote .mcp.json from template — now fill in the \${ENV} credentials."
  fi
}

# --- arbiter (always-on keel-v2 rules) --------------------------------------
# The keel-v2 CLAUDE.md must be present in the HOST project's CLAUDE.md so the
# router is always on. The old flow was `cat …/keel-v2/CLAUDE.md >> CLAUDE.md`,
# which DUPLICATES the whole block every time Keel updates. Instead we write it
# between markers and replace-in-place, so re-running is idempotent — that's how
# a consuming project picks up an updated arbiter without hand-editing.
ARB_BEGIN="# >>> keel-v2 arbiter (managed by Keel — keel init / install.sh arbiter) — do not edit between markers >>>"
ARB_END="# <<< keel-v2 arbiter <<<"

# The block carries BOTH keel-v2 files: CLAUDE.md (the router) and LAWS.md (the
# surface definitions, the invariants, the /review tripwires). The router
# cites LAWS.md throughout; without LAWS in the host the agent only ever sees
# the surface *names*. It also records where Keel lives in the host so the
# agent can find the lane routers and MEMORY-CONTRACT.md by path.
sync_arbiter() {
  [ -f "$ARBITER" ] || { echo "! keel-v2 arbiter not found at $ARBITER"; return 1; }
  [ -f "$LAWS" ]    || { echo "! keel-v2 LAWS not found at $LAWS"; return 1; }
  local host target tmp rel
  host="$(host_root)"
  if [ -z "$host" ]; then
    echo "~ Keel isn't a submodule of a host repo here — skipping arbiter sync."
    echo "  Run  ./install.sh arbiter  from a consuming project to install the always-on rules."
    return 0
  fi
  rel="$(keel_rel_path "$host")"
  target="$host/CLAUDE.md"
  tmp="$(mktemp)"
  # Drop any existing managed block (markers included), keep everything else.
  if [ -f "$target" ]; then
    awk -v e="$ARB_END" '
      !skip && /^# >>> keel-v2 arbiter .*>>>[[:space:]]*$/ {skip=1; next}
      skip && $0==e {skip=0; next}
      !skip {print}
    ' "$target" > "$tmp"
  fi
  # Append a fresh block: locator line + router + laws.
  { [ -s "$tmp" ] && printf '\n'
    printf '%s\n' "$ARB_BEGIN"
    printf '<!-- Keel is installed at %s/ — lane routers: %s/skills/<lane>/SKILL.md · memory rules: %s/MEMORY-CONTRACT.md · conventions: %s/conventions/ -->\n\n' "$rel" "$rel" "$rel" "$rel"
    cat "$ARBITER"
    printf '\n'
    cat "$LAWS"
    printf '%s\n' "$ARB_END"
  } >> "$tmp"
  mv "$tmp" "$target"
  echo "+ synced keel-v2 arbiter (CLAUDE.md + LAWS.md) → $target (idempotent, marker-delimited)"
  echo "  NOTE: if you previously ran 'cat …/keel-v2/CLAUDE.md >> CLAUDE.md', delete that"
  echo "  older un-marked copy once — this managed block replaces it going forward."
}

# --- host code-index hygiene -------------------------------------------------
# Vendored upstreams (vendor/, e.g. hyperframes ~162 MB / 4200+ files) are
# third-party code, not the host project's. If a host code-indexer walks them,
# the host's knowledge graph balloons and queries drown in vendored nodes.
# So on install we teach the host repo to skip them.
#
# Which file fixes which tool matters — they don't all read the same one:
#   .gitignore              git + any git-aware indexer; Claude Code's own
#                           content search honors it too (official docs)
#   .graphifyignore         graphify (root/ancestor only — it never reads nested
#                           ones, so the entry must live at the host root)
#   .claude/settings.json   Claude Code `permissions.deny` Read(...) rules — the
#                           ONLY supported way to wall a path off from Claude's
#                           file reads. We deny the pure-noise payloads under
#                           vendor/ (node_modules, dist, .git); vendored
#                           SKILL.md files must stay readable, so vendor/ as a
#                           whole is NOT denied.
#   .claudeignore           has NO effect (official docs). Older Keel wrote it;
#                           we now remove the lines we wrote.
# All writes are idempotent, keyed on the exact entry line.

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

# Remove the two lines an older install.sh wrote to .claudeignore (a file Claude
# Code never reads). Delete the file if that leaves it empty.
retire_claudeignore() { # <host> <rel>
  local f="$1/.claudeignore" entry="$2/"
  [ -f "$f" ] || return 0
  if grep -qxF -- "$entry" "$f"; then
    local tmp; tmp="$(mktemp)"
    grep -vxF -- "$entry" "$f" | grep -vxF -- "# keel: keel submodule is third-party agent infra, not host-project code" > "$tmp" || true
    if [ -s "$tmp" ]; then mv "$tmp" "$f"; echo "  - .claudeignore: removed keel's entry (file has no effect in Claude Code)"
    else rm -f "$tmp" "$f"; echo "  - .claudeignore: removed (empty after dropping keel's entry; the file has no effect in Claude Code)"; fi
  fi
}

# Merge Read(...) deny rules into the host's .claude/settings.json (team-shared).
add_settings_deny() { # <host> <rule>...
  local host="$1"; shift
  local f="$host/.claude/settings.json" tmp
  mkdir -p "$host/.claude"
  [ -s "$f" ] || printf '{}\n' > "$f"
  jq empty "$f" 2>/dev/null || { echo "! $f is not valid JSON — add these deny rules by hand: $*" >&2; return 0; }
  tmp="$(mktemp)"
  jq --argjson rules "$(printf '%s\n' "$@" | jq -R . | jq -s .)" \
     '.permissions = (.permissions // {}) | .permissions.deny = ((.permissions.deny // []) + $rules | unique)' \
     "$f" > "$tmp" && mv "$tmp" "$f"
  echo "  + .claude/settings.json: permissions.deny ← $(printf '%s, ' "$@" | sed 's/, $//')"
}

ensure_host_ignores() {
  [ -d "$VENDOR" ] || return 0
  local host rel
  host="$(host_root)"
  if [ -z "$host" ]; then
    echo
    echo "~ Keel isn't a submodule of a host repo here — skipping host code-index setup."
    echo "  (vendor/ is already gitignored inside this repo.)"
    return 0
  fi
  rel="$(keel_rel_path "$host")"
  if [ -z "$rel" ]; then
    echo "! couldn't locate Keel under host root ($host) — skipping host code-index setup." >&2
    return 0
  fi
  echo
  echo "Keeping vendored upstreams out of the host project's code index ($host):"
  add_ignore "$host/.gitignore"      "$rel/vendor/" "vendored upstreams cloned by keel/install.sh — generated, never host code"
  add_ignore "$host/.graphifyignore" "$rel/"        "keel submodule is third-party agent infra, not host-project code"
  add_settings_deny "$host" \
    "Read(./$rel/vendor/**/node_modules/**)" \
    "Read(./$rel/vendor/**/dist/**)" \
    "Read(./$rel/vendor/**/.git/**)"
  retire_claudeignore "$host" "$rel"
  echo "  → re-run your code-graph indexer (e.g. graphify update .) to drop vendored nodes."
}

# --- skill linking (discoverability) ----------------------------------------
# Claude Code discovers project skills at .claude/skills/<name>/SKILL.md — that
# exact depth, and a <name> entry may be a symlink (official docs). The Keel
# submodule lives at .claude/keel/, so every lane router / local skill /
# vendored skill the host uses gets a relative symlink at that depth.

link_skill() { # <host> <name> <target-rel-to-host>   e.g. keel-dev  .claude/keel/skills/keel-dev
  local host="$1" name="$2" target="$3"
  local dir="$host/.claude/skills" link="$host/.claude/skills/$name" want="../../$3"
  [ -f "$host/$target/SKILL.md" ] || { echo "  ? $name: no SKILL.md at $target — not linked"; return 0; }
  mkdir -p "$dir"
  if [ -L "$link" ]; then
    if [ "$(readlink "$link")" = "$want" ]; then echo "  = .claude/skills/$name already linked"; return 0; fi
    rm -f "$link"
  elif [ -e "$link" ]; then
    echo "  ! .claude/skills/$name exists and is not a symlink — leaving it alone (move it aside to let Keel link)" >&2
    return 0
  fi
  ln -s "$want" "$link"
  echo "  + .claude/skills/$name -> $want"
}

# Link a vendored skill repo: its root SKILL.md, or each skills/*/SKILL.md.
link_vendored() { # <host> <rel> <name>
  local host="$1" rel="$2" name="$3" d
  if [ -f "$VENDOR/$name/SKILL.md" ]; then
    link_skill "$host" "$name" "$rel/vendor/$name"
  elif ls "$VENDOR/$name"/skills/*/SKILL.md >/dev/null 2>&1; then
    for d in "$VENDOR/$name"/skills/*/; do
      d="${d%/}"; link_skill "$host" "$(basename "$d")" "$rel/vendor/$name/skills/$(basename "$d")"
    done
  elif [ -d "$VENDOR/$name" ]; then
    echo "  ? $name: vendored, but no SKILL.md at its root or under skills/ — see its README for how it installs"
  fi
}

# Link everything a lane needs: its router, its local skills, and any vendored
# skill repos that are actually present (parked ones only once installed).
link_lane() { # <lane>
  local lane="$1" host rel router n i name type repo
  host="$(host_root)"
  if [ -z "$host" ]; then
    echo "~ not a submodule of a host repo — skipping .claude/skills links (run from a consuming project)."
    return 0
  fi
  rel="$(keel_rel_path "$host")"
  [ -n "$rel" ] || return 0
  echo "Linking skills into $host/.claude/skills/ (Claude Code discovery depth):"
  router=$(jq -r --arg l "$lane" '.lanes[$l].router' "$MANIFEST")
  link_skill "$host" "$router" "$rel/skills/$router"
  n=$(jq -r --arg l "$lane" '.lanes[$l].upstreams | length' "$MANIFEST")
  for i in $(seq 0 $((n-1))); do
    name=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].name' "$MANIFEST")
    type=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].type' "$MANIFEST")
    repo=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].repo' "$MANIFEST")
    case "$type" in
      local) case "$repo" in "~"*|/*) ;; *) [ -f "$ROOT/$repo/SKILL.md" ] && link_skill "$host" "$name" "$rel/$repo" ;; esac ;;
      skill) [ -d "$VENDOR/$name" ] && link_vendored "$host" "$rel" "$name" ;;
    esac
  done
  return 0
}

# --- pins (supply chain) -----------------------------------------------------
# Every git upstream carries a `ref` in manifest.json. install_item checks it
# out; nothing floats. Maintainers refresh pins deliberately:
#   ./install.sh pin        -> resolves each upstream's HEAD, rewrites refs,
#                              prints the old→new diff for review.
pin_upstreams() {
  local tmp repo sha old
  tmp="$(mktemp)"; cp "$MANIFEST" "$tmp"
  for repo in $(jq -r '.lanes[].upstreams[] | select(.repo | startswith("https://github.com/")) | .repo' "$MANIFEST" | sort -u); do
    sha="$(git ls-remote "$repo" HEAD 2>/dev/null | awk '{print $1}')"
    old="$(jq -r --arg r "$repo" 'first(.lanes[].upstreams[] | select(.repo==$r) | .ref // "-")' "$tmp")"
    if [ -z "$sha" ]; then echo "! $repo: unreachable, pin kept at ${old:0:7}" >&2; continue; fi
    if [ "$sha" = "$old" ]; then echo "= $repo @ ${sha:0:7}"; continue; fi
    echo "~ $repo: ${old:0:7} -> ${sha:0:7}"
    jq --arg r "$repo" --arg s "$sha" '.lanes |= with_entries(.value.upstreams |= map(if .repo==$r then .ref=$s else . end))' "$tmp" > "$tmp.n" && mv "$tmp.n" "$tmp"
  done
  jq --arg d "$(date +%F)" '.pinned_at=$d' "$tmp" > "$tmp.n" && mv "$tmp.n" "$MANIFEST"; rm -f "$tmp"
  echo "+ manifest.json pins refreshed. Review each moved upstream's changes before committing (SECURITY.md)."
}

# --- check --------------------------------------------------------------------
# Mechanical proxy for "does a fresh session actually see Keel": the managed
# block carries the laws, every .claude/skills/<name> link resolves to a
# SKILL.md whose frontmatter name matches, no dead .claudeignore, vendor ignored.
# (The v3 plugin's `keel doctor` proves the GATES; this checks the WIRING.)
check_host() {
  local host rel bad=0
  host="$(host_root)"
  [ -n "$host" ] || { echo "! check runs from a consuming project (Keel as a submodule)."; return 1; }
  rel="$(keel_rel_path "$host")"
  echo "Keel check — $host"
  if [ "$rel" = ".claude/keel" ]; then echo "  ok   submodule at .claude/keel"
  else echo "  warn submodule at '$rel' — supported layout is .claude/keel (see HOWTO.md → Updating)"; fi
  if [ -f "$host/CLAUDE.md" ] && grep -qE -- "^# >>> keel-v2 arbiter .*>>>" "$host/CLAUDE.md"; then
    if grep -q "Server enforces, not the UI" "$host/CLAUDE.md"; then echo "  ok   CLAUDE.md has the managed keel-v2 block (router + LAWS)"
    else echo "  FAIL CLAUDE.md block is from an older Keel — missing LAWS. Re-run: ./install.sh arbiter"; bad=1; fi
  else echo "  FAIL CLAUDE.md has no managed keel-v2 block. Run: ./install.sh arbiter"; bad=1; fi
  local found=0 l n t nm
  if [ -d "$host/.claude/skills" ]; then
    for l in "$host"/.claude/skills/*; do
      [ -e "$l" ] || [ -L "$l" ] || continue   # empty glob
      n="$(basename "$l")"
      [ -L "$l" ] || continue                   # a real dir is the host's own skill
      found=$((found+1))
      t="$(readlink "$l")"
      if [ ! -f "$l/SKILL.md" ]; then echo "  FAIL .claude/skills/$n -> $t does not resolve to a SKILL.md"; bad=1; continue; fi
      nm="$(sed -n 's/^name:[[:space:]]*//p' "$l/SKILL.md" | head -1 | tr -d '"'"'"' ')"
      if [ "$nm" = "$n" ]; then echo "  ok   /$n  (-> $t)"
      else echo "  FAIL .claude/skills/$n: SKILL.md frontmatter name is '$nm' — Claude Code lists it under that name, not /$n"; bad=1; fi
    done
  fi
  [ "$found" -gt 0 ] || { echo "  FAIL no Keel skill links under .claude/skills/. Run: ./install.sh <lane>"; bad=1; }
  if [ -f "$host/.claudeignore" ] && grep -qxF -- "$rel/" "$host/.claudeignore"; then
    echo "  warn .claudeignore still lists $rel/ — Claude Code ignores that file; re-run a lane install to clean it"; fi
  if [ -d "$VENDOR" ]; then
    if [ -f "$host/.gitignore" ] && grep -qxF -- "$rel/vendor/" "$host/.gitignore"; then echo "  ok   vendor/ is gitignored in the host (keeps it out of Claude's search + git)"
    else echo "  FAIL host .gitignore lacks '$rel/vendor/'. Re-run a lane install."; bad=1; fi
  fi
  if [ "$bad" -eq 0 ]; then
    echo "  all good. Confirm in a fresh Claude Code session: /skills should list the names above."
  else
    echo "  problems found — fix the FAIL lines above, then re-run: ./install.sh check"
  fi
  return "$bad"
}

# Install one manifest entry: install_item <lane> <index>.
# Always returns 0 — a skipped optional line (e.g. an empty note) must not trip
# `set -e` and abort the rest of the install.
install_item() {
    local lane="$1" i="$2"
    local name type repo plugin setup note install marketplace ref when
    ref=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].ref // empty' "$MANIFEST")
    when=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].when // empty' "$MANIFEST")
    name=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].name' "$MANIFEST")
    type=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].type' "$MANIFEST")
    repo=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].repo' "$MANIFEST")
    plugin=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].plugin // empty' "$MANIFEST")
    setup=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].setup // empty' "$MANIFEST")
    note=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].note // empty' "$MANIFEST")
    install=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].install // empty' "$MANIFEST")
    marketplace=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].marketplace // empty' "$MANIFEST")
    case "$type" in
      skill)
        mkdir -p "$VENDOR"
        if [ ! -d "$VENDOR/$name/.git" ]; then
          echo "+ $name: cloning skill -> vendor/$name"; git clone -q --depth 1 "$repo" "$VENDOR/$name"
        fi
        if [ -n "$ref" ]; then
          if [ "$(git -C "$VENDOR/$name" rev-parse HEAD 2>/dev/null)" = "$ref" ]; then
            echo "= $name: at pinned ${ref:0:7}"
          else
            echo "~ $name: checking out pinned ${ref:0:7}"
            git -C "$VENDOR/$name" fetch -q --depth 1 origin "$ref" \
              && git -C "$VENDOR/$name" -c advice.detachedHead=false checkout -q "$ref" \
              || echo "! $name: could not check out pinned $ref — review upstream, then ./install.sh pin" >&2
          fi
        else
          echo "! $name: no pin in manifest.json — floating at upstream HEAD (run ./install.sh pin)" >&2
        fi ;;
      plugin)
        if [ -n "$plugin" ]; then
          # Project scope (not user): keeps its skill descriptions out of every
          # other session's context. Use --scope local to keep it uncommitted.
          echo "» $name: PLUGIN — from your project root run:"
          [ -n "$marketplace" ] && echo "         claude plugin marketplace add $marketplace"
          echo "         claude plugin install $plugin --scope project"
          [ -n "$setup" ] && echo "         then, once per repo, in Claude Code:  $setup"
        elif [ -n "$ref" ]; then
          # Pinned plugin bundle: install from a checkout at the reviewed commit, never from HEAD.
          echo "» $name: PLUGIN, pinned to ${ref:0:12}${when:+ — only for $when} — from your project root run:"
          echo "         git clone $repo .claude/keel/vendor/$name && git -C .claude/keel/vendor/$name checkout -q $ref"
          echo "         claude plugin marketplace add ./.claude/keel/vendor/$name"
          jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].plugins // [] | .[] | "         claude plugin install \(.) --scope project"' "$MANIFEST"
        else
          echo "» $name: PLUGIN — install via the Claude Code plugin marketplace,"
          echo "         or:  git clone $repo  into your .claude/plugins"
        fi ;;
      mcp)
        if [ -n "$install" ]; then
          echo "» $name: MCP — from your project root run:"
          echo "         $install"
        else
          echo "» $name: MCP — add credentials to .mcp.json (see .mcp.json.template). Source: $repo"
        fi ;;
      cli)
        # A CLI the agent runs from the shell: no skill descriptions, no context cost.
        echo "» $name: CLI — install once on the machine:"
        echo "         ${install:-see $repo}" ;;
      local)
        case "$repo" in
          "~"*|/*) echo "= $name: user-level install at $repo — check it exists" ;;
          *)       echo "= $name: local to this repo — linked into the host's .claude/skills/" ;;
        esac ;;
      *) echo "? $name: unknown type '$type'" ;;
    esac
    [ -n "$note" ] && echo "         ($note)"
    return 0
}

install_lane() {
  local lane="$1" n i name
  jq -e --arg l "$lane" '.lanes[$l]' "$MANIFEST" >/dev/null 2>&1 \
    || { echo "! unknown lane: $lane"; return 1; }
  echo "== lane: $lane =="
  n=$(jq -r --arg l "$lane" '.lanes[$l].upstreams | length' "$MANIFEST")
  for i in $(seq 0 $((n-1))); do
    # Parked upstreams stay catalogued but never install with their lane.
    if [ "$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].optional // false' "$MANIFEST")" = "true" ]; then
      name=$(jq -r --arg l "$lane" --argjson i "$i" '.lanes[$l].upstreams[$i].name' "$MANIFEST")
      echo "~ $name: parked — skipped; when a project needs it:  ./install.sh $name"
      continue
    fi
    install_item "$lane" "$i"
  done
  link_lane "$lane"
}

# Install a single upstream by name (parked or not): install_upstream <name>.
install_upstream() {
  local want="$1" hit
  hit=$(jq -r --arg w "$want" '.lanes | to_entries[] | .key as $l
        | .value.upstreams | to_entries[] | select(.value.name == $w) | "\($l) \(.key)"' "$MANIFEST" | head -n 1)
  [ -n "$hit" ] || { echo "! unknown lane or upstream: $want   (./install.sh with no args lists them)"; return 1; }
  echo "== upstream: $want (lane: ${hit% *}) =="
  install_item "${hit% *}" "${hit#* }"
  link_lane "${hit% *}"
}

main() {
  [ $# -eq 0 ] && { list; exit 0; }
  local need_mcp=false
  for arg in "$@"; do
    case "$arg" in
      mcp) scaffold_mcp ;;
      arbiter) sync_arbiter ;;
      check) check_host ;;
      pin) pin_upstreams ;;
      all) for l in $(lanes_all); do
             opt=$(jq -r --arg l "$l" '.lanes[$l].optional // false' "$MANIFEST")
             [ "$opt" = "true" ] && { echo "~ skipping optional lane: $l (install explicitly)"; continue; }
             install_lane "$l"; need_mcp=true
           done ;;
      *)   if jq -e --arg l "$arg" '.lanes[$l]' "$MANIFEST" >/dev/null 2>&1; then
             install_lane "$arg"
           else
             install_upstream "$arg"
           fi
           need_mcp=true ;;
    esac
  done
  if [ "$need_mcp" = true ]; then
    ensure_host_ignores
    echo
    echo "Next: any 'MCP' upstreams above need credentials — run  ./install.sh mcp  then edit .mcp.json."
    echo "Cloned skills live in ./vendor (gitignored, generated) and are symlinked into the host's"
    echo ".claude/skills/ where Claude Code discovers them. Then:  ./install.sh arbiter  (if not yet)"
    echo "and  ./install.sh check  to verify. Confirm with /skills in a fresh session."
  fi
}
main "$@"
