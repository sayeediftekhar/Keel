// Dependency audit with reviewed exceptions (D17a, D23). Copied next to
// keel-ci.mjs as .keel/ci/audit.mjs by `keel compile`; Node built-ins and
// keel-ci.mjs only.
//
//   node .keel/ci/keel-ci.mjs audit npm|pnpm|yarn|yarn-berry
//
// Runs the package manager's audit as JSON, dev dependencies included, and
// fails on any advisory at quality.audit.level or above unless
// quality.audit.allow lists its GHSA id with a reason and a reviewBy date that
// hasn't passed. An expired entry fails; an entry no longer reported warns.
// The exceptions live in keel.policy.json, a governance file, so only the
// approver adds or renews one.

import { spawnSync } from 'node:child_process';
import { lockPolicy, fail } from './keel-ci.mjs';

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const GHSA = /GHSA(?:-[a-z0-9]{4}){3}/i;

// Each package manager's audit as JSON. npm's --include flags beat an `omit=dev` in the
// project's .npmrc, which would otherwise drop dev dependencies from the report.
export const AUDIT_COMMANDS = {
  npm: ['npm', 'audit', '--json', '--include=dev', '--include=optional', '--include=peer'],
  pnpm: ['pnpm', 'audit', '--json'],
  yarn: ['yarn', 'audit', '--json'],
  'yarn-berry': ['yarn', 'npm', 'audit', '--all', '--recursive', '--json'],
};

const advisory = ({ ghsa, url, id, severity, title, pkg }) => ({
  id: (ghsa ?? GHSA.exec(String(url ?? ''))?.[0] ?? String(url ?? id ?? '?')).replace(/^ghsa/i, 'GHSA'),
  severity: String(severity ?? 'unknown').toLowerCase(),
  title: String(title ?? ''),
  packages: pkg ? [String(pkg)] : [],
});

// npm 7+ (auditReportVersion 2): advisories sit in each vulnerable package's `via`.
function fromNpm(report) {
  return Object.entries(report.vulnerabilities ?? {}).flatMap(([pkg, v]) => (v.via ?? [])
    .filter((via) => via && typeof via === 'object')
    .map((via) => advisory({ url: via.url, id: via.source, severity: via.severity, title: via.title, pkg })));
}

// npm 6 format: pnpm, Yarn 3, and each line of Yarn classic's `auditAdvisory` stream.
const fromLegacy = (a) => advisory({
  ghsa: a.github_advisory_id, url: a.url, id: a.id, severity: a.severity, title: a.title, pkg: a.module_name,
});

// Yarn 4: one line per finding, {value: package, children: {ID, URL, Severity, Issue}}.
const fromBerry = (line) => advisory({
  url: line.children.URL, id: line.children.ID, severity: line.children.Severity, title: line.children.Issue,
  pkg: line.value,
});

function fromReport(report) {
  if (report.error) {
    throw new Error(`the audit failed: ${report.error.summary ?? report.error.message ?? report.error.code}`);
  }
  if (report.vulnerabilities) return fromNpm(report);
  if (report.advisories) return Object.values(report.advisories).map(fromLegacy);
  if (report.type === 'auditAdvisory') return [fromLegacy(report.data.advisory)];
  if (report.children?.ID !== undefined) return [fromBerry(report)];
  return []; // summaries, warnings, info lines
}

/** Pure: an audit's JSON output (one document, or one per line) → advisories, one per id,
 *  with every package that pulls it in. Throws when the output isn't the JSON it should be. */
export function auditAdvisories(stdout) {
  const text = String(stdout ?? '').trim();
  let reports;
  try { reports = [JSON.parse(text)]; } catch {
    reports = text.split('\n').filter((l) => l.trim()).map((l) => {
      try { return JSON.parse(l); } catch { throw new Error(`the audit printed something that isn't JSON: ${l}`); }
    });
  }
  const byId = new Map();
  for (const a of reports.flatMap(fromReport)) {
    const seen = byId.get(a.id);
    if (!seen) byId.set(a.id, a);
    else for (const p of a.packages) if (!seen.packages.includes(p)) seen.packages.push(p);
  }
  return [...byId.values()];
}

/** Pure: which advisories fail, which an exception allows, which exceptions are stale.
 *  An exception is good through its reviewBy day (UTC); `today` is YYYY-MM-DD. */
export function auditVerdict(advisories, allow, level, today) {
  // A severity the audit names but Keel doesn't know counts as critical (fail closed).
  const rank = (s) => (Object.hasOwn(SEVERITY_RANK, s) ? SEVERITY_RANK[s] : SEVERITY_RANK.critical);
  const atLevel = advisories.filter((a) => rank(a.severity) >= rank(level));
  const byId = new Map(allow.map((e) => [e.id.toLowerCase(), e]));
  const failures = []; const allowed = [];
  for (const a of atLevel) {
    const e = byId.get(a.id.toLowerCase());
    const what = `${a.id} (${a.severity}) ${a.title}, via ${a.packages.join(', ') || '?'}`;
    if (!e) failures.push(what);
    else if (e.reviewBy < today) {
      failures.push(`${what}: its exception expired on ${e.reviewBy}. Review it: upgrade, or renew ` +
        'quality.audit.allow with a new reviewBy and the reason it still holds');
    } else allowed.push(`${a.id} allowed until ${e.reviewBy}: ${e.reason}`);
  }
  const reported = new Set(atLevel.map((a) => a.id.toLowerCase()));
  const stale = allow.filter((e) => !reported.has(e.id.toLowerCase()))
    .map((e) => `${e.id} is no longer reported at ${level} or above: remove it from quality.audit.allow`);
  return { failures, allowed, stale };
}

export function main(pm) {
  const cmd = Object.hasOwn(AUDIT_COMMANDS, pm ?? '') ? AUDIT_COMMANDS[pm] : null;
  if (!cmd) fail(`audit: unknown package manager "${pm}" (npm, pnpm, yarn, yarn-berry)`);
  const audit = lockPolicy().quality?.audit ?? {};
  const level = audit.level ?? 'high';
  const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) fail(`audit: could not run ${cmd.join(' ')}: ${r.error.message}`);
  let advisories;
  try { advisories = auditAdvisories(r.stdout); } catch (e) {
    fail(`${cmd.join(' ')} (exit ${r.status}): ${e.message}\n${(r.stderr ?? '').trim()}`);
  }
  if (!advisories.length && r.status !== 0) {
    fail(`${cmd.join(' ')} exited ${r.status} without reporting an advisory:\n${(r.stderr ?? '').trim()}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const { failures, allowed, stale } = auditVerdict(advisories, audit.allow ?? [], level, today);
  for (const a of allowed) console.log(`::notice::${a}`);
  for (const s of stale) console.log(`::warning::${s}`);
  for (const f of failures) console.log(`::error::${f}`);
  console.log(`Dependency audit (${cmd.join(' ')}): ${failures.length} failing, ${allowed.length} allowed ` +
    `(${level} and above).`);
  if (failures.length) process.exit(1);
}
