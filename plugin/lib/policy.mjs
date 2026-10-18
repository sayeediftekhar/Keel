// keel.policy.json — validation, defaults, and the lock the hooks read.
import fs from 'node:fs';
import path from 'node:path';
import { objectSha } from './hash.mjs';
import { normalizeLimits, LIMIT_DEFAULTS } from '../ci/limits.mjs';

export const POLICY_FILE = 'keel.policy.json';
export const LOCK_FILE = '.keel/policy.lock.json';
export const KEEL_VERSION = '3.0.0-alpha.4';

const DEFAULT_GOVERNANCE = [
  'keel.policy.json',
  '.keel/policy.lock.json',
  '.keel/receipts.jsonl',
  '.keel/ci/**',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.github/CODEOWNERS',
  '.github/workflows/keel.yml',
  '~/.claude/settings.json',
  '~/.claude/settings.local.json',
  '~/.claude/keel/projects.json',
];

const DEFAULT_DEPLOY = [
  'vercel --prod', 'vercel deploy --prod', 'netlify deploy --prod',
  'railway up', 'fly deploy', 'flyctl deploy', 'supabase functions deploy',
];

const TOP_KEYS = new Set([
  '$schema', 'version', 'approver', 'agentIdentity', 'github', 'defaultBranch', 'protectedBranches', 'surfaces',
  'governancePaths', 'environments', 'migrations', 'gates', 'backPressure', 'checks', 'budget', 'ci', 'quality',
]);

