// keel-ci.mjs audit (D23): the package managers' audit JSON, the verdict over
// quality.audit.allow, the compiled step, the policy validation, and the real
// script run against a stub package manager.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditAdvisories, auditVerdict, AUDIT_COMMANDS } from '../ci/audit.mjs';
import { workflowYaml, qualityFloor } from '../lib/compile.mjs';
import { normalizePolicy } from '../lib/policy.mjs';
import { qualityFiles } from '../lib/quality.mjs';
import { BASE_POLICY, makeRepo, write } from './helpers.mjs';

// Shapes captured on 2026-10-18 from braces@3.0.2 + minimist@1.2.5 (trimmed to the fields read).
const BRACES_DOS = {
  source: 1240992, name: 'braces', title: 'braces vulnerable to stack-exhaustion denial of service',
  url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', severity: 'high', range: '<=3.0.3',
};
const NPM = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    braces: { name: 'braces', severity: 'high', via: [BRACES_DOS] },
    micromatch: { name: 'micromatch', severity: 'high', via: ['braces'] },
    minimist: {
      name: 'minimist', severity: 'critical',
      via: [{ source: 1097678, title: 'Prototype Pollution in minimist', severity: 'critical',
        url: 'https://github.com/advisories/GHSA-xvch-5gv4-984h' }],
    },
    'is-svg': {
      name: 'is-svg', severity: 'moderate',
      via: [{ source: 1, title: 'ReDoS', severity: 'moderate',
        url: 'https://github.com/advisories/GHSA-7r28-3m3f-r2pr' }],
    },
  },
  metadata: { vulnerabilities: { high: 1, critical: 1, moderate: 1, total: 3 } },
}, null, 2);
const LEGACY = (a) => ({
  id: a.source, github_advisory_id: /GHSA-[\w-]+/.exec(a.url)[0], severity: a.severity, title: a.title,
  module_name: a.name ?? 'minimist', url: a.url,
});
const MINIMIST = { source: 1097678, name: 'minimist', title: 'Prototype Pollution in minimist', severity: 'critical',
  url: 'https://github.com/advisories/GHSA-xvch-5gv4-984h' };
const PNPM = JSON.stringify({
  advisories: { 1240992: LEGACY(BRACES_DOS), 1097678: LEGACY(MINIMIST) }, metadata: {},
}); // Yarn 3 prints the same document
const YARN_CLASSIC = [
  { type: 'warning', data: 'package.json: No license field' },
  { type: 'auditAdvisory', data: { resolution: { path: 'braces' }, advisory: LEGACY(BRACES_DOS) } },
  { type: 'auditAdvisory', data: { resolution: { path: 'micromatch>braces' }, advisory: LEGACY(BRACES_DOS) } },
  { type: 'auditAdvisory', data: { resolution: { path: 'minimist' }, advisory: LEGACY(MINIMIST) } },
  { type: 'auditSummary', data: { vulnerabilities: { high: 1, critical: 1 } } },
].map((l) => JSON.stringify(l)).join('\n');
const YARN_BERRY = [
  { value: 'braces', children: { ID: 1240992, Issue: BRACES_DOS.title, URL: BRACES_DOS.url, Severity: 'high' } },
  { value: 'minimist', children: { ID: 1097678, Issue: MINIMIST.title, URL: MINIMIST.url, Severity: 'critical' } },
].map((l) => JSON.stringify(l)).join('\n');

const ids = (out) => auditAdvisories(out).map((a) => `${a.id} ${a.severity}`).sort();
const BOTH = ['GHSA-vfj7-8cjw-p6xm high', 'GHSA-xvch-5gv4-984h critical'];

test('audit JSON: npm, pnpm / Yarn 3, Yarn classic and Yarn 4 all give GHSA ids and severities', () => {
  assert.deepEqual(ids(NPM), [...BOTH, 'GHSA-7r28-3m3f-r2pr moderate'].sort());
  assert.deepEqual(ids(PNPM), BOTH);
  assert.deepEqual(ids(YARN_CLASSIC), BOTH);
  assert.deepEqual(ids(YARN_BERRY), BOTH);
  const braces = auditAdvisories(YARN_CLASSIC).find((a) => a.id === 'GHSA-vfj7-8cjw-p6xm');
  assert.deepEqual(braces.packages, ['braces'], 'one advisory reported twice is one entry');
  assert.deepEqual(auditAdvisories(''), [], 'Yarn 4 prints nothing on a clean tree');
  assert.deepEqual(auditAdvisories(JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} })), []);
});

