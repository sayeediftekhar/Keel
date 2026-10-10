// A small shell-command reader for the gate hooks. Not a full POSIX parser:
// it splits a command line into simple commands, unwraps the common wrappers
// (sh -c, env, sudo, npx, xargs, eval, $(...), backticks) and records
// redirect targets, so a gate sees `gh pr merge` whether it was typed plainly,
// chained, wrapped, or hidden in a substitution.
//
// Known limit (documented in M1-SPEC §5a): a program that performs the action
// itself (a node script calling the GitHub API) is invisible here. The GitHub
// ruleset and database credentials are the layers that stop that.

import path from 'node:path';

const OPS = ['&&', '||', '|&', ';;', ';', '|', '&', '\n', '(', ')'];

/** Split a command string into tokens: {t:'word', v} | {t:'op', v} | {t:'redir', v}.
 *  Substitutions ($(...) and backticks) are returned separately in `subs`. */
export function tokenize(src) {
  const tokens = [];
  const subs = [];
  let word = null; // accumulating word text, or null when between words
  const push = () => { if (word !== null) { tokens.push({ t: 'word', v: word }); word = null; } };
  const add = (s) => { word = (word ?? '') + s; };

  // Read a balanced $( ... ) starting at index of '(' ; returns [inner, endIndex].
  const readParen = (i) => {
    let depth = 1; let j = i + 1; let q = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (q) { if (c === q) q = null; else if (c === '\\' && q === '"') j++; continue; }
      if (c === "'" || c === '"') { q = c; continue; }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) break; }
    }
    return [src.slice(i + 1, j), j];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length) { if (src[i + 1] !== '\n') add(src[i + 1]); i++; continue; }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      add(src.slice(i + 1, end === -1 ? src.length : end));
      i = end === -1 ? src.length : end;
      continue;
    }
    if (c === '"') {
      let j = i + 1; let buf = '';
      for (; j < src.length && src[j] !== '"'; j++) {
        if (src[j] === '\\' && j + 1 < src.length && '"\\$`'.includes(src[j + 1])) { buf += src[j + 1]; j++; continue; }
        if (src[j] === '$' && src[j + 1] === '(') { const [inner, end] = readParen(j + 1); subs.push(inner); buf += `$(${inner})`; j = end; continue; }
        if (src[j] === '`') { const end = src.indexOf('`', j + 1); const inner = src.slice(j + 1, end === -1 ? src.length : end); subs.push(inner); buf += `\`${inner}\``; j = end === -1 ? src.length : end; continue; }
        buf += src[j];
      }
      word = (word ?? '') + buf;
      i = j;
      continue;
    }
    if (c === '$' && src[i + 1] === '(') { const [inner, end] = readParen(i + 1); subs.push(inner); add(`$(${inner})`); i = end; continue; }
    if (c === '`') { const end = src.indexOf('`', i + 1); const inner = src.slice(i + 1, end === -1 ? src.length : end); subs.push(inner); add(`\`${inner}\``); i = end === -1 ? src.length : end; continue; }
    if (c === '#' && word === null) { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl - 1; continue; }
    if (c === '>' || c === '<') {
      // fd prefix like 2> or &> belongs to the redirect, not to the word.
      if (word !== null && /^(\d+|&)$/.test(word)) word = null; else push();
      let j = i + 1;
      if (src[j] === '>' || src[j] === '|' || src[j] === '&') j++;
      tokens.push({ t: 'redir', v: src.slice(i, j) });
      i = j - 1;
      continue;
    }
    if (c === ' ' || c === '\t') { push(); continue; }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) { push(); tokens.push({ t: 'op', v: op }); i += op.length - 1; continue; }
    add(c);
  }
  push();
  return { tokens, subs };
}