// The quality floor's pinned tools (D17). A version bump is a Keel release, reviewed like code.
export const QUALITY_PINS = {
  gitleaks: { version: '8.30.1', sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb' },
  semgrep: '1.178.0',
  semgrepRules: 'a84ff9cc2453ca91d581380de4b8b3f272f6f4be', // semgrep/semgrep-rules, 2026-09-22
  dependencyCruiser: '18.4.0',
};
const MODES = ['fail', 'warn', 'off'];
const LEVELS = ['low', 'moderate', 'high', 'critical'];
const SAFE_TOKEN = /^[A-Za-z0-9._/-]+$/;

export class PolicyError extends Error {}

const isStr = (v) => typeof v === 'string' && v.length > 0;
const strArr = (v) => Array.isArray(v) && v.every(isStr);
const isPlain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
// GitHub logins are case-insensitive: "Owner" and "owner" are one account.
const sameLogin = (a, b) => isStr(a) && isStr(b) && a.toLowerCase() === b.toLowerCase();

/** Validate a raw policy object and fill defaults. Throws PolicyError on any problem. */
export function normalizePolicy(raw) {
  if (!isPlain(raw)) throw new PolicyError('policy must be a JSON object');
  const errs = policyErrors(raw);
  if (errs.length) throw new PolicyError(errs.join('\n'));

  const defaultBranch = raw.defaultBranch ?? 'main';
  return {
    version: 1,
    approver: { github: raw.approver.github },
    agentIdentity: { github: raw.agentIdentity.github },
    github: raw.github ? { owner: raw.github.owner, repo: raw.github.repo } : null,
    defaultBranch,
    protectedBranches: raw.protectedBranches ?? [defaultBranch],
    surfaces: raw.surfaces ?? {},
    governancePaths: [...new Set([...DEFAULT_GOVERNANCE, ...(raw.governancePaths ?? [])])],
    environments: normalizeEnvironments(raw.environments),
    migrations: {
      dirs: raw.migrations?.dirs ?? ['supabase/migrations', 'prisma/migrations', 'migrations', 'db/migrations'],
    },
    gates: normalizeGates(raw.gates ?? {}),
    backPressure: raw.backPressure ?? [],
    checks: raw.checks ?? {},
    budget: normalizeBudget(raw.budget ?? {}),
    ci: normalizeCi(raw.ci),
    quality: normalizeQuality(raw.quality ?? {}),
  };
}

/** Every problem with a raw policy object, in the order they are reported. */
function policyErrors(raw) {
  const errs = [];
  const oneOf = (val, allowed, name) => {
    if (val !== undefined && !allowed.includes(val)) errs.push(`${name} must be one of ${allowed.join(', ')}`);
  };
  identityErrors(raw, errs);
  gateErrors(raw.gates ?? {}, oneOf, errs);
  checkErrors(raw, errs);
  workflowValueErrors(raw, oneOf, errs);
  qualityErrors(raw.quality, oneOf, errs);
  return errs;
}

/** Top-level keys, version, the approver and agent identities, surfaces. */
function identityErrors(raw, errs) {
  for (const k of Object.keys(raw)) if (!TOP_KEYS.has(k)) errs.push(`unknown key "${k}"`);
  if (raw.version !== 1) errs.push('"version" must be 1');
  if (!isStr(raw.approver?.github)) errs.push('"approver.github" is required (the human who approves HEAVY work)');
  if (!isStr(raw.agentIdentity?.github)) {
    errs.push('"agentIdentity.github" is required (the agent\'s own GitHub identity)');
  }
  if (sameLogin(raw.approver?.github, raw.agentIdentity?.github)) {
    errs.push('"agentIdentity" must differ from "approver": the agent cannot hold the approval stamp');
  }
  for (const [k, v] of Object.entries(raw.surfaces ?? {})) {
    if (!strArr(v)) errs.push(`surfaces.${k} must be an array of path globs`);
  }
}

function gateErrors(g, oneOf, errs) {
  oneOf(g.merge?.agent, ['auto-merge-only', 'deny', 'allow'], 'gates.merge.agent');
  oneOf(g.migration?.live, ['batch-authorized', 'deny', 'allow'], 'gates.migration.live');
  oneOf(g.migration?.liveSql, ['read-only', 'deny', 'allow'], 'gates.migration.liveSql');
  oneOf(g.deploy?.mode, ['approver', 'off'], 'gates.deploy.mode');
  for (const k of ['push', 'secrets', 'governance', 'ledger']) oneOf(g[k]?.mode, ['block', 'off'], `gates.${k}.mode`);
  if (g.ledger?.dir !== undefined && !/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(g.ledger.dir)) {
    errs.push('gates.ledger.dir must be a relative directory like ".scratch"');
  }
  if (g.deploy?.commands !== undefined && !strArr(g.deploy.commands)) {
    errs.push('gates.deploy.commands must be an array of strings');
  }
}

/** backPressure names real checks; github names a repository. */
function checkErrors(raw, errs) {
  if (raw.backPressure !== undefined && !strArr(raw.backPressure)) {
    errs.push('backPressure must be an array of check names');
  }
  for (const name of raw.backPressure ?? []) {
    if (!isStr(raw.checks?.[name])) errs.push(`backPressure lists "${name}" but checks.${name} has no command`);
  }
  if (raw.github !== undefined && !(isStr(raw.github?.owner) && isStr(raw.github?.repo))) {
    errs.push('"github" must be {"owner": "...", "repo": "..."}');
  }
}

function normalizeEnvironments(environments) {
  const live = environments?.live ?? {};
  const testEnv = environments?.test ?? {};
  return {
    live: {
      markers: live.markers ?? ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      supabaseProjectIds: live.supabaseProjectIds ?? [],
      dbUrlPatterns: live.dbUrlPatterns ?? [],
    },
    test: {
      supabaseProjectIds: testEnv.supabaseProjectIds ?? [],
      dbNamePattern: testEnv.dbNamePattern ?? '(_test|_ci)$',
      hosts: testEnv.hosts ?? ['localhost', '127.0.0.1', '::1', '0.0.0.0', 'postgres', 'db'],
      guardFile: testEnv.guardFile ?? null,
    },
  };
}

function normalizeGates(g) {
  return {
    push: { mode: g.push?.mode ?? 'block' },
    merge: { agent: g.merge?.agent ?? 'auto-merge-only' },
    migration: normalizeMigrationGate(g.migration),
    deploy: normalizeDeployGate(g.deploy),
    secrets: { mode: g.secrets?.mode ?? 'block' },
    governance: { mode: g.governance?.mode ?? 'block' },
    // Feature ledgers (.scratch/<feature>/00-status.md): gate boxes are human-only,
    // and no product code while a HEAVY feature waits at a gate.
    ledger: { mode: g.ledger?.mode ?? 'block', dir: g.ledger?.dir ?? '.scratch' },
  };
}

function normalizeDeployGate(d) {
  return { mode: d?.mode ?? 'approver', commands: d?.commands ?? DEFAULT_DEPLOY };
}

function normalizeMigrationGate(m) {
  return {
    live: m?.live ?? 'batch-authorized',
    batchExpiryHours: m?.batchExpiryHours ?? 48,
    requireTestFirst: m?.requireTestFirst ?? true,
    liveSql: m?.liveSql ?? 'read-only',
  };
}

function normalizeCi(ci) {
  return {
    node: String(ci?.node ?? '20'),
    install: ci?.install ?? null,
    postgres: Boolean(ci?.postgres),
    phantom: ci?.phantom ?? 'warn',
  };
}

/** Values compiled into the workflow and the CI checks: safe characters, known modes. */
function workflowValueErrors(raw, oneOf, errs) {
  // These end up in generated YAML; keep them to safe characters.
  for (const b of raw.protectedBranches ?? []) {
    if (!/^[A-Za-z0-9._/-]+$/.test(b)) {
      errs.push(`protectedBranches: "${b}" has characters Keel won't put in a workflow file`);
    }
  }
  if (raw.defaultBranch !== undefined && !/^[A-Za-z0-9._/-]+$/.test(raw.defaultBranch)) {
    errs.push('defaultBranch has unsupported characters');
  }
  for (const n of raw.backPressure ?? []) {
    if (!/^[A-Za-z0-9_-]+$/.test(n)) errs.push(`backPressure: "${n}" must be letters, digits, - or _`);
  }
  if (raw.ci?.node !== undefined && !/^[0-9]+(\.[0-9x]+)*$/.test(String(raw.ci.node))) {
    errs.push('ci.node must be a version like "20"');
  }
  oneOf(raw.budget?.mode, ['warn', 'fail'], 'budget.mode');
}

function qualityErrors(q, oneOf, errs) {
  if (q === undefined) return;
  if (!q || typeof q !== 'object' || Array.isArray(q)) { errs.push('"quality" must be an object'); return; }
  qualityKeyErrors(q, oneOf, errs);
  oneOf(q.audit?.level, LEVELS, 'quality.audit.level');
  if (q.audit?.command != null && !isStr(q.audit.command)) errs.push('quality.audit.command must be a command string');
  allowErrors(q.audit?.allow, errs);
  secretsErrors(q.secrets, oneOf, errs);
  qualityPathErrors(q, errs);
  limitsErrors(q.limits, errs);
}

const QUALITY_KEYS = {
  audit: ['mode', 'level', 'command', 'allow'], secrets: ['mode', 'engine', 'allowPaths', 'gitleaks'],
  sast: ['mode', 'rules'], architecture: ['mode', 'config', 'paths'], threatModel: ['mode'],
};

/** Each quality.* section: a known name, an object, known fields, a known mode. */
function qualityKeyErrors(q, oneOf, errs) {
  const known = { ...QUALITY_KEYS, limits: [...Object.keys(LIMIT_DEFAULTS), ...Object.keys(LIMIT_FIELDS)] };
  for (const [k, v] of Object.entries(q)) {
    if (!Object.hasOwn(known, k)) { errs.push(`unknown key "quality.${k}"`); continue; }
    if (!v || typeof v !== 'object' || Array.isArray(v)) { errs.push(`quality.${k} must be an object`); continue; }
    for (const f of Object.keys(v)) if (!known[k].includes(f)) errs.push(`unknown key "quality.${k}.${f}"`);
    oneOf(v?.mode, MODES, `quality.${k}.mode`);
  }
}

// D23: a reviewed exception to the dependency audit. GHSA ids only: every npm-registry advisory
// has one and every package manager's audit JSON reports it.
const ALLOW_ID = /^GHSA(-[a-z0-9]{4}){3}$/i;
const ALLOW_FIELDS = ['id', 'reason', 'reviewBy'];
// A calendar date: "2026-02-30" parses, but rolls over to March.
const realDate = (d) => typeof d === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d)
  && !Number.isNaN(Date.parse(d)) && new Date(Date.parse(d)).toISOString().startsWith(d);

