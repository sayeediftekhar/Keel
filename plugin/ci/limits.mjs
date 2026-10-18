// Clean-code limits (D20e): a ratchet on the files a pull request changes,
// never the whole repo. Copied next to keel-ci.mjs as .keel/ci/limits.mjs by
// `keel compile`; Node built-ins and keel-ci.mjs only.
//
//   node .keel/ci/keel-ci.mjs limits [--mode=fail|warn]
//
// A changed file may not get worse than its base: no new over-long line, no
// function newly over the length or complexity cap (or longer / more complex
// than it was), no new stable → volatile import, and a file over the length
// cap may not grow. A new file meets the caps. Code the PR only moves is not
// new: a line or function that already existed in the PR's base, in any file,
// keeps its old measure, so splitting a big file never fails. Each limit warns
// or fails as quality.limits says; formatting is never checked here (the
// project's formatter fixes it on write).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { globToRegExp, lockPolicy, fail } from './keel-ci.mjs';

const ROOT = process.cwd();
export const ESLINT_PIN = '9.39.5';
export const LIMIT_DEFAULTS = { fileLines: 400, functionLines: 80, lineLength: 120, complexity: 15 };
export const LIMIT_NAMES = ['fileLines', 'functionLines', 'lineLength', 'complexity', 'boundaries'];
const CODE_FILE = new RegExp('\\.(m?[jt]sx?|c[jt]s|py|rb|go|rs|java|kts?|swift|c|h|cc|cpp|hpp|cs|php|scala|sh|bash|zsh'
  + '|sql|vue|svelte|astro|dart|lua|exs?)$', 'i');
const JS_FILE = /\.(m?jsx?|cjs)$/i;
const TS_FILE = /\.(tsx?|mts|cts)$/i;
const SKIP_PATHS = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**', '**/*.min.*', '.keel/**'];
const IMPORT_SPEC = new RegExp(String.raw`\bfrom\s*['"]([^'"\n]+)['"]|\bimport\s*\(?\s*['"]([^'"\n]+)['"]`
  + String.raw`|\brequire\s*\(\s*['"]([^'"\n]+)['"]`, 'g');
const RULE_METRIC = { 'max-lines-per-function': 'functionLines', complexity: 'complexity' };
const METRIC_VALUE = { functionLines: /\((\d+)\)/, complexity: /complexity of (\d+)/ };
const MAX_NOTES = 10; // annotations per file and limit

/** Pure: quality.limits with defaults. A limit is a number (its cap) or {max, mode}; `mode` sets the default. */
export function normalizeLimits(raw = {}) {
  const mode = raw.mode ?? 'warn';
  const cap = (k) => {
    const v = raw[k];
    const o = typeof v === 'number' ? { max: v } : (v ?? {});
    return { max: o.max ?? LIMIT_DEFAULTS[k], mode: o.mode ?? mode };
  };
  return {
    fileLines: cap('fileLines'),
    functionLines: cap('functionLines'),
    lineLength: cap('lineLength'),
    complexity: cap('complexity'),
    boundaries: { mode: raw.boundaries?.mode ?? mode },
    exclude: raw.exclude ?? [],
    formatter: raw.formatter ?? null,
  };
}

/** Pure: is this path one the limits apply to? Source files only; build output and vendored code never. */
export function limitedFile(file, limits) {
  if (!CODE_FILE.test(file)) return false;
  return ![...SKIP_PATHS, ...limits.exclude].some((g) => globToRegExp(g).test(file));
}

/** Pure: a file's line count and its lines over the cap. */
export function lineMetrics(text, maxLen) {
  const lines = String(text).split('\n');
  if (lines.at(-1) === '') lines.pop();
  const long = [];
  lines.forEach((l, i) => { if (l.length > maxLen) long.push({ line: i + 1, length: l.length, text: l.trim() }); });
  return { lines: lines.length, long };
}

