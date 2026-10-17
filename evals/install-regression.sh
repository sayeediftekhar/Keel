#!/usr/bin/env bash
# Regression test for install.sh — host code-index hygiene.
#
# Locks in the fix from commit eaff95d: when Keel is installed as a submodule
# and a lane vendors upstreams into vendor/, install.sh must teach the HOST
# repo's ignore files to skip them, idempotently, and must degrade gracefully
# when Keel is not a submodule.
#
# Deterministic: no network, no LLM, no real lane clone (vendor/ is faked).
# Runs the ACTUAL shipped install.sh (via a submodule checkout of this repo),
# so it tests committed behavior, not a working-tree copy.
#
#   Usage:  evals/install-regression.sh        # from anywhere
#   Exit 0 = all pass, 1 = a failure.

set -uo pipefail

KEEL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
ok()  { printf '  \033[32mok\033[0m   %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }

command -v jq  >/dev/null || { echo "needs jq";  exit 2; }
command -v git >/dev/null || { echo "needs git"; exit 2; }

# assert_line <file> <exact-line> <desc>
assert_line() {
  if [ -f "$1" ] && grep -qxF -- "$2" "$1"; then ok "$3"; else bad "$3 — expected line '$2' in $1"; fi
}
# assert_count <file> <exact-line> <n> <desc>
assert_count() {
  local c; c=$([ -f "$1" ] && grep -cxF -- "$2" "$1" || echo 0)
  if [ "$c" -eq "$3" ]; then ok "$4"; else bad "$4 — expected $3 copies of '$2', got $c"; fi
}
# assert_absent <file> <desc>
assert_absent() { if [ ! -e "$1" ]; then ok "$2"; else bad "$2 — $1 should not exist"; fi; }

# Source the shipped install.sh (main stripped) and call ensure_host_ignores
# with ROOT/VENDOR pointed at <keel-dir>. Runs in the caller's cwd.
drive_ensure() { # <keel-install-dir>
  local dir="$1"
  ( cd "$dir" || exit 1
    sed 's/^main "\$@"$/: # test: main disabled/' install.sh > .keeltest_install.sh
    # shellcheck disable=SC1091
    source ./.keeltest_install.sh
    set +e
    ROOT="$dir"; VENDOR="$dir/vendor"
    ensure_host_ignores
    rm -f .keeltest_install.sh )
}

echo "install.sh regression — host code-index hygiene"
echo "keel repo under test: $KEEL_ROOT"
echo

# ---------------------------------------------------------------------------
echo "[1] submodule install writes host ignore entries"
H1="$(mktemp -d)/host"; mkdir -p "$H1"; ( cd "$H1" || exit 1
  git init -q && git config user.email t@t && git config user.name t
  printf 'node_modules/\n' > .gitignore
  git add -A && git commit -qm init
  git -c protocol.file.allow=always submodule add -q "$KEEL_ROOT" .claude/keel >/dev/null 2>&1
  mkdir -p .claude/keel/vendor/fake-upstream
  printf 'x\n' > .claude/keel/vendor/fake-upstream/big.py
  # an older Keel wrote this dead file; the new installer must retire its lines
  printf '# keel: keel submodule is third-party agent infra, not host-project code\n.claude/keel/\n' > .claudeignore
  # a pre-existing team settings.json must be merged into, not clobbered
  mkdir -p .claude && printf '{"permissions":{"allow":["Bash(echo hi)"]}}\n' > .claude/settings.json )
drive_ensure "$H1/.claude/keel" >/dev/null
assert_line "$H1/.gitignore"      ".claude/keel/vendor/" ".gitignore gets vendor/ entry"
assert_line "$H1/.graphifyignore" ".claude/keel/"        ".graphifyignore gets whole-submodule entry"
assert_line "$H1/.gitignore"      "node_modules/"               "pre-existing .gitignore content preserved"
assert_absent "$H1/.claudeignore" "old keel .claudeignore retired (file has no effect in Claude Code)"
if jq -e '.permissions.deny | index("Read(./.claude/keel/vendor/**/node_modules/**)")' "$H1/.claude/settings.json" >/dev/null 2>&1; then ok "settings.json gets a Read deny rule for vendor noise"; else bad "settings.json lacks the vendor Read deny rule"; fi
if jq -e '.permissions.deny | map(select(. == "Read(./.claude/keel/vendor/**)")) | length == 0' "$H1/.claude/settings.json" >/dev/null 2>&1; then ok "vendor/ as a whole is NOT denied (vendored SKILL.md must stay readable)"; else bad "vendor/ must not be denied wholesale"; fi
if jq -e '.permissions.allow | index("Bash(echo hi)")' "$H1/.claude/settings.json" >/dev/null 2>&1; then ok "pre-existing settings.json content preserved"; else bad "settings.json merge clobbered existing keys"; fi

# ---------------------------------------------------------------------------
echo "[2] idempotent — second run adds no duplicate lines"
drive_ensure "$H1/.claude/keel" >/dev/null   # run again
assert_count "$H1/.gitignore"      ".claude/keel/vendor/" 1 ".gitignore vendor/ appears exactly once"
assert_count "$H1/.graphifyignore" ".claude/keel/"        1 ".graphifyignore entry appears exactly once"
c=$(jq '.permissions.deny | length' "$H1/.claude/settings.json"); if [ "$c" -eq 3 ]; then ok "settings.json deny rules not duplicated"; else bad "settings.json deny rules duplicated ($c)"; fi

# ---------------------------------------------------------------------------
echo "[3] standalone (not a submodule) — no host files touched"
S="$(mktemp -d)/keel"; git clone -q "$KEEL_ROOT" "$S"
( cd "$S" && mkdir -p vendor/fake )
out="$(drive_ensure "$S")"
if printf '%s' "$out" | grep -q "isn't a submodule"; then ok "standalone run announces skip"; else bad "standalone run should announce skip"; fi
# ensure_host_ignores must not fabricate ignore files in a standalone checkout
assert_absent "$S/.graphifyignore" "no .graphifyignore created standalone"
assert_absent "$S/.claude/settings.json" "no settings.json created standalone"

# ---------------------------------------------------------------------------
echo "[4] Keel's own .gitignore ignores vendor/"
( cd "$S" && mkdir -p vendor/x && printf 'y\n' > vendor/x/a.py )
if ( cd "$S" && git check-ignore -q vendor/x/a.py ); then ok "vendor/ is gitignored in a Keel checkout"; else bad "vendor/ should be gitignored in a Keel checkout"; fi

# ---------------------------------------------------------------------------
# Source the shipped install.sh (main stripped) and call sync_arbiter with
# ROOT pointed at <keel-dir>.
drive_sync() { # <keel-install-dir>
  local dir="$1"
  ( cd "$dir" || exit 1
    sed 's/^main "\$@"$/: # test: main disabled/' install.sh > .keeltest_install.sh
    # shellcheck disable=SC1091
    source ./.keeltest_install.sh
    set +e
    ROOT="$dir"; ARBITER="$dir/skills/keel-v2/CLAUDE.md"; LAWS="$dir/skills/keel-v2/LAWS.md"
    sync_arbiter
    rm -f .keeltest_install.sh )
}

echo "[5] arbiter sync carries the router AND the laws into the host CLAUDE.md"
printf '# Host project\n\nExisting house rules stay.\n' > "$H1/CLAUDE.md"
drive_sync "$H1/.claude/keel" >/dev/null
assert_line  "$H1/CLAUDE.md" "Existing house rules stay."  "pre-existing CLAUDE.md content preserved"
assert_count "$H1/CLAUDE.md" "# >>> keel-v2 arbiter (managed by keel/install.sh) — do not edit between markers >>>" 1 "managed block begins once"
assert_count "$H1/CLAUDE.md" "# <<< keel-v2 arbiter <<<" 1 "managed block ends once"
if grep -q "^## 0. Two lanes, one router" "$H1/CLAUDE.md"; then ok "router (keel-v2/CLAUDE.md) present"; else bad "router content missing from host CLAUDE.md"; fi
if grep -q "Server enforces, not the UI" "$H1/CLAUDE.md"; then ok "LAWS invariants present"; else bad "LAWS.md content missing from host CLAUDE.md (the router cites it)"; fi
if grep -q "^## /review tripwires" "$H1/CLAUDE.md"; then ok "LAWS /review tripwires present"; else bad "LAWS tripwires missing from host CLAUDE.md"; fi
if grep -q "Keel is installed at .claude/keel/" "$H1/CLAUDE.md"; then ok "locator line names Keel's path in the host"; else bad "locator line missing"; fi

echo "[6] arbiter sync is idempotent — re-run replaces the block, never duplicates it"
drive_sync "$H1/.claude/keel" >/dev/null
assert_count "$H1/CLAUDE.md" "# >>> keel-v2 arbiter (managed by keel/install.sh) — do not edit between markers >>>" 1 "still exactly one managed block"
c=$(grep -c "Server enforces, not the UI" "$H1/CLAUDE.md"); if [ "$c" -eq 1 ]; then ok "LAWS appears exactly once after re-run"; else bad "LAWS duplicated ($c copies)"; fi
assert_line  "$H1/CLAUDE.md" "Existing house rules stay."  "host content still preserved after re-run"

# ---------------------------------------------------------------------------
# Source the shipped install.sh and call an arbitrary function with ROOT set.
drive_fn() { # <keel-install-dir> <fn> [args...]
  local dir="$1"; shift
  ( cd "$dir" || exit 1
    sed 's/^main "\$@"$/: # test: main disabled/' install.sh > .keeltest_install.sh
    # shellcheck disable=SC1091
    source ./.keeltest_install.sh
    set +e
    ROOT="$dir"; VENDOR="$dir/vendor"; ARBITER="$dir/skills/keel-v2/CLAUDE.md"; LAWS="$dir/skills/keel-v2/LAWS.md"
    export ROOT VENDOR ARBITER LAWS   # read by the sourced install.sh functions
    "$@"; rc=$?
    rm -f .keeltest_install.sh
    exit "$rc" )
}

echo "[7] lane install links routers + local + vendored skills at Claude Code's discovery depth"
( cd "$H1/.claude/keel" && mkdir -p vendor/VibeSec-Skill && printf -- '---\nname: VibeSec-Skill\n---\n' > vendor/VibeSec-Skill/SKILL.md )
drive_fn "$H1/.claude/keel" link_lane design >/dev/null
drive_fn "$H1/.claude/keel" link_lane secure >/dev/null
for n in keel-design fused-landing keel-secure VibeSec-Skill; do
  if [ -L "$H1/.claude/skills/$n" ] && [ -f "$H1/.claude/skills/$n/SKILL.md" ]; then ok ".claude/skills/$n is a symlink resolving to a SKILL.md"; else bad ".claude/skills/$n missing or unresolved"; fi
done
t="$(readlink "$H1/.claude/skills/keel-design")"
if [ "$t" = "../../.claude/keel/skills/keel-design" ]; then ok "links are relative (survive clone to another path)"; else bad "link target not relative: $t"; fi
drive_fn "$H1/.claude/keel" link_lane design >/dev/null
if [ "$(find "$H1/.claude/skills" -maxdepth 1 -type l | wc -l)" -eq 4 ]; then ok "re-link is idempotent (still 4 links)"; else bad "re-link changed the link set"; fi

echo "[8] check passes on a correctly wired host and fails on a broken one"
if drive_fn "$H1/.claude/keel" check_host >/dev/null; then ok "check exit 0 on a wired host"; else bad "check should pass on a wired host"; fi
mkdir -p "$H1/.claude/skills/bogus-link-target"; ln -s ../../nowhere "$H1/.claude/skills/dangling"
if drive_fn "$H1/.claude/keel" check_host >/dev/null; then bad "check should fail on a dangling skill link"; else ok "check exit 1 on a dangling skill link"; fi
rm -f "$H1/.claude/skills/dangling"; rmdir "$H1/.claude/skills/bogus-link-target"
out="$(drive_fn "$H1/.claude/keel" check_host)"
if printf '%s' "$out" | grep -q "ok   /keel-secure"; then ok "check lists /keel-secure as discoverable"; else bad "check output should list /keel-secure"; fi

echo
echo "----------------------------------------"
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
