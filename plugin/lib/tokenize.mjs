// The tokenizer under shell.mjs: splits a command line into words, operators and
// redirects. Quotes, escapes, ANSI-C strings, $(…) and backticks, comments and
// here-documents are read here; shell.mjs turns the tokens into simple commands.

const OPS = ['&&', '||', '|&', ';;', ';', '|', '&', '\n', '(', ')', '{', '}'];

function ansiC(s) {
  return s.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/g, (_, e) => {
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return { n: '\n', t: '\t', r: '\r', e: '\x1b', a: '\x07', '\\': '\\', "'": "'", '"': '"' }[e] ?? e;
  });
}

// The tokenizer's readers. Each looks at st.src[i]: when the construct there is its own, it consumes it and
// returns the index of the last character it read; otherwise it returns null and reads nothing.
// `st` is {src, word, tokens, subs, skips}: the word being built, tokens so far, command substitutions
// found, and here-document bodies the scan must jump over.

function pushWord(st) {
  if (st.word === null) return;
  // ${IFS} / $IFS word-splits in a real shell.
  for (const part of st.word.split(/\$\{IFS\}|\$IFS(?![A-Za-z0-9_])/)) {
    if (part !== '') st.tokens.push({ t: 'word', v: part });
  }
  st.word = null;
}

const addText = (st, s) => { st.word = (st.word ?? '') + s; };

/** From the `(` at i to its matching `)`, quotes respected: [inner text, index of the `)`]. */
function readParen(src, i) {
  let depth = 1; let j = i + 1; let q = null;
  for (; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"') j++; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
  }
  return [src.slice(i + 1, j), j];
}

/** From the opening character at i to the next `close` (or the end): [inner text, index of the close]. */
function readUntil(src, i, close) {
  const end = src.indexOf(close, i + 1);
  const stop = end === -1 ? src.length : end;
  return [src.slice(i + 1, stop), stop];
}

/** A command substitution at i, `$(…)` or `…`, recorded in st.subs: {text, end}, or null. */
function substitution(st, i) {
  const { src } = st;
  if (src[i] === '$' && src[i + 1] === '(') {
    const [inner, end] = readParen(src, i + 1);
    st.subs.push(inner);
    return { text: `$(${inner})`, end };
  }
  if (src[i] === '`') {
    const [inner, end] = readUntil(src, i, '`');
    st.subs.push(inner);
    return { text: `\`${inner}\``, end };
  }
  return null;
}

function readEscape(st, i) {
  const { src } = st;
  if (src[i] !== '\\' || i + 1 >= src.length) return null;
  if (src[i + 1] !== '\n') addText(st, src[i + 1]);
  return i + 1;
}

/** ANSI-C quoting: $'…'. */
function readAnsiC(st, i) {
  const { src } = st;
  if (src[i] !== '$' || src[i + 1] !== "'") return null;
  let j = i + 2; let raw = '';
  for (; j < src.length && src[j] !== "'"; j++) {
    if (src[j] === '\\') {
      raw += src[j] + (src[j + 1] ?? '');
      j++;
    } else raw += src[j];
  }
  addText(st, ansiC(raw));
  return j;
}

function readSingle(st, i) {
  if (st.src[i] !== "'") return null;
  const [text, end] = readUntil(st.src, i, "'");
  addText(st, text);
  return end;
}

function readDouble(st, i) {
  const { src } = st;
  if (src[i] !== '"') return null;
  let j = i + 1; let buf = '';
  for (; j < src.length && src[j] !== '"'; j++) {
    if (src[j] === '\\' && j + 1 < src.length && '"\\$`'.includes(src[j + 1])) {
      buf += src[j + 1];
      j++;
      continue;
    }
    const sub = substitution(st, j);
    if (sub) {
      buf += sub.text;
      j = sub.end;
      continue;
    }
    buf += src[j];
  }
  addText(st, buf);
  return j;
}

function readSubstitution(st, i) {
  const sub = substitution(st, i);
  if (!sub) return null;
  addText(st, sub.text);
  return sub.end;
}

