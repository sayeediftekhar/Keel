#!/usr/bin/env node
// Keel PostToolUse format hook (D20e, rule c). After the agent writes a file,
// the project's formatter (from the lock: quality.limits.formatter, or the one
// `keel compile` detected) formats it, so no CI check ever fails on formatting.
// Never blocks: a missing formatter or a formatter error changes nothing.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadLock } from '../lib/policy.mjs';
import { formatCommand } from '../lib/format.mjs';
import { readStdin } from '../lib/runtime.mjs';

try {
  const event = JSON.parse(readStdin() || '{}');
  const projectDir = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();
  const lock = loadLock(projectDir);
  const cmd = lock.state === 'ok' ? formatCommand(event, projectDir, lock.formatter) : null;
  if (cmd && (!cmd.file.includes('/') || fs.existsSync(cmd.file))) {
    execFileSync(cmd.file, cmd.args, { cwd: cmd.cwd, stdio: 'ignore', timeout: 20000 });
  }
} catch { /* formatting is a convenience: never block, never fail the tool call */ }
process.exit(0);
