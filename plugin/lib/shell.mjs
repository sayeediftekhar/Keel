// A small shell-command reader for the gate hooks. Not a full POSIX parser:
// it splits a command line into simple commands, unwraps the common wrappers
// (sh -c, here-strings, `echo … | sh`, env, sudo, timeout, npx, xargs,
// find -exec, watch, eval, $(...), backticks), tracks simple variable
// assignments, and records redirects, so a gate sees `gh pr merge` however it
// was spelled.
//
// Known limit (M1-SPEC §5a): a program that performs the action itself (a
// node script calling the GitHub API) is invisible here. The GitHub ruleset
// and database credentials are the layers that stop that.

import path from 'node:path';
import { tokenize } from './tokenize.mjs';

export { tokenize };

const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const PASSTHRU = new Set([
  'sudo', 'nohup', 'time', 'command', 'exec', 'builtin', 'doas', 'chronic', 'caffeinate', 'ionice', 'unbuffer',
]);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish']);
const RUNNERS = new Set(['npx', 'bunx', 'pnpx']);

export const base = (p) => path.basename(String(p ?? ''));

const expandVars = (s, vars) => String(s).replace(
  /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
  (m, a, b) => {
    const k = a ?? b;
    return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
  },
);

/** `export X=…` / `declare [-x] X=…` set shell variables for later commands. */
function exportVars(argv, vars) {
  if (argv[0] !== 'export'
    && !(argv[0] === 'declare' && argv.slice(1).every((a) => ASSIGN.test(a) || a === '-x'))) return;
  for (const a of argv.slice(1)) {
    if (ASSIGN.test(a)) {
      const eq = a.indexOf('=');
      vars[a.slice(0, eq)] = a.slice(eq + 1);
    }
  }
}

/** A redirect and its target word: here-string text, an input file, or an output path (not `>&2`). */
function addRedirect(cmd, op, target) {
  if (op === '<<<') cmd.stdinText = target;
  else if (op.startsWith('<')) cmd.inputs.push(target);
  else if (!/^&?\d+$/.test(target)) cmd.redirects.push(target);
}

/** Parse into simple commands: [{argv, assigns, redirects, inputs, stdinText, pipedFrom, dynamic}]. */
export function parseCommands(src, depth = 0, vars = {}) {
  if (depth > 6 || typeof src !== 'string') return [];
  const { tokens, subs } = tokenize(src);
  const out = [];
  let cur = null; let prev = null; let piped = false;
  const fresh = () => ({ argv: [], assigns: {}, redirects: [], inputs: [], stdinText: null, pipedFrom: null });
  cur = fresh();
  const flush = (op) => {
    const c = cur;
    if (c.argv.length || Object.keys(c.assigns).length || c.redirects.length || c.inputs.length) {
      if (piped) c.pipedFrom = prev;
      if (!c.argv.length) {
        // `X=…` alone (or `export X=…`) sets a shell variable for later commands.
        for (const [k, v] of Object.entries(c.assigns)) vars[k] = expandVars(v, vars);
      }
      c.argv = c.argv.map((a) => expandVars(a, vars));
      exportVars(c.argv, vars);
      const unwrapped = unwrap(c, depth, vars);
      out.push(...unwrapped);
      prev = unwrapped[unwrapped.length - 1] ?? c;
    }
    piped = op === '|' || op === '|&';
    cur = fresh();
  };
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t === 'op') { flush(tk.v); continue; }
    if (tk.t === 'redir') {
      const next = tokens[i + 1];
      if (next && next.t === 'word') {
        addRedirect(cur, tk.v, next.v);
        i++;
      }
      continue;
    }
    if (cur.argv.length === 0 && ASSIGN.test(tk.v)) {
      const eq = tk.v.indexOf('=');
      cur.assigns[tk.v.slice(0, eq)] = expandVars(tk.v.slice(eq + 1), vars);
      continue;
    }
    cur.argv.push(tk.v);
  }
  flush(null);
  for (const s of subs) out.push(...parseCommands(s, depth + 1, { ...vars }));
  return out;
}

/** A wrapper's leading flags off argv (in place), with the value of each flag that takes one, then `operands`. */
const stripFlags = (takesValue, operands = 0) => (argv) => {
  argv.shift();
  while (argv.length && argv[0].startsWith('-')) {
    const f = argv.shift();
    if (takesValue(f)) argv.shift();
  }
  argv.splice(0, operands);
};

const passthruFlags = stripFlags((f) => ['-u', '-g', '-n', '-c', '-t'].includes(f));
const runnerFlags = stripFlags((f) => f === '-p' || f === '--package');
const timeoutFlags = stripFlags((f) => ['-s', '-k', '--signal', '--kill-after'].includes(f), 1); // then duration

