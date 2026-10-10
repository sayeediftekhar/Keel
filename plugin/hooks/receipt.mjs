#!/usr/bin/env node
// Keel PostToolUse receipt writer. After a migration command or tool call
// completes, append a receipt to .keel/receipts.jsonl so the gate can enforce
// batch order, test-before-live, and no double-apply. Never blocks.

import fs from 'node:fs';
import path from 'node:path';
import { loadLock } from '../lib/policy.mjs';
import { parseCommands } from '../lib/shell.mjs';
import { classifyMigrationCommand } from '../lib/gates.mjs';
import { contentSha } from '../lib/hash.mjs';
import { appendReceipt, projectRoot, readApprovals, readReceipts, readStdin } from '../lib/runtime.mjs';

try {
  const event = JSON.parse(readStdin() || '{}');
  const projectDir = projectRoot(event.cwd);
  const lock = loadLock(projectDir);
  if (lock.state !== 'ok') process.exit(0);
  const policy = lock.policy;
  const ctx = { policy };
  const name = event.tool_name ?? '';
  const input = event.tool_input ?? {};

  if (/^mcp__.+__apply_migration$/.test(name)) {
    const pid = input.project_id ?? input.projectId ?? input.project_ref;
    const target = policy.environments.test.supabaseProjectIds.includes(pid) ? 'test' : 'live';
    appendReceipt(projectDir, { kind: 'migration', via: name, target, project: pid ?? null, name: input.name ?? null, sha256: contentSha(input.query ?? input.sql ?? '') });
  } else if (name === 'Bash') {
    for (const cmd of parseCommands(String(input.command ?? ''))) {
      const m = classifyMigrationCommand(cmd, ctx);
      if (!m) continue;
      if (m.target === 'test') {
        // A test apply runs every migration file present; record each one.
        for (const dir of policy.migrations.dirs) {
          const abs = path.join(projectDir, dir);
          if (!fs.existsSync(abs)) continue;
          for (const f of walk(abs)) {
            appendReceipt(projectDir, { kind: 'migration', via: m.what, target: 'test', file: path.relative(projectDir, f), sha256: contentSha(fs.readFileSync(f, 'utf8')) });
          }
        }
      } else {
        // A live apply runs everything pending in the approved batches.
        const done = new Set(readReceipts(projectDir).filter((r) => r.target === 'live').map((r) => r.sha256));
        for (const b of readApprovals(projectDir, policy)) {
          for (const e of b.migrations ?? []) {
            if (!done.has(e.sha256)) appendReceipt(projectDir, { kind: 'migration', via: m.what, target: 'live', batch: b.batch, file: e.file, sha256: e.sha256 });
          }
        }
      }
    }
  }
} catch { /* receipts must never break the session */ }
process.exit(0);

function* walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p);
    else if (/\.sql$/i.test(ent.name)) yield p;
  }
}
