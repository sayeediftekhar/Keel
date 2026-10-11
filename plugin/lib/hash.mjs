// Content hashing shared by batches, receipts and the policy lock.
import { createHash } from 'node:crypto';

/** sha256 of text after normalizing line endings and surrounding whitespace,
 *  so a migration file and the same SQL sent through an MCP tool hash equal. */
export function contentSha(text) {
  const norm = String(text).replace(/\r\n?/g, '\n').trim();
  return createHash('sha256').update(norm, 'utf8').digest('hex');
}

/** Stable JSON: object keys sorted recursively, so the same policy always hashes the same. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function objectSha(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}