/** Wrappers that run the rest of their argv as the program: how to peel each one off. */
const PREFIXES = new Map([
  ...[...PASSTHRU].map((p) => [p, passthruFlags]),
  ...[...RUNNERS].map((p) => [p, runnerFlags]),
  ['nice', stripFlags((f) => f === '-n')],
  ['timeout', timeoutFlags],
  ['gtimeout', timeoutFlags],
  ['stdbuf', stripFlags((f) => /^-[ioe]$/.test(f))],
  ['xargs', stripFlags((f) => /^-[IdLnPsEa]$/.test(f))],
]);

const watchFlags = stripFlags((f) => f === '-n' || f === '--interval');

/** `find … -exec CMD ;` → {head: the find itself, exec: CMD}, or null without -exec. */
function findExec(argv) {
  const k = argv.findIndex((a) => ['-exec', '-execdir', '-ok', '-okdir'].includes(a));
  if (k < 0) return null;
  const rest = argv.slice(k + 1);
  const end = rest.findIndex((a) => a === ';' || a === '+' || a === '\;');
  return { head: argv.slice(0, k), exec: rest.slice(0, end < 0 ? rest.length : end) };
}

/** `env [-flags] [X=…]… CMD` → CMD's argv; its assignments go into `assigns`. */
function envArgs(argv, assigns) {
  const rest = argv.slice(1);
  while (rest.length && (rest[0].startsWith('-') || ASSIGN.test(rest[0]))) {
    const t = rest.shift();
    if (ASSIGN.test(t)) { const eq = t.indexOf('='); assigns[t.slice(0, eq)] = t.slice(eq + 1); }
    else if (t === '-u' || t === '-C' || t === '-S') rest.shift();
  }
  return rest;
}

/** `pnpm|yarn exec|dlx CMD` and `npm exec|x [-p PKG] [--] CMD` → CMD's argv, or null for anything else. */
function packageExec(prog, argv) {
  if ((prog === 'pnpm' || prog === 'yarn') && ['exec', 'dlx'].includes(argv[1])) return argv.slice(2);
  if (prog !== 'npm' || (argv[1] !== 'exec' && argv[1] !== 'x')) return null;
  const rest = argv.slice(2);
  while (rest.length && rest[0].startsWith('-') && rest[0] !== '--') {
    const f = rest.shift();
    if (f === '-p' || f === '--package') rest.shift();
  }
  if (rest[0] === '--') rest.shift();
  const dd = rest.indexOf('--'); if (dd > 0) rest.splice(dd, 1);
  return rest;
}

/** The script a shell runs: its -c argument, a here-string, or `echo … |` piped in; null when we can't see it. */
function shellScript(argv, cmd) {
  for (let k = 1; k < argv.length && argv[k].startsWith('-'); k++) {
    if (!/^-[a-z]*c[a-z]*$/i.test(argv[k]) || argv[k].startsWith('--')) continue;
    const s = argv[k + 1] === '--' ? k + 2 : k + 1;
    if (argv[s] !== undefined) return argv[s];
  }
  if (cmd.stdinText) return cmd.stdinText;
  const src = cmd.pipedFrom;
  if (src && ['echo', 'printf'].includes(base(src.argv[0]))) {
    return src.argv.slice(1).filter((a) => !/^-[neE]+$/.test(a)).join(' ');
  }
  return null;
}

const leftover = (cmd, argv) => argv.length || cmd.redirects.length || cmd.inputs.length;

/** Peel wrappers off a simple command until the real program is argv[0]. */
function unwrap(cmd, depth, vars) {
  let argv = [...cmd.argv];
  const assigns = { ...cmd.assigns };
  const keep = (a) => ({ ...cmd, argv: a, assigns, dynamic: /[$`]/.test(a[0] ?? '') });
  const inner = (script) => parseCommands(script, depth + 1, { ...vars })
    .map((c) => ({ ...c, assigns: { ...assigns, ...c.assigns } }));
  for (let guard = 0; guard < 12 && argv.length; guard++) {
    const prog = base(argv[0]);
    const peel = PREFIXES.get(prog);
    if (peel) { peel(argv); continue; }
    if (prog === 'watch') { watchFlags(argv); return inner(argv.join(' ')); }
    if (prog === 'find') {
      const found = findExec(argv);
      if (!found) break;
      return [keep(found.head), ...unwrap({ ...cmd, argv: found.exec }, depth, vars)];
    }
    if (prog === 'env') {
      argv = envArgs(argv, assigns);
      if (!argv.length) return [keep(['env'])];
      continue;
    }
    const run = packageExec(prog, argv);
    if (run) { argv = run; continue; }
    if (SHELLS.has(prog)) {
      const script = shellScript(argv, cmd); // null: reads a script from stdin we can't see
      return script === null ? [keep(argv)] : inner(script);
    }
    if (prog === 'eval') return inner(argv.slice(1).join(' '));
    break;
  }
  return leftover(cmd, argv) ? [keep(argv)] : [];
}
