// Gate decision table — written before the implementation (M1-SPEC §8.1).
// Each case is a synthetic PreToolUse event plus a fake environment; the
// decision function is pure, so nothing here touches git, GitHub or a DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../lib/gates.mjs';
import { normalizePolicy } from '../lib/policy.mjs';
import { contentSha } from '../lib/hash.mjs';

const MIG1 = 'ALTER TABLE fees ADD COLUMN amount numeric(15,2);\n';
const MIG2 = 'CREATE INDEX fees_amount_idx ON fees(amount);\n';
const SHA1 = contentSha(MIG1);
const SHA2 = contentSha(MIG2);

const policy = normalizePolicy({
  version: 1,
  approver: { github: 'owner-human' },
  agentIdentity: { github: 'owner-keel[bot]' },
  surfaces: { value: ['lib/money/**'], schema: ['supabase/migrations/**'] },
  environments: {
    live: { markers: ['DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], supabaseProjectIds: ['liveproj'] },
    test: { supabaseProjectIds: ['testproj'] },
  },
  migrations: { dirs: ['supabase/migrations'] },
  gates: {
    merge: { agent: 'auto-merge-only' },
    migration: { live: 'batch-authorized', batchExpiryHours: 48 },
    deploy: { mode: 'approver', commands: ['vercel --prod', 'railway up'] },
  },
});

const NOW = Date.parse('2026-10-12T10:00:00Z');
const approvedBatch = {
  batch: 'b1', target: 'live', expires: '2026-10-13T00:00:00Z',
  migrations: [
    { file: 'supabase/migrations/0055_fee.sql', sha256: SHA1, order: 1 },
    { file: 'supabase/migrations/0056_idx.sql', sha256: SHA2, order: 2 },
  ],
};

function ctx(over = {}) {
  const env = {
    currentBranch: () => 'feature/x',
    approvals: () => [approvedBatch],
    sha: (rel) => ({ 'supabase/migrations/0055_fee.sql': SHA1, 'supabase/migrations/0056_idx.sql': SHA2 })[rel] ?? null,
    migrationTreeMatchesDefault: () => true,
    receipts: () => [
      { kind: 'migration', target: 'test', sha256: SHA1 },
      { kind: 'migration', target: 'test', sha256: SHA2 },
    ],
    pkgScripts: () => ({ 'db:deploy': 'prisma migrate deploy', build: 'next build' }),
    now: () => NOW,
    prismaUsesDirectUrl: () => false,
    ...over,
  };
  return { policy, projectDir: '/repo', env };
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command }, cwd: '/repo' });
const mcp = (name, input) => ({ tool_name: name, tool_input: input, cwd: '/repo' });

