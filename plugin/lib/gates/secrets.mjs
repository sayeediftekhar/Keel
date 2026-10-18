// Secrets gate: no live credential reaches the transcript (env files, the
// environment, recursive searches) or a file (credential literals).

import { base } from '../shell.mjs';
import { globToRegExp } from '../glob.mjs';
import { ALLOW, block } from './common.mjs';

const ENV_FILE = /^(\.env(rc)?(\.(?!example$|sample$|template$|dist$|test$|ci$)[\w.-]+)?|\.dev\.vars)$/i;
// Credential literals that must never be written into a file or typed into a
// command: once in source, docs or the transcript they are leaked. Shapes with
// a vendor prefix and enough entropy that a false positive is unlikely; public
// keys that look like JWTs (Supabase anon keys) are deliberately NOT here.
export const SECRET_LITERAL = new RegExp(`(${[
  'sk-(?:proj-|ant-|live-)?[A-Za-z0-9_-]{20,}', 'sk_live_[A-Za-z0-9]{10,}', 'AKIA[0-9A-Z]{16}',
  '-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----', 'xox[baprs]-[A-Za-z0-9-]{10,}', 'ghp_[A-Za-z0-9]{36}',
  'github_pat_[A-Za-z0-9_]{22,}', 'glpat-[A-Za-z0-9_-]{20,}',
].join('|')})`);
const ENV_PROBES = ['.env', '.env.local', '.env.production', '.envrc', '.dev.vars'];
const READERS = new Set(['cat', 'less', 'more', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'awk', 'sed',
  'bat', 'strings', 'xxd', 'od', 'hexdump', 'base64', 'nl', 'cut', 'sort', 'uniq', 'diff', 'tac', 'jq', 'yq', 'curl',
  'nc', 'tar', 'zip', '7z', 'gzip', 'bzip2', 'xz', 'openssl', 'gpg', 'vim', 'vi', 'nano', 'emacs', 'code', 'python',
  'python3', 'node']);
const COPIERS = new Set(['cp', 'scp', 'rsync', 'ln', 'mv', 'install']);
const PRINTERS = new Set(['echo', 'printf', 'node', 'python', 'python3', 'ruby', 'perl', 'deno', 'bun', 'php', 'awk',
  'curl', 'wget', 'nc', 'http', 'https', 'tee', 'logger']);


function secretsBlock(what) {
  return block('secrets', `${what} would expose live credentials in the transcript. `
    + 'If a task needs the database, use a test DATABASE_URL; '
    + 'live access goes through the batch-approved migration gate.');
}

/** The text a file tool would write. */
function writtenText(tool, input) {
  if (tool === 'Write') return String(input.content ?? '');
  if (tool === 'Edit') return String(input.new_string ?? '');
  if (tool === 'MultiEdit') return (input.edits ?? []).map((e) => String(e.new_string ?? '')).join('\n');
  if (tool === 'NotebookEdit') return String(input.new_source ?? '');
  return '';
}

// No credential literal goes into a file. Real env files (.env, .env.local, …)
// are the one place a local credential belongs and are exempt; .env.example
// and everything else — source, docs, tests, config — are not.
export function secretsWrite(tool, input, ctx) {
  if (ctx.policy.gates.secrets.mode !== 'block') return ALLOW;
  const file = input.file_path ?? input.notebook_path;
  if (file && ENV_FILE.test(base(file))) return ALLOW;
  const m = SECRET_LITERAL.exec(writtenText(tool, input));
  if (!m) return ALLOW;
  const shape = m[0].slice(0, 8);
  return block('secrets', `the text being written to ${file ? base(file) : 'this file'} contains what looks like `
    + `a live credential (${shape}…). Keep it out of source and docs: read it from an environment variable, `
    + 'and put the value only in a local env file.');
}