function allowErrors(allow, errs) {
  if (allow === undefined) return;
  if (!Array.isArray(allow)) { errs.push('quality.audit.allow must be an array of {id, reason, reviewBy}'); return; }
  const seen = new Set();
  allow.forEach((e, i) => allowEntryErrors(e, `quality.audit.allow[${i}]`, seen, errs));
}

function allowEntryErrors(e, at, seen, errs) {
  if (!isPlain(e)) { errs.push(`${at} must be {"id", "reason", "reviewBy"}`); return; }
  for (const k of Object.keys(e)) if (!ALLOW_FIELDS.includes(k)) errs.push(`unknown key "${at}.${k}"`);
  if (!ALLOW_ID.test(e.id ?? '')) errs.push(`${at}.id must be a GitHub advisory id like "GHSA-vfj7-8cjw-p6xm"`);
  else if (seen.has(e.id.toLowerCase())) errs.push(`${at}.id: ${e.id} is listed twice`);
  else seen.add(e.id.toLowerCase());
  if (!(typeof e.reason === 'string' && e.reason.trim())) {
    errs.push(`${at}.reason must say why the advisory doesn't apply or can't be fixed yet`);
  }
  if (!realDate(e.reviewBy)) errs.push(`${at}.reviewBy must be a date, YYYY-MM-DD`);
}