const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const PASSTHRU = new Set(['sudo', 'nohup', 'time', 'command', 'exec', 'nice', 'builtin', 'doas']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const RUNNERS = new Set(['npx', 'bunx', 'pnpx']);

/** Parse a command string into simple commands: [{argv, assigns, redirects}]. */
export function parseCommands(src, depth = 0) {
  if (depth > 6 || typeof src !== 'string') return [];
  const { tokens, subs } = tokenize(src);
  const out = [];
  let cur = { argv: [], assigns: {}, redirects: [] };
  const flush = () => { if (cur.argv.length || Object.keys(cur.assigns).length || cur.redirects.length) out.push(...unwrap(cur, depth)); cur = { argv: [], assigns: {}, redirects: [] }; };
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t === 'op') { flush(); continue; }
    if (tk.t === 'redir') {
      const next = tokens[i + 1];
      if (next && next.t === 'word') {
        if (!/^&?\d+$/.test(next.v) && !tk.v.startsWith('<')) cur.redirects.push(next.v);
        i++;
      }
      continue;
    }
    if (cur.argv.length === 0 && ASSIGN.test(tk.v)) {
      const eq = tk.v.indexOf('=');
      cur.assigns[tk.v.slice(0, eq)] = tk.v.slice(eq + 1);
      continue;
    }
    cur.argv.push(tk.v);
  }
  flush();
  for (const s of subs) out.push(...parseCommands(s, depth + 1));
  return out;
}

export const base = (p) => path.basename(String(p ?? ''));

/** Peel wrappers off a simple command until the real program is argv[0]. */
function unwrap(cmd, depth) {
  let { argv, assigns, redirects } = cmd;
  argv = [...argv]; assigns = { ...assigns };
  for (let guard = 0; guard < 10 && argv.length; guard++) {
    const prog = base(argv[0]);
    if (PASSTHRU.has(prog)) {
      argv.shift();
      while (argv.length && argv[0].startsWith('-')) { const f = argv.shift(); if (['-u', '-g', '-n'].includes(f)) argv.shift(); }
      continue;
    }
    if (prog === 'env') {
      const rest = argv.slice(1);
      while (rest.length && (rest[0].startsWith('-') || ASSIGN.test(rest[0]))) {
        const t = rest.shift();
        if (ASSIGN.test(t)) { const eq = t.indexOf('='); assigns[t.slice(0, eq)] = t.slice(eq + 1); }
        else if (t === '-u' || t === '-C' || t === '-S') rest.shift();
      }
      if (!rest.length) return [{ argv: ['env'], assigns, redirects }]; // bare `env` prints everything
      argv = rest; continue;
    }
    if (prog === 'xargs') {
      argv.shift();
      while (argv.length && argv[0].startsWith('-')) { const f = argv.shift(); if (/^-[IdLnPs]$/.test(f)) argv.shift(); }
      continue;
    }
    if (RUNNERS.has(prog)) {
      argv.shift();
      while (argv.length && argv[0].startsWith('-')) { const f = argv.shift(); if (f === '-p' || f === '--package') argv.shift(); }
      continue;
    }
    if ((prog === 'pnpm' || prog === 'yarn') && ['exec', 'dlx'].includes(argv[1])) { argv = argv.slice(2); continue; }
    if (prog === 'npm' && argv[1] === 'exec') { const k = argv.indexOf('--'); argv = k >= 0 ? argv.slice(k + 1) : argv.slice(2).filter((a) => !a.startsWith('-')); continue; }
    if (SHELLS.has(prog)) {
      const flagIdx = argv.findIndex((a, k) => k > 0 && /^-[a-z]*c[a-z]*$/.test(a));
      if (flagIdx > 0 && argv[flagIdx + 1] !== undefined) {
        return parseCommands(argv[flagIdx + 1], depth + 1).map((c) => ({ ...c, assigns: { ...assigns, ...c.assigns } }));
      }
      return [{ argv, assigns, redirects }];
    }
    if (prog === 'eval') {
      return parseCommands(argv.slice(1).join(' '), depth + 1).map((c) => ({ ...c, assigns: { ...assigns, ...c.assigns } }));
    }
    break;
  }
  return argv.length || redirects.length ? [{ argv, assigns, redirects }] : [];
}
