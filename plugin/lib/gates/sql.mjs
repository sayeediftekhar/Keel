// The SQL checker the migration gate uses for "read-only" live SQL.

const WRITE_SQL = new RegExp('\\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|comment\\s+on|'
  + 'vacuum|reindex|copy|call|do|lock|refresh|security\\s+label|cluster|discard|import|reassign|into|set\\s+role|'
  + 'reset)\\b', 'i');
const SQL_WORDS_BEFORE_PAREN = new Set(['select', 'from', 'where', 'and', 'or', 'not', 'in', 'exists', 'any', 'all',
  'some', 'values', 'over', 'filter', 'as', 'on', 'join', 'using', 'when', 'then', 'else', 'case', 'with', 'by',
  'having', 'is', 'like', 'ilike', 'between', 'distinct', 'lateral', 'recursive', 'union', 'except', 'intersect',
  'array', 'row', 'cast', 'extract', 'interval', 'within']);
const READ_FUNCS = new Set(['count', 'sum', 'avg', 'min', 'max', 'coalesce', 'nullif', 'lower', 'upper', 'trim',
  'ltrim', 'rtrim', 'length', 'char_length', 'substring', 'substr', 'replace', 'concat', 'concat_ws', 'split_part',
  'position', 'strpos', 'left', 'right', 'round', 'floor', 'ceil', 'ceiling', 'abs', 'greatest', 'least', 'now',
  'date_trunc', 'date_part', 'to_char', 'to_date', 'to_timestamp', 'age', 'array_agg', 'string_agg', 'json_agg',
  'jsonb_agg', 'json_build_object', 'jsonb_build_object', 'row_number', 'rank', 'dense_rank', 'lag', 'lead',
  'first_value', 'last_value', 'ntile', 'percentile_cont', 'array_length', 'unnest', 'generate_series',
  'jsonb_array_length', 'jsonb_extract_path_text', 'json_extract_path_text', 'to_json', 'to_jsonb', 'md5', 'format',
  'regexp_replace', 'regexp_matches', 'date', 'numeric', 'decimal', 'varchar', 'char', 'timestamp', 'bool_and',
  'bool_or', 'stddev', 'variance']);

/** Conservative: true only for a single plain query that can't change anything. */
export function isReadOnlySql(sql) {
  let s = String(sql).replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''").replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, 'ident').trim().toLowerCase();
  s = s.replace(/;\s*$/, '');
  if (s.includes(';')) return false; // one statement only
  if (!/^(select|with|explain|show|values|table)\b/.test(s)) return false;
  if (/^explain\b[^;]*\banalyze\b/.test(s)) return false; // EXPLAIN ANALYZE executes the statement
  if (WRITE_SQL.test(s)) return false;
  for (const m of s.matchAll(/([a-z_][a-z0-9_.]*)\s*\(/g)) {
    const fn = m[1];
    if (!SQL_WORDS_BEFORE_PAREN.has(fn) && !READ_FUNCS.has(fn)) return false;
  }
  return true;
}