test('audit JSON: an error report or output that is not JSON throws (the check fails closed)', () => {
  assert.throws(() => auditAdvisories(JSON.stringify({ error: { code: 'ENOLOCK', summary: 'needs a lockfile' } })),
    /needs a lockfile/);
  assert.throws(() => auditAdvisories(JSON.stringify({ error: { message: 'No pnpm-lock.yaml found' } })),
    /No pnpm-lock\.yaml/);
  assert.throws(() => auditAdvisories('➤ YN0001: RequestError: getaddrinfo ENOTFOUND'), /isn't JSON/);
});

test('audit commands include dev dependencies, whatever the project\'s .npmrc omits', () => {
  assert.ok(AUDIT_COMMANDS.npm.includes('--include=dev'));
  assert.deepEqual(AUDIT_COMMANDS['yarn-berry'].slice(1), ['npm', 'audit', '--all', '--recursive', '--json']);
});

const TODAY = '2026-10-18';
const entry = (id, reviewBy, reason = 'dev-only tooling, no fixed version') => ({ id, reason, reviewBy });

test('audit verdict: an advisory at the level fails unless allowed; below the level never fails', () => {
  const advisories = auditAdvisories(NPM);
  const v = auditVerdict(advisories, [], 'high', TODAY);
  assert.equal(v.failures.length, 2);
  assert.match(v.failures.join('\n'), /GHSA-vfj7-8cjw-p6xm \(high\) braces .*, via braces/);
  assert.equal(auditVerdict(advisories, [], 'critical', TODAY).failures.length, 1);
  assert.equal(auditVerdict(advisories, [], 'moderate', TODAY).failures.length, 3);
  const allowed = auditVerdict(advisories, [entry('ghsa-VFJ7-8cjw-p6xm', '2026-11-18')], 'high', TODAY);
  assert.equal(allowed.failures.length, 1, 'ids match case-insensitively');
  assert.match(allowed.allowed[0], /GHSA-vfj7-8cjw-p6xm allowed until 2026-11-18: dev-only tooling/);
  assert.deepEqual(allowed.stale, []);
});

test('audit verdict: an exception holds through its reviewBy day, fails after it, and warns once unused', () => {
  const advisories = auditAdvisories(PNPM);
  const allow = [entry('GHSA-vfj7-8cjw-p6xm', TODAY), entry('GHSA-xvch-5gv4-984h', '2026-12-31')];
  assert.deepEqual(auditVerdict(advisories, allow, 'high', TODAY).failures, []);
  const expired = auditVerdict(advisories, allow, 'high', '2026-10-19');
  assert.equal(expired.failures.length, 1);
  assert.match(expired.failures[0], /GHSA-vfj7-8cjw-p6xm .*expired on 2026-10-18\. Review it/);
  const fixed = auditVerdict(auditAdvisories(YARN_BERRY).filter((a) => a.severity === 'critical'), allow, 'high',
    TODAY);
  assert.deepEqual(fixed.failures, []);
  assert.deepEqual(fixed.stale, ['GHSA-vfj7-8cjw-p6xm is no longer reported at high or above: ' +
    'remove it from quality.audit.allow']);
});

test('audit verdict: an unknown severity counts as critical', () => {
  const odd = [{ id: 'GHSA-aaaa-bbbb-cccc', severity: 'constructor', title: 't', packages: ['p'] }];
  assert.equal(auditVerdict(odd, [], 'critical', TODAY).failures.length, 1);
});

// End to end: the real script in a compiled repo, with `npm` on PATH replaced by a stub printing a report.
const CI = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'ci', 'keel-ci.mjs');
function runAudit(allow, report, exit = 1) {
  const { dir, root } = makeRepo({ ...BASE_POLICY, quality: { audit: { allow } } });
  const bin = path.join(root, 'bin');
  write(bin, 'report.json', report);
  write(bin, 'npm', `#!/bin/sh\ncat "${path.join(bin, 'report.json')}"\nexit ${exit}\n`);
  fs.chmodSync(path.join(bin, 'npm'), 0o755);
  return spawnSync(process.execPath, [CI, 'audit', 'npm'],
    { cwd: dir, encoding: 'utf8', env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
}

test('e2e audit: the lock\'s exceptions apply; an expired one and an unlisted advisory fail', () => {
  let r = runAudit([entry('GHSA-vfj7-8cjw-p6xm', '2999-12-31'), entry('GHSA-xvch-5gv4-984h', '2999-12-31')], NPM);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /::notice::GHSA-vfj7-8cjw-p6xm allowed until 2999-12-31/);
  assert.match(r.stdout, /0 failing, 2 allowed \(high and above\)/);
  r = runAudit([entry('GHSA-vfj7-8cjw-p6xm', '2000-01-01')], NPM);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::GHSA-vfj7-8cjw-p6xm .*expired on 2000-01-01/);
  assert.match(r.stdout, /::error::GHSA-xvch-5gv4-984h \(critical\)/);
  r = runAudit([entry('GHSA-vfj7-8cjw-p6xm', '2999-12-31')], JSON.stringify({ vulnerabilities: {} }), 0);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /::warning::GHSA-vfj7-8cjw-p6xm is no longer reported/);
});

test('e2e audit: a failed audit run fails the check instead of passing as clean', () => {
  const r = runAudit([], 'npm ERR! network request failed', 1);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::npm audit .*exit 1.*isn't JSON/);
  const empty = runAudit([], '', 1);
  assert.equal(empty.status, 1);
  assert.match(empty.stdout, /exited 1 without reporting an advisory/);
});