function readComment(st, i) {
  if (st.src[i] !== '#' || st.word !== null) return null;
  const nl = st.src.indexOf('\n', i);
  return nl === -1 ? st.src.length : nl - 1;
}

/** A here-document's delimiter, starting at j: [delimiter, index after it]. */
function heredocDelim(src, j) {
  if (src[j] === "'" || src[j] === '"') {
    const e = src.indexOf(src[j], j + 1);
    return [src.slice(j + 1, e === -1 ? src.length : e), e === -1 ? src.length : e + 1];
  }
  let delim = '';
  while (j < src.length && /[^\s;&|<>()]/.test(src[j])) delim += src[j++];
  return [delim, j];
}

/** A here-document's body: the lines after the current one (and after earlier bodies) up to the delimiter. */
function heredocBody(st, from, delim) {
  const { src, skips } = st;
  const lastSkip = skips.length ? skips[skips.length - 1].end : -1;
  const nl = src.indexOf('\n', Math.max(from, lastSkip));
  if (nl === -1) return '';
  let k = nl + 1; const lines = [];
  while (k < src.length) {
    const e = src.indexOf('\n', k); const line = src.slice(k, e === -1 ? src.length : e);
    k = e === -1 ? src.length : e + 1;
    if (line.replace(/^\t+/, '') === delim) break;
    lines.push(line);
  }
  skips.push({ start: nl + 1, end: k });
  return lines.join('\n');
}

function readHeredoc(st, i) {
  const { src } = st;
  if (src[i] !== '<' || src[i + 1] !== '<' || src[i + 2] === '<') return null;
  // here-document: <<[-]DELIM … DELIM. The body starts after the end of
  // this line; read it now and skip over it when the scan reaches it.
  pushWord(st);
  let j = i + 2; if (src[j] === '-') j++;
  while (src[j] === ' ') j++;
  let delim;
  [delim, j] = heredocDelim(src, j);
  const body = heredocBody(st, j, delim);
  st.tokens.push({ t: 'redir', v: '<<<' });
  st.tokens.push({ t: 'word', v: body });
  return j - 1;
}

function readRedirect(st, i) {
  const { src } = st; const c = src[i];
  if (c !== '>' && c !== '<') return null;
  if (st.word !== null && /^(\d+|&)$/.test(st.word)) st.word = null; else pushWord(st);
  let j = i + 1;
  if (c === '<' && src[j] === '<' && src[j + 1] === '<') j += 2; // here-string
  else if (src[j] === '>' || src[j] === '|' || src[j] === '&') j++;
  st.tokens.push({ t: 'redir', v: src.slice(i, j) });
  return j - 1;
}

function readBlank(st, i) {
  if (st.src[i] !== ' ' && st.src[i] !== '\t') return null;
  pushWord(st);
  return i;
}

/** The newline before a here-document body: a command separator, then jump past the body. */
function readHeredocJump(st, i) {
  const { skips } = st;
  if (st.src[i] !== '\n' || !skips.length || skips[0].start !== i + 1) return null;
  pushWord(st); st.tokens.push({ t: 'op', v: '\n' });
  return skips.shift().end - 1;
}

function readOp(st, i) {
  const op = OPS.find((o) => st.src.startsWith(o, i));
  if (!op || ((op === '{' || op === '}') && st.word !== null)) return null;
  pushWord(st);
  st.tokens.push({ t: 'op', v: op });
  return i + op.length - 1;
}

const READERS = [readEscape, readAnsiC, readSingle, readDouble, readSubstitution, readComment, readHeredoc,
  readRedirect, readBlank, readHeredocJump, readOp];

/** Tokens: {t:'word', v} | {t:'op', v} | {t:'redir', v}. Here-docs become here-strings. */
export function tokenize(src) {
  const st = { src, word: null, tokens: [], subs: [], skips: [] };
  for (let i = 0; i < src.length; i++) {
    let end = null;
    for (const read of READERS) {
      end = read(st, i);
      if (end !== null) break;
    }
    if (end === null) addText(st, src[i]);
    else i = end;
  }
  pushWord(st);
  return { tokens: st.tokens, subs: st.subs };
}
