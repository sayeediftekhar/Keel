#!/usr/bin/env bash
# Regression test for bin/keel-approve — the HUMAN's tool for flipping a gate in
# a feature's 00-status.md ledger (conventions §3). Deterministic: no network, no LLM.
#
#   Usage:  evals/keel-approve-regression.sh
set -uo pipefail
KEEL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
ok()  { printf '  \033[32mok\033[0m   %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }

P="$(mktemp -d)/proj"; mkdir -p "$P/.scratch/invoicing/issues"
cd "$P" || exit 1
git init -q && git config user.name "Ada" && git config user.email a@a

cat > "$P/.scratch/invoicing/00-status.md" <<'L'
# Invoicing — Status

**Rigor:** HEAVY — surface 1 (value) + 3 (PII)
**Current phase:** 3 · Decompose   **Blocked on:** human approval (G3)

## Gates
- [x] G1 Align — approved 2026-10-01 by Ada: "yes"  (docs: 00-product.md)
- [x] G2 Spec  — approved 2026-10-02 by Ada: "ship it"  (docs: spec.md)
- [ ] G3 Plan  — awaiting approval  (docs: issues/)
- [ ] Ship     — not reached

## Slices
- [ ] 01 — invoice totals
L

echo "keel-approve regression"
out="$(KEEL_APPROVER=Ada bash "$KEEL_ROOT/bin/keel-approve" invoicing G3 "tickets look right" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ]; then ok "keel-approve exits 0"; else bad "keel-approve failed: $out"; fi
if grep -qE '^- \[x\] G3 Plan — approved [0-9-]+ by Ada: "tickets look right"' "$P/.scratch/invoicing/00-status.md"; then ok "G3 flipped with date, approver and words"; else bad "G3 line not rewritten as expected: $(grep 'G3' "$P/.scratch/invoicing/00-status.md")"; fi
if grep -q '(docs: issues/)' "$P/.scratch/invoicing/00-status.md"; then ok "docs pointer preserved"; else bad "docs pointer lost"; fi
if grep -q '\*\*Blocked on:\*\* nothing' "$P/.scratch/invoicing/00-status.md"; then ok "Blocked on cleared"; else bad "Blocked on not cleared"; fi
if grep -qE '^- \[x\] G1 Align — approved 2026-10-01 by Ada: "yes"' "$P/.scratch/invoicing/00-status.md" && grep -qE '^- \[ \] Ship' "$P/.scratch/invoicing/00-status.md"; then ok "other gate lines untouched"; else bad "other gate lines changed"; fi
out="$(bash "$KEEL_ROOT/bin/keel-approve" invoicing G3 "again" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q "already approved"; then ok "re-approving is a no-op"; else bad "re-approve should no-op: $out"; fi
bash "$KEEL_ROOT/bin/keel-approve" invoicing G9 "x" >/dev/null 2>&1; [ $? -eq 64 ] && ok "bad gate name rejected (64)" || bad "bad gate name should exit 64"
bash "$KEEL_ROOT/bin/keel-approve" nope G1 "x" >/dev/null 2>&1; [ $? -eq 66 ] && ok "missing ledger rejected (66)" || bad "missing ledger should exit 66"

echo
echo "----------------------------------------"
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