// [description, event, expected 'allow' | gate-name-that-blocks, ctx overrides]
const CASES = [
  // --- push ---------------------------------------------------------------
  ['push feature branch', bash('git push origin feature/x'), 'allow'],
  ['push -u feature branch', bash('git push -u origin feature/x'), 'allow'],
  ['push to main', bash('git push origin main'), 'push'],
  ['push HEAD:main', bash('git push origin HEAD:main'), 'push'],
  ['force push to main', bash('git push --force origin HEAD:main'), 'push'],
  ['plus refspec to main', bash('git push origin +feature/x:refs/heads/main'), 'push'],
  ['bare push while on main', bash('git push'), 'push', { currentBranch: () => 'main' }],
  ['bare push on feature', bash('git push'), 'allow'],
  ['push --all', bash('git push --all origin'), 'push'],
  ['delete main', bash('git push origin --delete main'), 'push'],
  ['push via -C dir on main', bash('git -C /repo push'), 'push', { currentBranch: () => 'main' }],
  ['chained push to main', bash('npm test && git push origin main'), 'push'],
  ['sh -c wrapped push', bash(`sh -c "git push origin main"`), 'push'],
  ['MCP push_files to main', mcp('mcp__github__push_files', { branch: 'main', files: [] }), 'push'],
  ['MCP push_files to feature', mcp('mcp__github__push_files', { branch: 'feature/x', files: [] }), 'allow'],
  ['MCP create_or_update_file no branch', mcp('mcp__github__create_or_update_file', { path: 'a' }), 'push'],
  // --- merge --------------------------------------------------------------
  ['gh pr merge immediate', bash('gh pr merge 12 --squash'), 'merge'],
  ['gh pr merge --auto', bash('gh pr merge 12 --auto --squash'), 'allow'],
  ['gh pr merge --auto --admin', bash('gh pr merge 12 --auto --admin'), 'merge'],
  ['absolute-path gh merge', bash('/usr/bin/gh pr merge 12'), 'merge'],
  ['subshell gh merge', bash('cd app && (gh pr merge 3)'), 'merge'],
  ['command substitution merge', bash('echo $(gh pr merge 3)'), 'merge'],
  ['gh api merge endpoint', bash('gh api -X PUT repos/o/r/pulls/3/merge'), 'merge'],
  ['MCP merge_pull_request', mcp('mcp__github__merge_pull_request', { pullNumber: 3 }), 'merge'],
  ['gh pr review --approve (self-approval)', bash('gh pr review 3 --approve'), 'merge'],
  ['gh api APPROVE review', bash('gh api -X POST repos/o/r/pulls/3/reviews -f event=APPROVE'), 'merge'],
  ['gh pr review --comment is fine', bash('gh pr review 3 --comment -b "note"'), 'allow'],
  ['plugin-bundled MCP merge', mcp('mcp__plugin_gh_github__merge_pull_request', { pullNumber: 3 }), 'merge'],
  // --- migration ----------------------------------------------------------
  ['MCP apply to test project',
    mcp('mcp__supabase__apply_migration', { project_id: 'testproj', name: 'x', query: 'select 1' }), 'allow'],
  ['MCP apply unapproved to live',
    mcp('mcp__supabase__apply_migration', { project_id: 'liveproj', name: 'x', query: 'DROP TABLE users;' }),
    'migration'],
  ['MCP apply approved #1 to live',
    mcp('mcp__supabase__apply_migration', { project_id: 'liveproj', name: 'fee', query: MIG1 }), 'allow'],
  ['MCP apply approved #2 before #1',
    mcp('mcp__supabase__apply_migration', { project_id: 'liveproj', name: 'idx', query: MIG2 }), 'migration'],
  ['MCP apply #2 after #1 receipted',
    mcp('mcp__supabase__apply_migration', { project_id: 'liveproj', name: 'idx', query: MIG2 }), 'allow',
    { receipts: () => [
      { kind: 'migration', target: 'test', sha256: SHA1 }, { kind: 'migration', target: 'test', sha256: SHA2 },
      { kind: 'migration', target: 'live', sha256: SHA1 }] }],
  ['MCP apply approved but expired',
    mcp('mcp__supabase__apply_migration', { project_id: 'liveproj', name: 'fee', query: MIG1 }), 'migration',
    { now: () => Date.parse('2026-10-20T00:00:00Z') }],
  ['MCP apply approved but not test-first',
    mcp('mcp__supabase__apply_migration', { project_id: 'liveproj', name: 'fee', query: MIG1 }), 'migration',
    { receipts: () => [] }],
  ['MCP apply to unknown project = live',
    mcp('mcp__supabase__apply_migration', { project_id: 'mystery', name: 'x', query: 'DROP TABLE t;' }), 'migration'],
  ['MCP read-only SQL on live',
    mcp('mcp__supabase__execute_sql', { project_id: 'liveproj', query: 'select count(*) from fees' }), 'allow'],
  ['MCP write SQL on live',
    mcp('mcp__supabase__execute_sql', { project_id: 'liveproj', query: 'update fees set amount = 0' }), 'migration'],
  ['MCP CTE write on live',
    mcp('mcp__supabase__execute_sql', {
      project_id: 'liveproj', query: 'with x as (delete from fees returning *) select * from x',
    }), 'migration'],
  ['supabase db push (linked = live), approved', bash('supabase db push'), 'allow'],
  ['supabase db push, no approvals', bash('supabase db push'), 'migration', { approvals: () => [] }],
  ['supabase db push, tree differs from main',
    bash('supabase db push'), 'migration', { migrationTreeMatchesDefault: () => false }],
  ['supabase db push --local', bash('supabase db push --local'), 'allow', { approvals: () => [] }],
  ['supabase db reset --linked', bash('supabase db reset --linked'), 'migration', { approvals: () => [] }],
  ['prisma deploy to test url',
    bash('DATABASE_URL=postgres://u:p@localhost:5432/app_test npx prisma migrate deploy'), 'allow',
    { approvals: () => [] }],
  ['prisma deploy, unknown target', bash('npx prisma migrate deploy'), 'migration', { approvals: () => [] }],
  ['npm script hiding prisma deploy', bash('npm run db:deploy'), 'migration', { approvals: () => [] }],
  ['psql -f against env url',
    bash('psql "$DATABASE_URL" -f supabase/migrations/0055_fee.sql'), 'migration', { approvals: () => [] }],
  // --- secrets ------------------------------------------------------------
  ['printenv marker', bash('printenv DATABASE_URL'), 'secrets'],
  ['printenv all', bash('printenv'), 'secrets'],
  ['echo marker', bash('echo "$DATABASE_URL"'), 'secrets'],
  ['node prints marker', bash(`node -e "console.log(process.env.DATABASE_URL)"`), 'secrets'],
  ['cat .env', bash('cat .env.local'), 'secrets'],
  ['cat .env.example is fine', bash('cat .env.example'), 'allow'],
  ['printenv HOME is fine', bash('printenv HOME'), 'allow'],
  ['Read .env', { tool_name: 'Read', tool_input: { file_path: '/repo/.env' }, cwd: '/repo' }, 'secrets'],
  ['Read source file', { tool_name: 'Read', tool_input: { file_path: '/repo/src/a.ts' }, cwd: '/repo' }, 'allow'],
  // --- governance (self-protection) ---------------------------------------
  ['Edit policy file',
    { tool_name: 'Edit', tool_input: { file_path: '/repo/keel.policy.json' }, cwd: '/repo' }, 'governance'],
  ['Write settings.json',
    { tool_name: 'Write', tool_input: { file_path: '/repo/.claude/settings.json' }, cwd: '/repo' }, 'governance'],
  ['Edit CODEOWNERS',
    { tool_name: 'Edit', tool_input: { file_path: '/repo/.github/CODEOWNERS' }, cwd: '/repo' }, 'governance'],
  ['Edit app code', { tool_name: 'Edit', tool_input: { file_path: '/repo/lib/money/fees.ts' }, cwd: '/repo' }, 'allow'],
  ['redirect into lock', bash('echo {} > .keel/policy.lock.json'), 'governance'],
  ['sed -i settings', bash(`sed -i 's/deny/allow/' .claude/settings.json`), 'governance'],
  ['rm the lock', bash('rm -f .keel/policy.lock.json'), 'governance'],
  ['write an approval on a branch is fine',
    { tool_name: 'Write', tool_input: { file_path: '/repo/.keel/approvals/b2.json' }, cwd: '/repo' }, 'allow'],
  ['cp a file into the project root is fine', bash('cp notes.txt .'), 'allow'],
  ['mv a file into the project root is fine', bash('mv build/out.txt ./'), 'allow'],
  ['cp a file into .github/ is fine', bash('cp dependabot.yml .github/'), 'allow'],
  ['cp over the policy file', bash('cp evil.json keel.policy.json'), 'governance'],
  ['cp a CODEOWNERS into .github/', bash('cp CODEOWNERS .github/'), 'governance'],
  ['mv the lock away', bash('mv .keel/policy.lock.json /tmp/'), 'governance'],
  ['recursive copy into the project root', bash('cp -r stash .'), 'governance'],
  ['rsync a tree into the project root', bash('rsync -a dist/ .'), 'governance'],
  // --- deploy -------------------------------------------------------------
  ['vercel --prod', bash('vercel --prod'), 'deploy'],
  ['vercel preview is fine', bash('vercel'), 'allow'],
  ['railway up', bash('railway up --detach'), 'deploy'],
  // --- harmless -----------------------------------------------------------
  ['ls', bash('ls -la'), 'allow'],
  ['tests', bash('npm test -- --runInBand'), 'allow'],
  ['git commit on branch', bash('git commit -m "feat: x"'), 'allow'],
];

for (const [desc, event, expected, over] of CASES) {
  test(desc, () => {
    const d = decide(event, ctx(over));
    if (expected === 'allow') {
      assert.equal(d.allow, true, `expected allow, got block by ${d.gate}: ${d.reason}`);
    } else {
      assert.equal(d.allow, false, `expected block by ${expected}, got allow`);
      assert.equal(d.gate, expected, `blocked by ${d.gate} (${d.reason}), expected ${expected}`);
      assert.ok(d.reason && d.reason.length > 10, 'block carries an actionable reason');
    }
  });
}

test('there are at least 30 cases (spec §8.1)', () => {
  assert.ok(CASES.length >= 30);
});

test('documented gap: a script calling the GitHub API is not caught by hooks', () => {
  // Hooks match command text. `node merge.js` hides the merge; the GitHub
  // ruleset (required CODEOWNER review) is the layer that stops it.
  const d = decide(bash('node scripts/merge.js 3'), ctx());
  assert.equal(d.allow, true);
});