const moduleGlob = (p) => (/[*?]/.test(p) ? p : `${p.replace(/\/+$/, '')}/**`);

/** Pure: the module-map row (docs/ARCHITECTURE.md) whose path holds a repo path, or null. */
export function moduleOf(file, modules) {
  // `../ui` imports the directory's index, so the directory itself is inside the module too.
  return modules.find((m) => [file, `${file}/`].some((f) => globToRegExp(moduleGlob(m.path)).test(f))) ?? null;
}

/** Pure: imports from a stable module into a volatile one (Systems Thinking rung 3). Relative specifiers only. */
export function boundaryViolations(file, text, modules) {
  const own = moduleOf(file, modules);
  if (own?.stability !== 'stable') return [];
  const out = [];
  for (const m of String(text).matchAll(IMPORT_SPEC)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec.startsWith('.')) continue;
    const to = moduleOf(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)), modules);
    if (to?.stability !== 'volatile' || to === own) continue;
    out.push({ line: text.slice(0, m.index).split('\n').length,
      message: `stable module "${own.name}" imports "${spec}" from volatile module "${to.name}"` });
  }
  return out;
}

/** Pure: ESLint's max-lines-per-function / complexity messages → one entry per function over a cap.
 *  A function's key is its name ("function 'decide'"), or its first line when it has none. */
export function functionMetrics(messages, lines) {
  const out = [];
  for (const m of messages) {
    const metric = RULE_METRIC[m.ruleId];
    const value = metric && Number(METRIC_VALUE[metric].exec(m.message)?.[1]);
    if (!value) continue;
    const label = /^(.*?) has /.exec(m.message)?.[1] ?? 'function';
    const key = /'[^']+'/.test(label) ? label.toLowerCase() : `line: ${(lines[m.line - 1] ?? '').trim()}`;
    out.push({ key, label, line: m.line, metric, value });
  }
  return out;
}

/** Everything the base of the PR already had: over-long lines, over-cap functions, boundary violations. */
export function basePool(measures) {
  const pool = { long: new Set(), fns: new Map(), boundaries: new Set() };
  for (const m of measures) {
    for (const l of m.lines.long) pool.long.add(l.text);
    for (const f of m.fns ?? []) {
      const k = `${f.metric} ${f.key}`;
      pool.fns.set(k, Math.max(pool.fns.get(k) ?? 0, f.value));
    }
    for (const b of m.boundaries) pool.boundaries.add(b.message);
  }
  return pool;
}

function fileLengthFindings(file, head, base, L) {
  if (head.lines.lines <= L.fileLines.max || head.lines.lines <= (base?.lines.lines ?? 0)) return [];
  const was = base ? `, was ${base.lines.lines}` : ', new file';
  return [{ limit: 'fileLines', line: 1,
    message: `${file} is ${head.lines.lines} lines (cap ${L.fileLines.max}${was}). Split it by job.` }];
}

function lineLengthFindings(file, head, pool, L) {
  const fresh = head.lines.long.filter((l) => !pool.long.has(l.text));
  if (!fresh.length) return [];
  return [{ limit: 'lineLength', line: fresh[0].line, message: `${file}: ${fresh.length} new line(s) over `
    + `${L.lineLength.max} characters (line ${fresh[0].line} is ${fresh[0].length}).` }];
}

function functionFindings(file, head, pool, L) {
  const out = [];
  for (const f of head.fns ?? []) {
    const cap = L[f.metric].max;
    const before = pool.fns.get(`${f.metric} ${f.key}`);
    if (L[f.metric].mode === 'off' || f.value <= cap || (before !== undefined && f.value <= before)) continue;
    const what = f.metric === 'complexity' ? 'complexity' : 'lines';
    out.push({ limit: f.metric, line: f.line, message: `${file}: ${f.label} has ${what} ${f.value} `
      + `(cap ${cap}${before === undefined ? '' : `, was ${before}`}). Extract a function.` });
  }
  return out;
}