function secretsErrors(s, oneOf, errs) {
  oneOf(s?.engine, ['builtin', 'gitleaks'], 'quality.secrets.engine');
  if (s?.allowPaths !== undefined && !strArr(s.allowPaths)) {
    errs.push('quality.secrets.allowPaths must be an array of path globs');
  }
  const gl = s?.gitleaks;
  // A different gitleaks version is only trusted with its own checksum.
  if (gl !== undefined && !(
    /^[0-9]+\.[0-9]+\.[0-9]+$/.test(gl?.version ?? '') && /^[0-9a-f]{64}$/.test(gl?.sha256 ?? '')
  )) {
    errs.push(
      'quality.secrets.gitleaks must be {"version": "X.Y.Z", "sha256": "<64 hex of gitleaks_X.Y.Z_linux_x64.tar.gz>"}',
    );
  }
}

const relativePath = (p) => isStr(p) && SAFE_TOKEN.test(p) && !p.split('/').includes('..');

/** SAST rule paths, architecture paths and config: relative paths of safe characters. */
function qualityPathErrors(q, errs) {
  for (const [name, list] of [
    ['quality.sast.rules', q.sast?.rules], ['quality.architecture.paths', q.architecture?.paths],
  ]) {
    if (list != null && !(strArr(list) && list.every(relativePath))) {
      errs.push(`${name} must be an array of relative paths (letters, digits, . _ / -)`);
    }
  }
  const cfg = q.architecture?.config;
  if (cfg != null && !relativePath(cfg)) {
    errs.push('quality.architecture.config must be a relative path');
  }
}

// D20e. A formatter runs from a hook as argv (no shell): keep it to plain words, paths and flags.
const FORMATTER = /^[A-Za-z0-9._/@:=+ -]+$/;
const LIMIT_FIELDS = {
  mode: (v) => MODES.includes(v),
  exclude: strArr,
  formatter: (v) => v === null || v === false || (isStr(v) && FORMATTER.test(v)),
  boundaries: (v) => isPlain(v) && Object.keys(v).every((f) => f === 'mode') && [undefined, ...MODES].includes(v.mode),
};
const capOk = (v) => {
  const o = typeof v === 'number' ? { max: v } : v;
  return isPlain(o) && Object.keys(o).every((f) => f === 'max' || f === 'mode')
    && (o.max === undefined || (Number.isInteger(o.max) && o.max > 0)) && [undefined, ...MODES].includes(o.mode);
};

function limitsErrors(l, errs) {
  if (!isPlain(l)) return; // qualityErrors already reported a non-object
  for (const [k, v] of Object.entries(l)) {
    const cap = Object.hasOwn(LIMIT_DEFAULTS, k) ? capOk : () => true;
    const ok = Object.hasOwn(LIMIT_FIELDS, k) ? LIMIT_FIELDS[k] : cap;
    if (!ok(v)) errs.push(`quality.limits.${k} is invalid: see the "limits" section of the policy schema`);
  }
}

