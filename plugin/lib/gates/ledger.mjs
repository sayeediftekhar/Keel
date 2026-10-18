import path from 'node:path';
import { base } from '../shell.mjs';
import { ALLOW, block, expandHome, safe } from './common.mjs';
import { governanceTargets, targetPath } from './governance.mjs';

// A feature ledger is <ledger.dir>/<feature>/00-status.md (Keel conventions §3):
//   **Rigor:** HEAVY — …
//   **Current phase:** 3 · Decompose   **Blocked on:** human approval (G3)
//   - [ ] G3 Plan — awaiting approval
// Two rules, both human-only decisions the agent must not make for the human:
//   1. a gate box (G1 / G2 / G3 / Ship) flips to [x] only by the human
//      (`keel approve`, run in their own terminal) — never by the agent's edit
//      or a shell rewrite of the ledger;
//   2. while any HEAVY ledger says "Blocked on: human approval (…)", the agent
//      writes no product code: markdown and the ledger dir stay editable so the
//      phase's docs can be finished; everything else waits for the gate.

const LEDGER_FILE = '00-status.md';
const GATE_LINE = /^- \[[xX]\][ \t]*(G[123]|Ship)(?![A-Za-z0-9])/gm;
const ledgerDir = (ctx) => ctx.policy.gates.ledger?.dir ?? '.scratch';

function ledgerBlock(what) { return block('ledger', what); }

/** Project-relative POSIX path of a tool target, or null when outside the project. */
function relToProject(target, cwd, ctx) {
  if (!target) return null;
  const real = (p) => safe(() => ctx.env.realpath?.(p), null) ?? p;
  const abs = real(path.resolve(cwd, expandHome(target)));
  const rel = path.relative(real(ctx.projectDir), abs).split(path.sep).join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel;
}

const isLedgerPath = (rel, ctx) => rel !== null && base(rel) === LEDGER_FILE
  && rel.startsWith(`${ledgerDir(ctx)}/`);
const isGateExempt = (rel, ctx) => rel === null || rel.startsWith(`${ledgerDir(ctx)}/`)
  || /\.(md|markdown)$/i.test(rel);

function checkedGates(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(GATE_LINE)) out.add(m[1]);
  return out;
}

/** Ledgers that currently hold the pipeline at a human gate. */
function gatingLedgers(ctx) {
  const all = safe(() => ctx.env.ledgers?.(), []) ?? [];
  return all.filter((l) => /^\*\*Rigor:\*\*[ \t]*HEAVY\b/m.test(l.text)
    && /\*\*Blocked on:\*\*[ \t]*human approval\b/.test(l.text))
    .map((l) => ({
      rel: l.rel,
      blockedOn: /\*\*Blocked on:\*\*[ \t]*([^\n]*)/.exec(l.text)?.[1]?.trim() ?? 'human approval',
    }));
}

/** The ledger text an edit tool call replaces (oldText) and what it writes in its place (newText). */
function editTexts(tool, input, rel, ctx) {
  if (tool === 'Write') {
    const newText = input.content ?? '';
    const oldText = safe(() => ctx.env.readFile?.(path.resolve(ctx.projectDir, rel)), null) ?? '';
    return { newText, oldText };
  }
  if (tool === 'Edit') return { newText: input.new_string ?? '', oldText: input.old_string ?? '' };
  if (tool === 'MultiEdit') {
    return {
      newText: (input.edits ?? []).map((e) => e.new_string ?? '').join('\n'),
      oldText: (input.edits ?? []).map((e) => e.old_string ?? '').join('\n'),
    };
  }
  return { newText: '', oldText: '' };
}

export function ledgerEdit(tool, input, cwd, ctx) {
  if (ctx.policy.gates.ledger?.mode !== 'block') return ALLOW;
  const rel = relToProject(input.file_path ?? input.notebook_path, cwd, ctx);
  if (isLedgerPath(rel, ctx)) {
    // Rule 1: only the human checks a gate box.
    const { newText, oldText } = editTexts(tool, input, rel, ctx);
    const before = checkedGates(oldText);
    const newly = [...checkedGates(newText)].filter((g) => !before.has(g));
    if (newly.length) {
      return ledgerBlock(`gate ${newly.join(', ')} in ${rel} can only be approved by the human. `
        + 'Leave it `- [ ]`, say you are waiting, and stop; '
        + `the approver runs \`keel approve <feature> ${newly[0]} "<why>"\` in their own terminal.`);
    }
    return ALLOW;
  }
  // Rule 2: no product code while a HEAVY feature waits at a gate.
  if (isGateExempt(rel, ctx)) return ALLOW;
  const gating = gatingLedgers(ctx);
  if (gating.length) {
    const g = gating[0];
    return ledgerBlock(`${g.rel} says "Blocked on: ${g.blockedOn}" — no product code until the human approves `
      + 'that gate (keel-dev §Gates). Finish the phase\'s docs and tickets, update the ledger, and stop. '
      + 'If that feature is parked, the human sets "Blocked on: paused".');
  }
  return ALLOW;
}

export function ledgerBash(cmd, cwd, ctx) {
  if (ctx.policy.gates.ledger?.mode !== 'block') return null;
  const prog = base(cmd.argv[0]);
  const a = cmd.argv.slice(1);
  // `keel approve` is the human's command. Through the agent's shell it is a self-approval.
  const isKeel = (prog === 'keel' && a[0] === 'approve')
    || (prog === 'keel-approve')
    || (['node', 'nodejs', 'bun', 'deno'].includes(prog)
      && a.some((x, i) => /keel(\.mjs|-approve)?$/.test(base(x)) && a[i + 1] === 'approve'));
  if (isKeel) {
    return ledgerBlock('`keel approve` is run by the human in their own terminal, never by the agent. '
      + 'Say which gate you are waiting on and stop.');
  }
  // Shell rewrites of a ledger (redirection, sed -i, tee, mv/cp/rm, …) bypass the Edit-tool check above.
  for (const t of governanceTargets(cmd)) {
    const rel = relToProject(targetPath(t), cwd, ctx);
    if (isLedgerPath(rel, ctx)) {
      return ledgerBlock(`${rel} is a feature ledger: edit it with the Edit tool (gate boxes stay human-only), `
        + 'never rewrite it from the shell.');
    }
  }
  return null;
}
