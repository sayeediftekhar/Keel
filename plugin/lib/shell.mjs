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

const OPS = ['&&', '||', '|&', ';;', ';', '|', '&', '\n', '(', ')', '{', '}'];

function ansiC(s) {
  return s.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/g, (_, e) => {
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return { n: '\n', t: '\t', r: '\r', e: '\x1b', a: '\x07', '\\': '\\', "'": "'", '"': '"' }[e] ?? e;
  });
}

/** Tokens: {t:'word', v} | {t:'op', v} | {t:'redir', v}. Here-docs become here-strings. */
export function tokenize(src) {
  const tokens = [];
  const subs = [];
  const skips = [];
  let word = null;
  const push = () => {
    if (word === null) return;
    // ${IFS} / $IFS word-splits in a real shell.
    for (const part of word.split(/\$\{IFS\}|\$IFS(?![A-Za-z0-9_])/)) {
      if (part !== '') tokens.push({ t: 'word', v: part });
    }
    word = null;
  };
  const add = (s) => { word = (word ?? '') + s; };
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
    if (c === '$' && src[i + 1] === "'") {
      let j = i + 2; let raw = '';
      for (; j < src.length && src[j] !== "'"; j++) {
        if (src[j] === '\\') {
          raw += src[j] + (src[j + 1] ?? '');
          j++;
        } else raw += src[j];
      }
      add(ansiC(raw)); i = j; continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      add(src.slice(i + 1, end === -1 ? src.length : end));
      i = end === -1 ? src.length : end;
      continue;
    }
    if (c === '"') {
      let j = i + 1; let buf = '';
      for (; j < src.length && src[j] !== '"'; j++) {
        if (src[j] === '\\' && j + 1 < src.length && '"\\$`'.includes(src[j + 1])) {
          buf += src[j + 1];
          j++;
          continue;
        }
        if (src[j] === '$' && src[j + 1] === '(') {
          const [inner, end] = readParen(j + 1);
          subs.push(inner);
          buf += `$(${inner})`;
          j = end;
          continue;
        }
        if (src[j] === '`') {
          const end = src.indexOf('`', j + 1);
          const inner = src.slice(j + 1, end === -1 ? src.length : end);
          subs.push(inner);
          buf += `\`${inner}\``;
          j = end === -1 ? src.length : end;
          continue;
        }
        buf += src[j];
      }
      word = (word ?? '') + buf;
      i = j;
      continue;
    }
    if (c === '$' && src[i + 1] === '(') {
      const [inner, end] = readParen(i + 1);
      subs.push(inner);
      add(`$(${inner})`);
      i = end;
      continue;
    }
    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      const inner = src.slice(i + 1, end === -1 ? src.length : end);
      subs.push(inner);
      add(`\`${inner}\``);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (c === '#' && word === null) { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl - 1; continue; }
    if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
      // here-document: <<[-]DELIM … DELIM. The body starts after the end of
      // this line; read it now and skip over it when the scan reaches it.
      push();
      let j = i + 2; if (src[j] === '-') j++;
      while (src[j] === ' ') j++;
      let delim = '';
      if (src[j] === "'" || src[j] === '"') {
        const q = src[j];
        const e = src.indexOf(q, j + 1);
        delim = src.slice(j + 1, e === -1 ? src.length : e);
        j = e === -1 ? src.length : e + 1;
      } else { while (j < src.length && /[^\s;&|<>()]/.test(src[j])) delim += src[j++]; }
      const lastSkip = skips.length ? skips[skips.length - 1].end : -1;
      const nl = src.indexOf('\n', Math.max(j, lastSkip));
      let body = '';
      if (nl !== -1) {
        let k = nl + 1; const lines = [];
        while (k < src.length) {
          const e = src.indexOf('\n', k); const line = src.slice(k, e === -1 ? src.length : e);
          k = e === -1 ? src.length : e + 1;
          if (line.replace(/^\t+/, '') === delim) break;
          lines.push(line);
        }
        body = lines.join('\n');
        skips.push({ start: nl + 1, end: k });
      }
      tokens.push({ t: 'redir', v: '<<<' });
      tokens.push({ t: 'word', v: body });
      i = j - 1;
      continue;
    }
    if (c === '>' || c === '<') {
      if (word !== null && /^(\d+|&)$/.test(word)) word = null; else push();
      let j = i + 1;
      if (c === '<' && src[j] === '<' && src[j + 1] === '<') j += 2; // here-string
      else if (src[j] === '>' || src[j] === '|' || src[j] === '&') j++;
      tokens.push({ t: 'redir', v: src.slice(i, j) });
      i = j - 1;
      continue;
    }
    if (c === ' ' || c === '\t') { push(); continue; }
    if (c === '\n' && skips.length && skips[0].start === i + 1) {
      push(); tokens.push({ t: 'op', v: '\n' });
      i = skips.shift().end - 1;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op && !((op === '{' || op === '}') && word !== null)) {
      push();
      tokens.push({ t: 'op', v: op });
      i += op.length - 1;
      continue;
    }
    add(c);
  }
  push();
  return { tokens, subs };
}

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
      if (c.argv[0] === 'export'
        || c.argv[0] === 'declare' && c.argv.slice(1).every((a) => ASSIGN.test(a) || a === '-x')) {
        for (const a of c.argv.slice(1)) {
          if (ASSIGN.test(a)) {
            const eq = a.indexOf('=');
            vars[a.slice(0, eq)] = a.slice(eq + 1);
          }
        }
      }
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
        if (tk.v === '<<<') cur.stdinText = next.v;
        else if (tk.v.startsWith('<')) cur.inputs.push(next.v);
        else if (!/^&?\d+$/.test(next.v)) cur.redirects.push(next.v);
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