function boundaryFindings(file, head, pool) {
  return head.boundaries.filter((v) => !pool.boundaries.has(v.message)).map((b) => ({ limit: 'boundaries',
    line: b.line, message: `${file}: ${b.message} (docs/ARCHITECTURE.md module map).` }));
}

/** Pure: the ratchet for one changed file. `head` and `base` are measures ({lines, fns, boundaries});
 *  base is null for a new file; `pool` is basePool() over every base file of the PR. */
export function ratchetFindings(file, head, base, pool, L) {
  const on = (limit) => L[limit].mode !== 'off';
  return [
    ...(on('fileLines') ? fileLengthFindings(file, head, base, L) : []),
    ...(on('lineLength') ? lineLengthFindings(file, head, pool, L) : []),
    ...functionFindings(file, head, pool, L),
    ...(on('boundaries') ? boundaryFindings(file, head, pool) : []),
  ];
}

async function importFrom(dir, name) {
  return import(pathToFileURL(createRequire(path.join(dir, 'package.json')).resolve(name)).href);
}

/** ESLint ≥ 9 from the project, else the pinned release installed once per runner. */
async function loadEslint() {
  try {
    const mod = await importFrom(ROOT, 'eslint');
    if (Number(String(mod.ESLint?.version ?? '0').split('.')[0]) >= 9) return mod;
  } catch { /* not a project dependency */ }
  const dir = path.join(process.env.RUNNER_TEMP || os.tmpdir(), `keel-eslint-${ESLINT_PIN}`);
  try { return await importFrom(dir, 'eslint'); } catch { /* not installed yet */ }
  const args = ['install', '--no-save', '--no-audit', '--no-fund', '--silent', '--prefix', dir, `eslint@${ESLINT_PIN}`];
  execFileSync('npm', args, { stdio: ['ignore', 'ignore', 'inherit'] });
  return importFrom(dir, 'eslint');
}

async function tsParser() {
  for (const name of ['typescript-eslint', '@typescript-eslint/parser']) {
    try { const m = await importFrom(ROOT, name); return m.parser ?? m.default ?? m; } catch { /* try the next */ }
  }
  return null;
}

/** A linter that measures function length and complexity only: ESLint's built-in rules, no project config. */
async function functionLinter(L, files) {
  if (L.functionLines.mode === 'off' && L.complexity.mode === 'off') return null;
  if (!files.some((f) => JS_FILE.test(f) || TS_FILE.test(f))) return null;
  let ESLint;
  try { ({ ESLint } = await loadEslint()); } catch (e) {
    const why = e.message.split('\n')[0];
    console.log(`::notice::ESLint unavailable (${why}): function checks skipped, line checks run.`);
    return null;
  }
  const parser = files.some((f) => TS_FILE.test(f)) ? await tsParser() : null;
  if (!parser && files.some((f) => TS_FILE.test(f))) {
    console.log('::notice::No typescript-eslint parser in this project: TypeScript files get the line checks only.');
  }
  const rules = {
    'max-lines-per-function': ['warn', { max: L.functionLines.max, skipBlankLines: false, skipComments: false }],
    complexity: ['warn', { max: L.complexity.max }],
  };
  const config = [{ files: ['**/*.{js,mjs,cjs,jsx}'], rules,
    languageOptions: { ecmaVersion: 'latest', parserOptions: { ecmaFeatures: { jsx: true } } } }];
  if (parser) config.push({ files: ['**/*.{ts,tsx,mts,cts}'], rules, languageOptions: { parser } });
  const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: config, ignore: false });
  return async (file, text) => {
    if (!(JS_FILE.test(file) || (parser && TS_FILE.test(file)))) return null;
    const [r] = await eslint.lintText(text, { filePath: path.join(ROOT, file) });
    // A file that doesn't parse is the project's own lint job, not this check's.
    if (!r || r.messages.some((m) => m.fatal)) return null;
    return functionMetrics(r.messages, text.split('\n'));
  };
}

