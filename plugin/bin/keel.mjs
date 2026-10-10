#!/usr/bin/env node
// keel — compile a project's governance policy, and prove it holds.
//
//   keel init                         write a starter keel.policy.json
//   keel compile [--dry-run]          policy → lock, deny rules, CODEOWNERS, CI, ruleset
//   keel doctor [--offline] [--json] [--allow-unproven]
//   keel batch create <id> <migration files…> [--hours N]
//   keel batch status
//   keel guard-snippet                test-database guard for your test setup file
//
// Options: --dir <project>  (default: git root of the current directory)

import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../lib/compile.mjs';
import { doctor, exitCode, formatReport } from '../lib/doctor.mjs';
import { readPolicyFile, PolicyError, POLICY_FILE } from '../lib/policy.mjs';
import { contentSha } from '../lib/hash.mjs';
import { projectRoot, readApprovals, readReceipts, defaultRef } from '../lib/runtime.mjs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const opt = (name) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };

const dirOpt = opt('--dir');
const projectDir = path.resolve(dirOpt ?? projectRoot(process.cwd()));
const [cmd, sub, ...rest] = args;

function die(msg, code = 1) { console.error(msg); process.exit(code); }

try {
  switch (cmd) {
    case 'init': {
      const file = path.join(projectDir, POLICY_FILE);
      if (fs.existsSync(file)) die(`${POLICY_FILE} already exists.`);
      const starter = {
        $schema: 'https://raw.githubusercontent.com/sayeediftekhar/Keel/main/plugin/schema/keel.policy.schema.json',
        version: 1,
        approver: { github: 'YOUR-GITHUB-HANDLE' },
        agentIdentity: { github: 'your-keel-app[bot]' },
        surfaces: {
          value: ['lib/money/**'], scope: [], pii: [], access: ['lib/auth/**', 'middleware.ts'],
          schema: ['supabase/migrations/**', 'prisma/migrations/**'], secrets: ['.env*'],
        },
        environments: { live: { markers: ['DATABASE_URL'], supabaseProjectIds: [] }, test: { supabaseProjectIds: [], guardFile: null } },
        backPressure: ['typecheck', 'unit', 'build'],
        checks: { typecheck: 'npx tsc --noEmit', unit: 'npm test', build: 'npm run build' },
      };
      fs.writeFileSync(file, `${JSON.stringify(starter, null, 2)}\n`);
      console.log(`Wrote ${POLICY_FILE}. Edit the approver, agent identity, danger paths and checks, then run \`keel compile\`.`);
      break;
    }
    case 'compile': {
      const dry = flag('--dry-run');
      const { files, notes } = compile(projectDir, { write: !dry });
      console.log(`${dry ? 'Would write' : 'Wrote'}:\n${Object.keys(files).map((f) => `  ${f}`).join('\n')}`);
      if (notes.length) console.log(`\nNotes:\n${notes.map((n) => `  - ${n}`).join('\n')}`);
      if (!dry) console.log('\nNext: commit these files in a PR, apply the ruleset, then run `keel doctor`.');
      break;
    }
    case 'doctor': {
      const json = flag('--json');
      const offline = flag('--offline');
      const allowUnproven = flag('--allow-unproven');
      const items = doctor(projectDir, { offline });
      console.log(json ? JSON.stringify(items, null, 2) : formatReport(items));
      process.exit(exitCode(items, { allowUnproven }));
      break;
    }
    case 'batch': {
      const policy = readPolicyFile(projectDir);
      if (sub === 'create') {
        const hours = Number(opt('--hours') ?? policy.gates.migration.batchExpiryHours);
        const [id, ...files] = rest.filter((a) => a !== undefined);
        if (!id || !/^[\w.-]+$/.test(id) || !files.length) die('usage: keel batch create <id> <migration files…> [--hours N]', 2);
        const out = path.join(projectDir, '.keel/approvals', `${id}.json`);
        if (fs.existsSync(out)) die(`batch ${id} already exists; pick a new id.`);
        const migrations = files.map((f, i) => {
          const rel = path.relative(projectDir, path.resolve(process.cwd(), f)).split(path.sep).join('/');
          const abs = path.join(projectDir, rel);
          if (!fs.existsSync(abs)) die(`${rel} not found`);
          return { file: rel, sha256: contentSha(fs.readFileSync(abs, 'utf8')), order: i + 1 };
        });
        const batch = { batch: id, target: 'live', expires: new Date(Date.now() + hours * 3600e3).toISOString(), migrations };
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, `${JSON.stringify(batch, null, 2)}\n`);
        console.log(`Wrote .keel/approvals/${id}.json (${migrations.length} migration(s), expires ${batch.expires}).`);
        console.log('Commit it with the migrations and open a PR. When the approver merges it, the batch is approved; editing any listed file afterwards voids it.');
      } else if (sub === 'status') {
        const receipts = readReceipts(projectDir);
        const applied = (t, sha) => receipts.some((r) => r.target === t && r.sha256 === sha);
        const batches = readApprovals(projectDir, policy);
        console.log(`Approved batches on ${defaultRef(projectDir, policy)}: ${batches.length || 'none'}`);
        for (const b of batches) {
          const expired = Date.parse(b.expires) <= Date.now();
          console.log(`\n${b.batch}  target=${b.target}  expires=${b.expires}${expired ? '  (EXPIRED)' : ''}`);
          for (const m of b.migrations ?? []) console.log(`  ${m.order}. ${m.file}  test:${applied('test', m.sha256) ? 'yes' : 'no'}  live:${applied('live', m.sha256) ? 'yes' : 'no'}`);
        }
      } else die('usage: keel batch create|status', 2);
      break;
    }
    case 'guard-snippet': {
      console.log(`// keel-test-db-guard — refuse to run tests against anything but a test database.
// Put this at the top of your test setup file and set environments.test.guardFile to its path.
const url = process.env.DATABASE_URL ?? '';
let db = '', host = '';
try { const u = new URL(url); db = u.pathname.slice(1); host = u.hostname; } catch {}
if (url && !/(_test|_ci)$/.test(db) && !['localhost', '127.0.0.1', '::1', 'postgres', 'db'].includes(host)) {
  throw new Error(\`keel-test-db-guard: refusing to run tests against \${host || 'an unknown host'}/\${db || '?'}\`);
}`);
      break;
    }
    default:
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
      process.exit(cmd ? 2 : 0);
  }
} catch (e) {
  if (e instanceof PolicyError) die(`keel.policy.json problem:\n${e.message}`);
  throw e;
}
