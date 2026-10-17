// keel.policy.json — validation, defaults, and the lock the hooks read.
import fs from 'node:fs';
import path from 'node:path';
import { objectSha } from './hash.mjs';

export const POLICY_FILE = 'keel.policy.json';
export const LOCK_FILE = '.keel/policy.lock.json';
export const KEEL_VERSION = '3.0.0-alpha.2';

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

const TOP_KEYS = new Set(['$schema', 'version', 'approver', 'agentIdentity', 'github', 'defaultBranch', 'protectedBranches',
  'surfaces', 'governancePaths', 'environments', 'migrations', 'gates', 'backPressure', 'checks', 'budget', 'ci']);

export class PolicyError extends Error {}

const isStr = (v) => typeof v === 'string' && v.length > 0;
const strArr = (v) => Array.isArray(v) && v.every(isStr);

/** Validate a raw policy object and fill defaults. Throws PolicyError on any problem. */
export function normalizePolicy(raw) {
  const errs = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PolicyError('policy must be a JSON object');
  for (const k of Object.keys(raw)) if (!TOP_KEYS.has(k)) errs.push(`unknown key "${k}"`);
  if (raw.version !== 1) errs.push('"version" must be 1');
  if (!isStr(raw.approver?.github)) errs.push('"approver.github" is required (the human who approves HEAVY work)');
  if (!isStr(raw.agentIdentity?.github)) errs.push('"agentIdentity.github" is required (the agent\'s own GitHub identity)');
  if (isStr(raw.approver?.github) && raw.approver.github === raw.agentIdentity?.github) {
    errs.push('"agentIdentity" must differ from "approver": the agent cannot hold the approval stamp');
  }
  const surfaces = raw.surfaces ?? {};
  for (const [k, v] of Object.entries(surfaces)) if (!strArr(v)) errs.push(`surfaces.${k} must be an array of path globs`);

  const g = raw.gates ?? {};
  const oneOf = (val, allowed, name) => { if (val !== undefined && !allowed.includes(val)) errs.push(`${name} must be one of ${allowed.join(', ')}`); };
  oneOf(g.merge?.agent, ['auto-merge-only', 'deny', 'allow'], 'gates.merge.agent');
  oneOf(g.migration?.live, ['batch-authorized', 'deny', 'allow'], 'gates.migration.live');
  oneOf(g.migration?.liveSql, ['read-only', 'deny', 'allow'], 'gates.migration.liveSql');
  oneOf(g.deploy?.mode, ['approver', 'off'], 'gates.deploy.mode');
  for (const k of ['push', 'secrets', 'governance', 'ledger']) oneOf(g[k]?.mode, ['block', 'off'], `gates.${k}.mode`);
  if (g.ledger?.dir !== undefined && !/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(g.ledger.dir)) errs.push('gates.ledger.dir must be a relative directory like ".scratch"');
  if (g.deploy?.commands !== undefined && !strArr(g.deploy.commands)) errs.push('gates.deploy.commands must be an array of strings');
  if (raw.backPressure !== undefined && !strArr(raw.backPressure)) errs.push('backPressure must be an array of check names');
  for (const name of raw.backPressure ?? []) if (!isStr(raw.checks?.[name])) errs.push(`backPressure lists "${name}" but checks.${name} has no command`);
  if (raw.github !== undefined && !(isStr(raw.github?.owner) && isStr(raw.github?.repo))) errs.push('"github" must be {"owner": "...", "repo": "..."}');
  // Values below end up in generated YAML; keep them to safe characters.
  for (const b of raw.protectedBranches ?? []) if (!/^[A-Za-z0-9._/-]+$/.test(b)) errs.push(`protectedBranches: "${b}" has characters Keel won't put in a workflow file`);
  if (raw.defaultBranch !== undefined && !/^[A-Za-z0-9._/-]+$/.test(raw.defaultBranch)) errs.push('defaultBranch has unsupported characters');
  for (const n of raw.backPressure ?? []) if (!/^[A-Za-z0-9_-]+$/.test(n)) errs.push(`backPressure: "${n}" must be letters, digits, - or _`);
  if (raw.ci?.node !== undefined && !/^[0-9]+(\.[0-9x]+)*$/.test(String(raw.ci.node))) errs.push('ci.node must be a version like "20"');
  if (errs.length) throw new PolicyError(errs.join('\n'));

  const defaultBranch = raw.defaultBranch ?? 'main';
  const live = raw.environments?.live ?? {};
  const testEnv = raw.environments?.test ?? {};
  return {
    version: 1,
    approver: { github: raw.approver.github },
    agentIdentity: { github: raw.agentIdentity.github },
    github: raw.github ? { owner: raw.github.owner, repo: raw.github.repo } : null,
    defaultBranch,
    protectedBranches: raw.protectedBranches ?? [defaultBranch],
    surfaces,
    governancePaths: [...new Set([...DEFAULT_GOVERNANCE, ...(raw.governancePaths ?? [])])],
    environments: {
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
    },
    migrations: { dirs: raw.migrations?.dirs ?? ['supabase/migrations', 'prisma/migrations', 'migrations', 'db/migrations'] },
    gates: {
      push: { mode: g.push?.mode ?? 'block' },
      merge: { agent: g.merge?.agent ?? 'auto-merge-only' },
      migration: {
        live: g.migration?.live ?? 'batch-authorized',
        batchExpiryHours: g.migration?.batchExpiryHours ?? 48,
        requireTestFirst: g.migration?.requireTestFirst ?? true,
        liveSql: g.migration?.liveSql ?? 'read-only',
      },
      deploy: { mode: g.deploy?.mode ?? 'approver', commands: g.deploy?.commands ?? DEFAULT_DEPLOY },
      secrets: { mode: g.secrets?.mode ?? 'block' },
      governance: { mode: g.governance?.mode ?? 'block' },
      // Feature ledgers (.scratch/<feature>/00-status.md): gate boxes are human-only,
      // and no product code while a HEAVY feature waits at a gate.
      ledger: { mode: g.ledger?.mode ?? 'block', dir: g.ledger?.dir ?? '.scratch' },
    },
    backPressure: raw.backPressure ?? [],
    checks: raw.checks ?? {},
    budget: { alwaysOnTokens: raw.budget?.alwaysOnTokens ?? null, maxLineChars: raw.budget?.maxLineChars ?? 400 },
    ci: {
      node: String(raw.ci?.node ?? '20'),
      install: raw.ci?.install ?? null,
      postgres: Boolean(raw.ci?.postgres),
      phantom: raw.ci?.phantom ?? 'warn',
    },
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
  return { state: 'ok', policy: lock.policy, github: lock.github ?? lock.policy.github ?? null };
}
