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
  ( cd "$dir"
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
H1="$(mktemp -d)/host"; mkdir -p "$H1"; ( cd "$H1"
  git init -q && git config user.email t@t && git config user.name t
  printf 'node_modules/\n' > .gitignore
  git add -A && git commit -qm init
  git -c protocol.file.allow=always submodule add -q "$KEEL_ROOT" .claude/skills/keel >/dev/null 2>&1
  mkdir -p .claude/skills/keel/vendor/fake-upstream
  printf 'x\n' > .claude/skills/keel/vendor/fake-upstream/big.py )
drive_ensure "$H1/.claude/skills/keel" >/dev/null
assert_line "$H1/.gitignore"      ".claude/skills/keel/vendor/" ".gitignore gets vendor/ entry"
assert_line "$H1/.graphifyignore" ".claude/skills/keel/"        ".graphifyignore gets whole-submodule entry"
assert_line "$H1/.claudeignore"   ".claude/skills/keel/"        ".claudeignore gets whole-submodule entry"
assert_line "$H1/.gitignore"      "node_modules/"               "pre-existing .gitignore content preserved"

# ---------------------------------------------------------------------------
echo "[2] idempotent — second run adds no duplicate lines"
drive_ensure "$H1/.claude/skills/keel" >/dev/null   # run again
assert_count "$H1/.gitignore"      ".claude/skills/keel/vendor/" 1 ".gitignore vendor/ appears exactly once"
assert_count "$H1/.graphifyignore" ".claude/skills/keel/"        1 ".graphifyignore entry appears exactly once"
assert_count "$H1/.claudeignore"   ".claude/skills/keel/"        1 ".claudeignore entry appears exactly once"

# ---------------------------------------------------------------------------
echo "[3] standalone (not a submodule) — no host files touched"
S="$(mktemp -d)/keel"; git clone -q "$KEEL_ROOT" "$S"
( cd "$S" && mkdir -p vendor/fake )
out="$(drive_ensure "$S")"
if printf '%s' "$out" | grep -q "isn't a submodule"; then ok "standalone run announces skip"; else bad "standalone run should announce skip"; fi
# ensure_host_ignores must not fabricate ignore files in a standalone checkout
assert_absent "$S/.graphifyignore" "no .graphifyignore created standalone"
assert_absent "$S/.claudeignore"   "no .claudeignore created standalone"

# ---------------------------------------------------------------------------
echo "[4] Keel's own .gitignore ignores vendor/"
( cd "$S" && mkdir -p vendor/x && printf 'y\n' > vendor/x/a.py )
if ( cd "$S" && git check-ignore -q vendor/x/a.py ); then ok "vendor/ is gitignored in a Keel checkout"; else bad "vendor/ should be gitignored in a Keel checkout"; fi

echo
echo "----------------------------------------"
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
