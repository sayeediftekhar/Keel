// Claude Code only updates an installed plugin when its version changes, so a
// release that forgets the bump never reaches anyone (found 2026-10-18: v3's
// D17–D22 sat unshipped behind an unchanged 3.0.0-alpha.2). The three places
// the version is written must agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEEL_VERSION } from '../lib/policy.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

test('plugin.json, package.json and KEEL_VERSION carry the same version', () => {
  assert.equal(json('.claude-plugin/plugin.json').version, KEEL_VERSION);
  assert.equal(json('package.json').version, KEEL_VERSION);
});