function readModules() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, '.keel/ci/modules.json'), 'utf8')).modules ?? []; }
  catch { return []; }
}

/** The limits in force: the lock's, or the defaults in a repo without a Keel lock (Keel itself). */
export function limitsInForce(argv = process.argv) {
  const hasLock = fs.existsSync(path.join(ROOT, '.keel/policy.lock.json'));
  const L = structuredClone(hasLock ? (lockPolicy().quality?.limits ?? normalizeLimits()) : normalizeLimits());
  const forced = argv.find((a) => a.startsWith('--mode='))?.slice(7);
  if (forced && !['fail', 'warn'].includes(forced)) fail(`--mode must be fail or warn, not "${forced}"`);
  if (forced) for (const k of LIMIT_NAMES) if (L[k].mode !== 'off') L[k].mode = forced;
  return L;
}

/** Changed and deleted files between the merge base and head, limited to the files the limits apply to. */
function changedFiles(git, mb, head, L) {
  const rows = git('diff', '--name-status', '-M', mb, head).split('\n').filter(Boolean).map((l) => l.split('\t'));
  const changed = []; const gone = [];
  for (const [status, a, b] of rows) {
    if (status.startsWith('D')) { if (limitedFile(a, L)) gone.push(a); continue; }
    const file = b ?? a;
    if (limitedFile(file, L)) changed.push({ file, from: status.startsWith('A') ? null : a });
  }
  return { changed, gone };
}

export async function main() {
  const L = limitsInForce();
  const { BASE_SHA: base, HEAD_SHA: head } = process.env;
  if (!base || !head) {
    console.log('::notice::Clean-code limits check pull requests (BASE_SHA/HEAD_SHA unset).');
    return;
  }
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const show = (sha, file) => { try { return git('show', `${sha}:${file}`); } catch { return null; } };
  const mb = git('merge-base', base, head).trim();
  const { changed, gone } = changedFiles(git, mb, head, L);
  const modules = readModules();
  const lint = await functionLinter(L, [...changed.map((c) => c.file), ...gone]);
  const measure = async (file, text) => ({
    lines: lineMetrics(text, L.lineLength.max),
    fns: lint ? await lint(file, text) : null,
    boundaries: modules.length ? boundaryViolations(file, text, modules) : [],
  });
  const heads = []; const bases = [];
  for (const c of changed) {
    const text = show(head, c.file);
    if (text === null || text.includes('\0')) continue;
    const old = c.from === null ? null : show(mb, c.from);
    const before = old === null ? null : await measure(c.from, old);
    heads.push({ file: c.file, m: await measure(c.file, text), base: before });
  }
  for (const f of gone) { const old = show(mb, f); if (old !== null) bases.push(await measure(f, old)); }
  const pool = basePool([...heads.map((h) => h.base).filter(Boolean), ...bases]);
  report(heads.flatMap((h) => ratchetFindings(h.file, h.m, h.base, pool, L).map((f) => ({ ...f, file: h.file }))),
    heads.length, L);
}

function report(findings, checked, L) {
  const shown = new Map();
  for (const f of findings) {
    const n = (shown.get(`${f.file} ${f.limit}`) ?? 0) + 1;
    shown.set(`${f.file} ${f.limit}`, n);
    if (n > MAX_NOTES) continue;
    const level = L[f.limit].mode === 'fail' ? 'error' : 'warning';
    console.log(`::${level} file=${f.file},line=${f.line},title=keel ${f.limit}::${f.message}`);
  }
  const failing = findings.filter((f) => L[f.limit].mode === 'fail').length;
  const summary = `Clean-code limits: ${checked} changed file(s), ${findings.length} finding(s), ${failing} failing.`;
  if (failing) {
    fail(`${summary} A changed file may not get worse than its base version. Split the file or extract the `
      + 'function; or the approver sets that limit to "warn" in keel.policy.json quality.limits.');
  }
  console.log(summary);
}