function fixture(files = {}, quality) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'keel-audit-'));
  for (const [rel, content] of Object.entries(files)) write(dir, rel, content);
  return { dir, policy: normalizePolicy({ ...BASE_POLICY, ...(quality ? { quality } : {}) }) };
}

// ---------------------------------------------------- compile and policy ----
test('quality audit follows the lockfile: keel-ci.mjs runs that package manager\'s audit (D23)', () => {
  const cases = [
    [{ 'package.json': '{}', 'pnpm-lock.yaml': '' }, 'pnpm'],
    [{ 'package.json': '{}', 'yarn.lock': '', '.yarnrc.yml': '' }, 'yarn-berry'],
    [{ 'package.json': '{}', 'yarn.lock': '' }, 'yarn'],
    [{ 'package.json': '{}' }, 'npm'],
  ];
  for (const [files, pm] of cases) {
    const { dir, policy } = fixture(files, { audit: { level: 'critical' } });
    const y = workflowYaml(dir, policy);
    assert.match(y, new RegExp(String.raw`- name: quality \/ dependency audit \(${pm}, critical\+\)\n\s+run: \|\n` +
      String.raw`\s+node \.keel\/ci\/keel-ci\.mjs audit ${pm}\n`), pm);
    assert.ok(!/(npm|pnpm|yarn) audit --/.test(y), `${pm}: the level is applied by keel-ci.mjs, not the command`);
  }
  const { dir, policy } = fixture({ 'package.json': '{}', 'package-lock.json': '{}' });
  assert.equal(qualityFiles(dir, policy)['.keel/ci/audit.mjs'], fs.readFileSync(
    new URL('../ci/audit.mjs', import.meta.url), 'utf8',
  ), 'keel-ci.mjs audit imports its sibling audit.mjs');
});

const ALLOW = [
  { id: 'GHSA-vfj7-8cjw-p6xm', reason: 'dev-only lint tooling; no fixed version', reviewBy: '2026-11-18' },
];

test('quality audit allow: the exceptions go into the lock and the step name; a custom command or ' +
  'no package manager gets a note that they do not apply', () => {
  const { dir, policy } = fixture({ 'package.json': '{}', 'package-lock.json': '{}' }, { audit: { allow: ALLOW } });
  assert.deepEqual(policy.quality.audit.allow, ALLOW);
  const y = workflowYaml(dir, policy);
  assert.match(y, /- name: quality \/ dependency audit \(npm, high\+, 1 allowed\)\n\s+run: \|\n\s+node .+ audit npm\n/);
  assert.equal(qualityFloor(dir, policy).notes.filter((n) => /quality\.audit/.test(n)).length, 0);
  const custom = fixture({ 'package.json': '{}', 'package-lock.json': '{}' },
    { audit: { command: 'node scripts/audit-high.mjs', allow: ALLOW } });
  assert.match(
    workflowYaml(custom.dir, custom.policy), /dependency audit \(custom, high\+\)\n\s+run: \|\n\s+node scripts/,
  );
  assert.ok(qualityFloor(custom.dir, custom.policy).notes.some((n) => /allow.*command replaces it/.test(n)));
  const bare = fixture({ 'requirements.txt': 'flask\n' }, { audit: { allow: ALLOW } });
  assert.ok(qualityFloor(bare.dir, bare.policy).notes.some((n) => /allow.*none runs here/.test(n)));
});

test('quality audit allow: a policy without exceptions normalizes exactly as before D23 (no lock churn)', () => {
  const before = { mode: 'fail', level: 'high', command: null };
  assert.deepEqual(normalizePolicy(BASE_POLICY).quality.audit, before);
  assert.deepEqual(normalizePolicy({ ...BASE_POLICY, quality: { audit: { allow: [] } } }).quality.audit, before);
});

test('quality audit allow: policy validation refuses an entry without a GHSA id, a reason and a real date', () => {
  const bad = (quality, re) => assert.throws(() => normalizePolicy({ ...BASE_POLICY, quality }), re);
  bad({ audit: { allow: ALLOW[0] } }, /quality\.audit\.allow must be an array/);
  bad({ audit: { allow: [{ ...ALLOW[0], id: 'CVE-2024-4068' }] } }, /allow\[0\]\.id must be a GitHub advisory id/);
  bad({ audit: { allow: [{ ...ALLOW[0], reason: '  ' }] } }, /allow\[0\]\.reason must say why/);
  bad({ audit: { allow: [{ ...ALLOW[0], reviewBy: '2026-02-30' }] } }, /allow\[0\]\.reviewBy must be a date/);
  bad({ audit: { allow: [{ id: ALLOW[0].id, reason: 'x' }] } }, /allow\[0\]\.reviewBy must be a date/);
  bad({ audit: { allow: [{ ...ALLOW[0], approvedBy: 'me' }] } },
    /unknown key "quality\.audit\.allow\[0\]\.approvedBy"/);
  bad({ audit: { allow: [ALLOW[0], { ...ALLOW[0], id: 'ghsa-VFJ7-8cjw-p6xm' }] } }, /allow\[1\]\.id: .* listed twice/);
  bad({ audit: { allow: [null] } }, /allow\[0\] must be/);
});