function normalizeBudget(b) {
  return {
    // D20b: a real default; overage warns unless the project set its own number (then it fails, as before).
    alwaysOnTokens: b.alwaysOnTokens ?? 2000,
    maxLineChars: b.maxLineChars ?? 400,
    mode: b.mode ?? (b.alwaysOnTokens == null ? 'warn' : 'fail'),
  };
}

function normalizeQuality(q) {
  return {
    audit: {
      mode: q.audit?.mode ?? 'fail',
      level: q.audit?.level ?? 'high',
      command: q.audit?.command ?? null,
      // Only when set, so a policy without exceptions keeps the lock it had before D23.
      ...(q.audit?.allow?.length
        ? { allow: q.audit.allow.map(({ id, reason, reviewBy }) => ({ id, reason, reviewBy })) } : {}),
    },
    secrets: normalizeSecretsFloor(q.secrets),
    sast: { mode: q.sast?.mode ?? 'off', rules: q.sast?.rules ?? null },
    architecture: normalizeArchitecture(q.architecture),
    threatModel: { mode: q.threatModel?.mode ?? 'warn' },
    limits: normalizeLimits(q.limits),
  };
}

function normalizeSecretsFloor(s) {
  return {
    mode: s?.mode ?? 'fail',
    engine: s?.engine ?? 'builtin',
    allowPaths: s?.allowPaths ?? [],
    gitleaks: {
      ...(s?.gitleaks
        ? { version: s.gitleaks.version, sha256: s.gitleaks.sha256 }
        : QUALITY_PINS.gitleaks),
    },
  };
}

function normalizeArchitecture(a) {
  return {
    mode: a?.mode ?? 'fail',
    config: a?.config ?? null,
    paths: a?.paths ?? null,
  };
}

/** The strictest policy, used when a project's policy or lock is unreadable (fail closed). */
export function strictFallbackPolicy() {
  return normalizePolicy({ version: 1, approver: { github: '?approver' }, agentIdentity: { github: '?agent' },
    gates: { merge: { agent: 'deny' }, migration: { live: 'deny', liveSql: 'deny' } } });
}

export function readPolicyFile(projectDir) {
  const file = path.join(projectDir, POLICY_FILE);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new PolicyError(`cannot read ${POLICY_FILE}: ${e.message}`); }
  return normalizePolicy(raw);
}

export function buildLock(policy) {
  return { keelVersion: KEEL_VERSION, policySha256: objectSha(policy), policy };
}

/** Load the lock and confirm it is internally consistent and matches keel.policy.json.
 *  Returns {state:'inactive'} when the project doesn't use Keel, {state:'ok', policy}
 *  or {state:'broken', reason}. */
export function loadLock(projectDir) {
  const hasPolicy = fs.existsSync(path.join(projectDir, POLICY_FILE));
  const lockPath = path.join(projectDir, LOCK_FILE);
  const hasLock = fs.existsSync(lockPath);
  if (!hasPolicy && !hasLock) return { state: 'inactive' };
  if (!hasLock) return { state: 'broken', reason: `${LOCK_FILE} is missing — run \`keel compile\`` };
  let lock;
  try { lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')); }
  catch (e) { return { state: 'broken', reason: `${LOCK_FILE} is unreadable: ${e.message}` }; }
  if (!lock?.policy || objectSha(lock.policy) !== lock.policySha256) {
    return { state: 'broken', reason: `${LOCK_FILE} fails its integrity check — run \`keel compile\`` };
  }
  if (hasPolicy) {
    let current;
    try { current = readPolicyFile(projectDir); } catch (e) { return { state: 'broken', reason: e.message }; }
    if (objectSha(current) !== lock.policySha256) {
      return { state: 'broken', reason: `${POLICY_FILE} changed since the lock was built — run \`keel compile\`` };
    }
  }
  return {
    state: 'ok', policy: lock.policy, github: lock.github ?? lock.policy.github ?? null,
    formatter: lock.formatter ?? null,
  };
}
