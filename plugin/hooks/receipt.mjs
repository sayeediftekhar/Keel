#!/usr/bin/env node
// Keel PostToolUse receipt writer. After a migration command or tool call
// completes, append a receipt to .keel/receipts.jsonl so the gate can enforce
// batch order, test-before-live, and no double-apply. Never blocks.
//
// Receipts are local session state and a "fast layer" check: they catch
// mistakes (skipping test, applying twice, wrong order), not a determined
// forger. The GitHub-verified approval is what a live apply really hinges on.

import fs from 'node:fs';
import path from 'node:path';
import { loadLock } from '../lib/policy.mjs';
import { parseCommands } from '../lib/shell.mjs';
import { classifyMigrationCommand } from '../lib/gates.mjs';
import { contentSha } from '../lib/hash.mjs';
import { appendReceipt, fetchGithubRemote, localMigrationFiles, makeEnv, readReceipts, readStdin } from '../lib/runtime.mjs';

function failed(resp) {
  if (!resp || typeof resp !== 'object') return false;
  if (resp.isError === true || resp.is_error === true || resp.interrupted === true) return true;
  const code = resp.exitCode ?? resp.exit_code ?? resp.returnCode;
  return typeof code === 'number' && code !== 0;
}

try {
  const event = JSON.parse(readStdin() || '{}');
  const projectDir = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();
  const lock = loadLock(projectDir);
  if (lock.state !== 'ok' || failed(event.tool_response)) process.exit(0);
  const policy = lock.policy;
  const name = event.tool_name ?? '';
  const input = event.tool_input ?? {};

  if (/^mcp__.+__apply_migration$/.test(name)) {
    const pid = input.project_id ?? input.projectId ?? input.project_ref;
    const target = policy.environments.test.supabaseProjectIds.includes(pid) ? 'test' : 'live';
    appendReceipt(projectDir, { kind: 'migration', via: name, target, project: pid ?? null, name: input.name ?? null, sha256: contentSha(input.query ?? input.sql ?? '') });
  } else if (name === 'Bash') {
    const ctx = { policy, projectDir, env: makeEnv(projectDir, policy) };
    for (const cmd of parseCommands(String(input.command ?? ''))) {
      const m = classifyMigrationCommand(cmd, ctx);
      if (!m) continue;
      if (m.target === 'test') {
        // A test apply runs every migration file present; record each one.
        for (const rel of localMigrationFiles(projectDir, policy)) {
          appendReceipt(projectDir, { kind: 'migration', via: m.what, target: 'test', file: rel, sha256: contentSha(fs.readFileSync(path.join(projectDir, rel), 'utf8')) });
        }
      } else if (lock.github) {
        // A live apply runs everything pending in the approved batches.
        const { approvals } = await fetchGithubRemote(lock.github, policy.defaultBranch, policy);
        const done = new Set(readReceipts(projectDir).filter((r) => r.target === 'live').map((r) => r.sha256));
        for (const b of approvals) {
          for (const e of b.migrations ?? []) {
            if (!done.has(e.sha256)) appendReceipt(projectDir, { kind: 'migration', via: m.what, target: 'live', batch: b.batch, file: e.file, sha256: e.sha256 });
          }
        }
      }
    }
  }
} catch { /* receipts must never break the session */ }
process.exit(0);