/** Peel wrappers off a simple command until the real program is argv[0]. */
function unwrap(cmd, depth, vars) {
  let argv = [...cmd.argv];
  const assigns = { ...cmd.assigns };
  const keep = (a) => ({ ...cmd, argv: a, assigns, dynamic: /[$`]/.test(a[0] ?? '') });
  const inner = (script) => parseCommands(script, depth + 1, { ...vars })
    .map((c) => ({ ...c, assigns: { ...assigns, ...c.assigns } }));
  for (let guard = 0; guard < 12 && argv.length; guard++) {
    const prog = base(argv[0]);
    if (PASSTHRU.has(prog)) {
      argv.shift();
      while (argv.length && argv[0].startsWith('-')) {
        const f = argv.shift();
        if (['-u', '-g', '-n', '-c', '-t'].includes(f)) argv.shift();
      }
      continue;
    }
    if (prog === 'nice') {
      argv.shift();
      while (argv.length && argv[0].startsWith('-')) {
        const f = argv.shift();
        if (f === '-n') argv.shift();
      }
      continue;
    }
    if (prog === 'timeout' || prog === 'gtimeout') {
      argv.shift();
      while (argv.length && argv[0].startsWith('-')) {
        const f = argv.shift();
        if (['-s', '-k', '--signal', '--kill-after'].includes(f)) argv.shift();
      }
      argv.shift(); // duration
      continue;
    }
    if (prog === 'stdbuf') {
      argv.shift();
      while (argv.length && argv[0].startsWith('-')) {
        const f = argv.shift();
        if (/^-[ioe]$/.test(f)) argv.shift();
      }
      continue;
    }
    if (prog === 'watch') {
      argv.shift();
      while (argv.length && argv[0].startsWith('-')) {
        const f = argv.shift();
        if (['-n', '--interval', '-d'].includes(f) && f !== '-d') argv.shift();
      }
      return inner(argv.join(' '));
    }
    if (prog === 'find') {
      const k = argv.findIndex((a) => ['-exec', '-execdir', '-ok', '-okdir'].includes(a));
      if (k < 0) break;
      const rest = argv.slice(k + 1);
      const end = rest.findIndex((a) => a === ';' || a === '+' || a === '\\;');
      return [
        keep(argv.slice(0, k)),
        ...unwrap({ ...cmd, argv: rest.slice(0, end < 0 ? rest.length : end) }, depth, vars),
      ];
    }
    if (prog === 'env') {
      const rest = argv.slice(1);
      while (rest.length && (rest[0].startsWith('-') || ASSIGN.test(rest[0]))) {
        const t = rest.shift();
        if (ASSIGN.test(t)) { const eq = t.indexOf('='); assigns[t.slice(0, eq)] = t.slice(eq + 1); }
        else if (t === '-u' || t === '-C' || t === '-S') rest.shift();
      }
      if (!rest.length) return [keep(['env'])];
      argv = rest; continue;
    }
    if (prog === 'xargs') {
      argv.shift();
      while (argv.length && argv[0].startsWith('-')) {
        const f = argv.shift();
        if (/^-[IdLnPsEa]$/.test(f)) argv.shift();
      }
      continue;
    }
    if (RUNNERS.has(prog)) {
      argv.shift();
      while (argv.length && argv[0].startsWith('-')) {
        const f = argv.shift();
        if (f === '-p' || f === '--package') argv.shift();
      }
      continue;
    }
    if ((prog === 'pnpm' || prog === 'yarn') && ['exec', 'dlx'].includes(argv[1])) { argv = argv.slice(2); continue; }
    if (prog === 'npm' && (argv[1] === 'exec' || argv[1] === 'x')) {
      let rest = argv.slice(2);
      while (rest.length && rest[0].startsWith('-') && rest[0] !== '--') {
        const f = rest.shift();
        if (f === '-p' || f === '--package') rest.shift();
      }
      if (rest[0] === '--') rest.shift();
      const dd = rest.indexOf('--'); if (dd > 0) rest.splice(dd, 1);
      argv = rest; continue;
    }
    if (SHELLS.has(prog)) {
      let k = 1;
      while (k < argv.length && argv[k].startsWith('-')) {
        if (/^-[a-z]*c[a-z]*$/i.test(argv[k]) && !argv[k].startsWith('--')) {
          let s = k + 1; if (argv[s] === '--') s++;
          if (argv[s] !== undefined) return inner(argv[s]);
        }
        k++;
      }
      if (cmd.stdinText) return inner(cmd.stdinText);
      const src = cmd.pipedFrom;
      if (src && ['echo', 'printf'].includes(base(src.argv[0]))) {
        return inner(src.argv.slice(1).filter((a) => !/^-[neE]+$/.test(a)).join(' '));
      }
      if (argv[k] === undefined) return [keep(argv)]; // reads a script from stdin we can't see
      return [keep(argv)];
    }
    if (prog === 'eval') return inner(argv.slice(1).join(' '));
    break;
  }
  return argv.length || cmd.redirects.length || cmd.inputs.length ? [keep(argv)] : [];
}
