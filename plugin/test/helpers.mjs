// Test fixtures: throwaway git repos with a bare "origin", so the hooks and the
// doctor run against real git state without touching anything outside /tmp.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { compile } from '../lib/compile.mjs';

export const sh = (cwd, cmd, args) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const git = (cwd, ...a) => sh(cwd, 'git', a);

export const BASE_POLICY = {
  version: 1,
  approver: { github: 'owner-human' },
  agentIdentity: { github: 'owner-agent' },
  surfaces: { value: ['lib/money/**'], schema: ['supabase/migrations/**'] },
  environments: {
    live: { markers: ['DATABASE_URL'], supabaseProjectIds: ['liveproj'] },
    test: { supabaseProjectIds: ['testproj'], guardFile: 'test/setup.js' },
  },
  migrations: { dirs: ['supabase/migrations'] },
  backPressure: ['unit'],
  checks: { unit: 'npm test' },
};

/** Create a repo whose main (and origin/main) carry a compiled Keel policy.
 *  Leaves the working copy on branch feature/x. */
export function makeRepo(policy = BASE_POLICY, { extraFiles = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-test-'));
  const origin = path.join(root, 'origin.git');
  const dir = path.join(root, 'work');
  fs.mkdirSync(dir);
  git(root, 'init', '--bare', '-q', '-b', 'main', origin);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'remote', 'add', 'origin', origin);
  write(dir, 'keel.policy.json', `${JSON.stringify(policy, null, 2)}\n`);
  write(dir, 'package.json', JSON.stringify({ name: 'fixture', scripts: { test: 'node -e 0', 'db:deploy': 'prisma migrate deploy' } }));
  write(dir, 'test/setup.js', '// keel-test-db-guard\n');
  for (const [rel, content] of Object.entries(extraFiles)) write(dir, rel, content);
  compile(dir, { write: true });
  commitAll(dir, 'init');
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'checkout', '-q', '-b', 'feature/x');
  return { root, dir, origin };
}

export function write(dir, rel, content) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

export function commitAll(dir, msg) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', msg);
}

/** Merge the current branch into main on origin (what the approver's PR merge does). */
export function mergeToOriginMain(dir) {
  const branch = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', `merge ${branch}`, branch);
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'fetch', '-q', 'origin');
  git(dir, 'checkout', '-q', branch);
}

export { git };
