// Minimal glob matcher for repo-relative paths (no dependencies).
//   **  any number of path segments (including none)
//   *   anything except '/'
//   ?   one character except '/'
// Patterns are anchored at the repo root; a leading '/' or './' is ignored.

export function globToRegExp(pattern) {
  let p = String(pattern).replace(/^\.\//, '').replace(/^\//, '');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        const slashAfter = p[i + 2] === '/';
        re += slashAfter ? '(?:.*/)?' : '.*';
        i += slashAfter ? 2 : 1;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  // A pattern naming a directory ("lib/money/") covers everything under it.
  if (re.endsWith('/')) re += '.*';
  return new RegExp(`^${re}$`);
}

export function matchesAny(relPath, patterns) {
  const p = String(relPath).replace(/^\.\//, '');
  return patterns.some((g) => globToRegExp(g).test(p));
}