function isEnvArg(a) {
  const b = base(String(a).replace(/^@/, '').replace(/^[^:]*:(?=\.)/, '')); // git show HEAD:.env → .env
  if (ENV_FILE.test(b)) return true;
  if (/[*?[]/.test(b)) return ENV_PROBES.some((f) => globToRegExp(b).test(f)); // cat .e*
  return false;
}

/** `printenv`, `env`, `set`, `export`: listing the environment or a live credential. */
function envListingBlock(prog, args, markers) {
  if (prog === 'printenv' && (args.length === 0 || args.some((a) => markers.includes(a)))) {
    return secretsBlock(`\`printenv${args.length ? ` ${args.join(' ')}` : ''}\``);
  }
  if (prog === 'env' && args.length === 0) return secretsBlock('`env`');
  if ((prog === 'set' || prog === 'export') && (args.length === 0 || args.every((a) => a === '-p'))) {
    return secretsBlock(`\`${prog}\``);
  }
  return null;
}

/** `declare -p/-x`, `compgen -e`, /proc/…/environ: other ways to dump the environment. */
function shellEnvBlock(cmd, prog, args) {
  if ((prog === 'declare' || prog === 'typeset') && args.length && args.every((a) => /^-[a-zA-Z]*[px]/.test(a))) {
    return secretsBlock(`\`${prog} ${args.join(' ')}\``);
  }
  if (prog === 'compgen' && args.includes('-e')) return secretsBlock('`compgen -e`');
  if (args.some((a) => /\/proc\/[^/]+\/environ/.test(a)) || cmd.inputs.some((a) => /\/proc\/[^/]+\/environ/.test(a))) {
    return secretsBlock('reading a process environment');
  }
  return null;
}

/** A printer or interpreter echoing a live credential, or the whole environment. */
function printerBlock(cmd, prog, args, markers) {
  if (!(PRINTERS.has(prog) || cmd.dynamic)) return null;
  const m = markers.join('|');
  const ref = m
    ? new RegExp(`(\\$\\{?(${m})\\b|process\\.env(\\.(${m})\\b|\\[['"](${m})['"]\\])`
      + `|environ[^\\n]*['"](${m})['"]|getenv\\(['"](${m})['"])`)
    : null;
  if (ref && args.some((a) => ref.test(a))) return secretsBlock(`\`${prog}\` with a live credential reference`);
  const whole = new RegExp([
    'process\\.env(?!\\s*(\\.\\s*[A-Za-z_]|\\[))', 'os\\.environ(?!\\s*(\\[|\\.get\\b))',
    '\\bENV(?!\\s*\\[)\\b(?=.*(puts|p |print|inspect|to_h))', '%ENV', 'getenv\\(\\s*\\)',
  ].join('|'));
  if (['node', 'python', 'python3', 'ruby', 'perl', 'deno', 'bun', 'php'].includes(prog)
    && args.some((a) => whole.test(a))) return secretsBlock(`\`${prog}\` printing the whole environment`);
  return null;
}

/** A command that reads, copies or redirects an env file into the transcript. */
function envFileBlock(cmd, prog, args) {
  if (cmd.inputs.some(isEnvArg)) return secretsBlock(`\`${prog} < env file\``);
  if (prog === 'dd' && args.some((a) => a.startsWith('if=') && isEnvArg(a.slice(3)))) {
    return secretsBlock('`dd` on an env file');
  }
  if (prog === 'git' && ['show', 'cat-file', 'log', 'diff', 'grep'].includes(args[0])
    && args.some((a) => /:.*\.env|^\.env/.test(a) && isEnvArg(a))) {
    return secretsBlock(`\`git ${args[0]}\` on an env file`);
  }
  if (COPIERS.has(prog)) {
    const srcs = args.filter((a) => !a.startsWith('-')).slice(0, -1);
    if (srcs.some(isEnvArg)) return secretsBlock(`\`${prog}\` of an env file`);
  } else if (READERS.has(prog) && args.some(isEnvArg)) {
    return secretsBlock(`\`${prog}\` on an env file`);
  }
  return null;
}

/** Recursive searches for a credential name would print the line from .env. */
function credentialSearchBlock(prog, args, markers) {
  if (!(markers.length && args.some((a) => markers.some((m) => a.includes(m))))) return null;
  const paths = args.filter((a) => !a.startsWith('-')).slice(1);
  const wide = paths.length === 0 || paths.some((p) => p === '.' || p === './' || isEnvArg(p));
  if ((prog === 'grep' || prog === 'egrep') && args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive')
    && wide) return secretsBlock('a recursive search for a credential name');
  if ((prog === 'rg' || prog === 'ag') && args.some((a) => /^(--hidden|-u+|--no-ignore|--unrestricted)$/.test(a))) {
    return secretsBlock('a hidden-file search for a credential name');
  }
  return null;
}

export function secretsBash(cmd, ctx) {
  if (ctx.policy.gates.secrets.mode !== 'block') return null;
  const prog = base(cmd.argv[0]);
  const args = cmd.argv.slice(1);
  const markers = ctx.policy.environments.live.markers;
  const shown = envListingBlock(prog, args, markers) ?? shellEnvBlock(cmd, prog, args)
    ?? printerBlock(cmd, prog, args, markers);
  if (shown) return shown;
  // A credential literal typed into a command is already in the transcript, and
  // usually on its way into a file or a request header. Use the env var instead.
  if (cmd.argv.some((a) => SECRET_LITERAL.test(a)) || (cmd.stdinText && SECRET_LITERAL.test(cmd.stdinText))) {
    return secretsBlock(`\`${prog}\` with a credential literal in the command (use an environment variable)`);
  }
  return envFileBlock(cmd, prog, args) ?? credentialSearchBlock(prog, args, markers);
}

/** Read, Grep and Glob: no env file read or searched into the transcript. */
export function secretsRead(name, input, ctx) {
  if (ctx.policy.gates.secrets.mode !== 'block') return ALLOW;
  const target = input.file_path ?? input.path;
  const glob = input.glob ?? (name === 'Glob' ? input.pattern : null);
  if (target && ENV_FILE.test(base(target))) return secretsBlock(`reading ${base(target)}`);
  if (name === 'Grep' && glob && ENV_PROBES.some((f) => globToRegExp(base(glob)).test(f))) {
    return secretsBlock(`searching ${glob}`);
  }
  return ALLOW;
}
