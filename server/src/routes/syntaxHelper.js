const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── SQL Error Patterns ────────────────────────────────────────────────────────
const SQL_PATTERNS = [
  { re: /\bSELECT\s+FROM\b/i, msg: 'Missing column list between SELECT and FROM', fix: c => c.replace(/SELECT\s+FROM/i, 'SELECT * FROM') },
  { re: /FROM\s*WHERE/i, msg: 'Missing table name between FROM and WHERE', fix: c => c },
  { re: /GROUP\s+BY\b(?!.*\bGROUP\s+BY\b)/i, check: c => { const sel = c.match(/SELECT\s+([\s\S]+?)\s+FROM/i)?.[1] || ''; const gb = c.match(/GROUP\s+BY\s+([\s\S]+?)(?:\s+HAVING|\s+ORDER|\s+LIMIT|$)/i)?.[1] || ''; return sel && gb ? null : null; } },
  { re: /'\s*,\s*'/g, msg: 'Possible string concatenation issue — use || for SQL string concat', fix: c => c.replace(/'\s*\+\s*'/g, "' || '") },
  { re: /\bJOIN\b(?!\s+(ON|USING|\w))/i, msg: 'JOIN missing ON or USING clause', fix: c => c },
  { re: /\bWHERE\b.*=\s*NULL\b/i, msg: 'Use IS NULL instead of = NULL', fix: c => c.replace(/=\s*NULL\b/ig, 'IS NULL') },
  { re: /\bWHERE\b.*!=\s*NULL\b/i, msg: 'Use IS NOT NULL instead of != NULL', fix: c => c.replace(/!=\s*NULL\b/ig, 'IS NOT NULL') },
  { re: /\bHAVING\b(?!.*\bGROUP\s+BY\b)/i, msg: 'HAVING clause without GROUP BY', fix: c => c },
  { re: /ORDER\s+BY\s+\d+\b/i, msg: 'ORDER BY column number works but is fragile — use column name', fix: c => c },
  { re: /SELECT\s+DISTINCT\s+\*\b/i, msg: 'SELECT DISTINCT * is expensive — consider specifying columns', fix: c => c },
  { re: /\bLIMIT\s+\d+\s*,\s*\d+\b/i, msg: 'MySQL LIMIT offset syntax — use LIMIT n OFFSET m for PostgreSQL', fix: c => c.replace(/LIMIT\s+(\d+)\s*,\s*(\d+)/i, 'LIMIT $2 OFFSET $1') },
  { re: /\bTOP\s+\d+\b/i, msg: 'TOP N is SQL Server syntax — use LIMIT in PostgreSQL', fix: c => c.replace(/SELECT\s+TOP\s+(\d+)/i, 'SELECT').replace(/\bFROM\b/i, m => `${m}`) + ' -- add LIMIT at end' },
  { re: /\[\w+\]/g, msg: 'Square bracket identifiers are SQL Server syntax — use double quotes in PostgreSQL', fix: c => c.replace(/\[(\w+)\]/g, '"$1"') },
  { re: /`\w+`/g, msg: 'Backtick identifiers are MySQL syntax — use double quotes in PostgreSQL', fix: c => c.replace(/`(\w+)`/g, '"$1"') },
  { re: /\bINSERT\s+INTO\b/i, msg: 'Only SELECT queries are allowed in this editor', fix: c => c },
  { re: /\bDROP\s+TABLE\b/i, msg: 'DROP TABLE is not permitted', fix: c => c },
  { re: /\bDELETE\s+FROM\b/i, msg: 'DELETE is not permitted — this is a read-only SQL editor', fix: c => c },
  { re: /\bUPDATE\s+\w+\s+SET\b/i, msg: 'UPDATE is not permitted — this is a read-only SQL editor', fix: c => c },
];

// ── Python Error Patterns ─────────────────────────────────────────────────────
const PYTHON_PATTERNS = [
  { re: /print\s+[^(]/, msg: 'Python 3 requires parentheses: print()', fix: c => c.replace(/\bprint\s+([^()\n]+)/g, 'print($1)') },
  { re: /^\s*(if|for|while|def|class|with|try|except|elif|else|finally)[^:]*$(?!:)/m, msg: 'Missing colon at end of block statement (if/for/while/def/class)', fix: c => c.replace(/^(\s*(if|for|while|def|class|with|try|except|elif|else|finally)[^:\n]*)$/m, '$1:') },
  { re: /==['"](True|False|None)['"]/g, msg: 'Comparing with == to string "True"/"False"/"None" — use boolean True/False/None', fix: c => c.replace(/==["'](True)["']/g, '== True').replace(/==["'](False)["']/g, '== False').replace(/==["'](None)["']/g, 'is None') },
  { re: /\bexcept\s*:/m, msg: 'Bare except: catches all exceptions including SystemExit — use except Exception:', fix: c => c.replace(/\bexcept\s*:/g, 'except Exception:') },
  { re: /\brange\s*\(\s*len\s*\(/g, msg: 'Avoid range(len(x)) — iterate directly: for item in x', fix: c => c },
  { re: /import \*/, msg: 'Wildcard imports (import *) pollute namespace — import specific names', fix: c => c },
  { re: /\bxrange\b/, msg: 'xrange does not exist in Python 3 — use range()', fix: c => c.replace(/\bxrange\b/g, 'range') },
  { re: /\bdict\.has_key\b/, msg: '.has_key() removed in Python 3 — use "key in dict"', fix: c => c.replace(/(\w+)\.has_key\(([^)]+)\)/g, '$2 in $1') },
  { re: /==\s*None\b/g, msg: 'Use "is None" instead of "== None"', fix: c => c.replace(/==\s*None\b/g, 'is None') },
  { re: /!=\s*None\b/g, msg: 'Use "is not None" instead of "!= None"', fix: c => c.replace(/!=\s*None\b/g, 'is not None') },
  { re: /\bexecfile\b/, msg: 'execfile() removed in Python 3 — use exec(open("file").read())', fix: c => c.replace(/\bexecfile\s*\(([^)]+)\)/g, 'exec(open($1).read())') },
  { re: /\breadlines\(\)/, msg: 'readlines() loads entire file — consider iterating file directly for large files', fix: c => c },
  { re: /^\s{1,3}\S/m, msg: 'Inconsistent indentation — Python requires 4 spaces per level', fix: c => c },
  { re: /\bdf\[([^\]]+)\]\s*=\s*df\[([^\]]+)\]\.apply\(lambda/, msg: 'apply(lambda) is slow — consider vectorized operations with numpy or pandas built-ins', fix: c => c },
  { re: /global\s+\w+/, msg: 'Global variables are an anti-pattern — consider returning values or using classes', fix: c => c },
];

// ── R Error Patterns ──────────────────────────────────────────────────────────
const R_PATTERNS = [
  { re: /<-\s*function/, msg: 'Style note: use <- for assignment in R (this is correct, just confirming)', fix: c => c },
  { re: /=\s*function\s*\(/, msg: 'In R, use <- instead of = for function assignment: myFn <- function()', fix: c => c.replace(/(\w+)\s*=\s*(function\s*\()/g, '$1 <- $2') },
  { re: /T\b(?!\w)/, msg: '"T" can be overwritten in R — use TRUE instead', fix: c => c.replace(/\bT\b/g, 'TRUE') },
  { re: /F\b(?!\w)/, msg: '"F" can be overwritten in R — use FALSE instead', fix: c => c.replace(/\bF\b/g, 'FALSE') },
  { re: /==\s*NULL\b/g, msg: 'Use is.null() to check for NULL in R, not ==', fix: c => c.replace(/(\w+)\s*==\s*NULL\b/g, 'is.null($1)') },
  { re: /==\s*NA\b/g, msg: 'Use is.na() to check for NA in R, not ==', fix: c => c.replace(/(\w+)\s*==\s*NA\b/g, 'is.na($1)') },
  { re: /\bsetwd\b/, msg: 'Avoid setwd() in scripts — use here::here() or relative paths for reproducibility', fix: c => c },
  { re: /\battach\s*\(/, msg: 'Avoid attach() — it pollutes the global namespace, use $ notation instead', fix: c => c },
  { re: /\bfor\s*\(\w+\s+in\s+1:nrow/, msg: 'Avoid row-by-row loops — use apply() or vectorized dplyr/data.table operations', fix: c => c },
  { re: /1:length\(/, msg: 'Avoid 1:length(x) — use seq_along(x) which is safer with zero-length vectors', fix: c => c.replace(/1:length\(([^)]+)\)/g, 'seq_along($1)') },
  { re: /1:nrow\(/, msg: 'Avoid 1:nrow(x) — use seq_len(nrow(x)) which handles zero rows safely', fix: c => c.replace(/1:nrow\(([^)]+)\)/g, 'seq_len(nrow($1))') },
  { re: /\bcat\s*\(/, msg: 'cat() does not add newline — use message() for diagnostics or cat("...\n")', fix: c => c },
  { re: /\bsapply\b/, msg: 'sapply() can return different types — use lapply() + explicit conversion for stability', fix: c => c },
  { re: /library\s*\(\s*["']/, msg: 'library() accepts unquoted names — prefer library(pkg) over library("pkg")', fix: c => c.replace(/library\s*\(\s*["']([^"']+)["']\s*\)/g, 'library($1)') },
];

const SQL_KEYWORDS = ['SELECT','FROM','WHERE','JOIN','LEFT','RIGHT','INNER','OUTER','GROUP','ORDER','HAVING','LIMIT','OFFSET','INSERT','UPDATE','DELETE','CREATE','DROP','ALTER','WITH','UNION','INTERSECT','EXCEPT','DISTINCT','AS','ON','AND','OR','NOT','IN','IS','NULL','LIKE','BETWEEN','EXISTS','CASE','WHEN','THEN','ELSE','END','INTO','VALUES','SET','BY','ASC','DESC','COUNT','SUM','AVG','MIN','MAX','COALESCE','CAST','CONVERT'];

const editDist = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
};

const findSQLTypos = (code) => {
  const errors = [];
  const seen = new Set();
  const tokens = code.toUpperCase().split(/[\s,()[\]=<>!;'"\n\t]/);
  for (const tok of tokens) {
    if (!tok || tok.length < 3 || seen.has(tok)) continue;
    if (SQL_KEYWORDS.includes(tok)) continue;
    // Skip plurals/derivatives of keywords (e.g. ORDERS, GROUPS, VALUES) — likely table/column names
    if (tok.endsWith('S') && SQL_KEYWORDS.includes(tok.slice(0, -1))) continue;
    if (tok.endsWith('ED') && SQL_KEYWORDS.includes(tok.slice(0, -2))) continue;
    seen.add(tok);
    for (const kw of SQL_KEYWORDS) {
      if (kw.length < 4) continue;
      if (Math.abs(tok.length - kw.length) > 2) continue;
      if (editDist(tok, kw) === 1) {
        errors.push({ type: 'error', message: `Possible SQL keyword typo: "${tok}" — did you mean "${kw}"?`, fix: `Replace "${tok.toLowerCase()}" with "${kw.toLowerCase()}"` });
        break;
      }
    }
  }
  return errors;
};

const analyzeSQL = (code) => {
  const errors = [];
  let fixed = code;

  // Keyword typo detection
  errors.push(...findSQLTypos(code));

  for (const p of SQL_PATTERNS) {
    if (p.re.test(code)) {
      errors.push({ type: 'warning', message: p.msg, language: 'sql' });
      if (p.fix) fixed = p.fix(fixed);
    }
  }
  // Unmatched parentheses
  const opens = (code.match(/\(/g) || []).length;
  const closes = (code.match(/\)/g) || []).length;
  if (opens !== closes) errors.push({ type: 'error', message: `Unmatched parentheses: ${opens} opening vs ${closes} closing`, language: 'sql', fix: opens > closes ? 'Add ' + (opens - closes) + ' closing parenthesis/es' : 'Remove ' + (closes - opens) + ' extra closing parenthesis/es' });
  // Unmatched quotes
  const singleQ = (code.match(/'/g) || []).length;
  if (singleQ % 2 !== 0) errors.push({ type: 'error', message: 'Unmatched single quote — string literal not closed', language: 'sql' });
  const suggestions = generateSQLSuggestions(code);
  return { errors, fixed: fixed !== code ? fixed : null, suggestions };
};

const analyzePython = (code) => {
  const errors = [];
  let fixed = code;
  for (const p of PYTHON_PATTERNS) {
    if (p.re.test(code)) {
      errors.push({ type: 'warning', message: p.msg, language: 'python' });
      if (p.fix) fixed = p.fix(fixed);
    }
  }
  // Check indentation consistency
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    const indent = line.match(/^(\s+)/)?.[1];
    if (indent && indent.includes('\t') && indent.includes(' ')) {
      errors.push({ type: 'error', message: `Line ${i+1}: Mixed tabs and spaces — use spaces only (PEP 8)`, language: 'python', line: i+1 });
    }
  });
  const suggestions = generatePythonSuggestions(code);
  return { errors, fixed: fixed !== code ? fixed : null, suggestions };
};

const analyzeR = (code) => {
  const errors = [];
  let fixed = code;
  for (const p of R_PATTERNS) {
    if (p.re.test(code)) {
      errors.push({ type: 'warning', message: p.msg, language: 'r' });
      if (p.fix) fixed = p.fix(fixed);
    }
  }
  // Check for missing library calls
  const usedPkgs = [];
  if (/ggplot\b/.test(code) && !/library\(ggplot2\)/.test(code)) usedPkgs.push('ggplot2');
  if (/\b(mutate|filter|select|group_by|summarise|arrange)\b/.test(code) && !/library\(dplyr\)/.test(code)) usedPkgs.push('dplyr');
  if (/\bdata\.table\b/.test(code) && !/library\(data\.table\)/.test(code)) usedPkgs.push('data.table');
  if (/\bstr_/.test(code) && !/library\(stringr\)/.test(code)) usedPkgs.push('stringr');
  if (usedPkgs.length) errors.push({ type: 'warning', message: `Possible missing library() calls for: ${usedPkgs.join(', ')}`, language: 'r', fix: usedPkgs.map(p => `library(${p})`).join('\n') });
  const suggestions = generateRSuggestions(code);
  return { errors, fixed: fixed !== code ? fixed : null, suggestions };
};

const generateSQLSuggestions = (code) => {
  const s = [];
  if (!code.trim().toUpperCase().startsWith('WITH') && !code.trim().toUpperCase().startsWith('SELECT')) s.push('Start your query with SELECT or WITH for CTEs');
  if (/SELECT\s+\*/i.test(code) && /JOIN\b/i.test(code)) s.push('SELECT * with JOINs can be slow and ambiguous — specify only needed columns');
  if (!/LIMIT\b/i.test(code) && !/COUNT\b/i.test(code)) s.push('Consider adding LIMIT to avoid fetching all rows during exploration');
  if (/LIKE\s+['"]%/i.test(code)) s.push('Leading wildcard in LIKE "%..." prevents index use and is slow on large tables');
  if (/ORDER\s+BY\b/i.test(code) && !/LIMIT\b/i.test(code)) s.push('ORDER BY without LIMIT sorts all rows — add LIMIT for faster results');
  if (/NOT\s+IN\s*\(/i.test(code)) s.push('NOT IN with subquery can be slow — consider LEFT JOIN ... WHERE IS NULL');
  if (!s.length) s.push('Query looks syntactically correct', 'Add column aliases (AS) to improve readability', 'Consider formatting with consistent casing for SQL keywords');
  return s;
};

const generatePythonSuggestions = (code) => {
  const s = [];
  if (!/\bif\s+__name__\s*==/.test(code) && /\bdef\b/.test(code)) s.push('Add if __name__ == "__main__": guard for scripts with functions');
  if (/\bopen\s*\(/.test(code) && !/\bwith\s+open\b/.test(code)) s.push('Use "with open(...) as f:" context manager to ensure files are closed');
  if (/\+\s*str\s*\(/.test(code)) s.push('Use f-strings instead of string concatenation: f"value={x}" is cleaner');
  if (/\.append\(/.test(code)) s.push('Consider list comprehensions instead of append() loops for better performance');
  if (!s.length) s.push('Code looks clean', 'Consider adding type hints to functions (def my_fn(x: int) -> str:)', 'Use docstrings to document function behavior');
  return s;
};

const generateRSuggestions = (code) => {
  const s = [];
  if (/for\s*\(/.test(code)) s.push('R is vectorized — replace loops with apply(), purrr::map(), or dplyr operations where possible');
  if (/\$/.test(code) && !/\bwith\b/.test(code)) s.push('Consider using with(df, ...) or dplyr to avoid repeated $ access');
  if (!s.length) s.push('Code structure looks reasonable', 'Consider using the tidyverse for consistent, readable data manipulation', 'Use styler::style_text() to auto-format R code');
  return s;
};

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/languages', authenticate, (req, res) => {
  res.json([
    { id: 'sql', name: 'SQL', icon: 'database', description: 'Structured Query Language for database queries', extensions: ['.sql'] },
    { id: 'python', name: 'Python', icon: 'code', description: 'General-purpose language popular for data science', extensions: ['.py'] },
    { id: 'r', name: 'R', icon: 'bar-chart', description: 'Statistical computing and data visualization', extensions: ['.r', '.R'] },
  ]);
});

router.post('/analyze', authenticate, async (req, res) => {
  try {
    const { code, language = 'sql' } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });

    let result;
    const lang = language.toLowerCase();
    if (lang === 'sql') result = analyzeSQL(code);
    else if (lang === 'python' || lang === 'py') result = analyzePython(code);
    else if (lang === 'r') result = analyzeR(code);
    else return res.status(400).json({ error: 'Language must be sql, python, or r' });

    await pool.query(
      'INSERT INTO syntax_sessions (language, code, errors, suggestions, fixed_code, user_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [lang, code.slice(0, 5000), JSON.stringify(result.errors), JSON.stringify(result.suggestions), result.fixed, req.user.id]
    ).catch(() => {});

    res.json({ language: lang, errorCount: result.errors.length, errors: result.errors, suggestions: result.suggestions, fixedCode: result.fixed, isClean: result.errors.length === 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM syntax_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /templates?language=sql (query param version)
router.get('/templates', authenticate, (req, res) => {
  req.params = { language: req.query.language || 'sql' };
  const lang = req.params.language.toLowerCase();
  const templates = {
    sql: [
      { name: 'Basic SELECT', code: 'SELECT column1, column2\nFROM dataset\nWHERE condition = true\nORDER BY column1 ASC\nLIMIT 100;' },
      { name: 'Aggregation with GROUP BY', code: 'SELECT category, COUNT(*) AS count, SUM(value) AS total, AVG(value) AS avg_value\nFROM dataset\nGROUP BY category\nHAVING COUNT(*) > 5\nORDER BY total DESC;' },
      { name: 'Window Function', code: 'SELECT name, value,\n  SUM(value) OVER (PARTITION BY category ORDER BY date) AS running_total,\n  ROW_NUMBER() OVER (PARTITION BY category ORDER BY value DESC) AS rank\nFROM dataset;' },
      { name: 'CTE', code: 'WITH summary AS (\n  SELECT category, AVG(value) AS avg_val\n  FROM dataset GROUP BY category\n)\nSELECT d.*, s.avg_val FROM dataset d\nJOIN summary s ON d.category = s.category\nWHERE d.value > s.avg_val;' },
      { name: 'Time-series monthly', code: "SELECT DATE_TRUNC('month', date_column) AS month, COUNT(*) AS records, SUM(value) AS total\nFROM dataset\nGROUP BY DATE_TRUNC('month', date_column)\nORDER BY month;" },
    ],
    python: [
      { name: 'Pandas EDA', code: 'import pandas as pd\ndf = pd.read_csv("data.csv")\nprint(df.shape)\nprint(df.describe())\nprint(df.isnull().sum())' },
      { name: 'Data Cleaning', code: "import pandas as pd\ndf = pd.read_csv('data.csv')\ndf = df.drop_duplicates()\ndf['col'].fillna(df['col'].median(), inplace=True)" },
      { name: 'Sklearn Pipeline', code: 'from sklearn.pipeline import Pipeline\nfrom sklearn.ensemble import RandomForestClassifier\nfrom sklearn.model_selection import train_test_split\npipeline = Pipeline([(\'model\', RandomForestClassifier())])\npipeline.fit(X_train, y_train)' },
    ],
    r: [
      { name: 'tidyverse EDA', code: 'library(tidyverse)\ndf <- read_csv("data.csv")\nglimpse(df)\nsummary(df)' },
      { name: 'dplyr Aggregation', code: 'library(dplyr)\nresult <- df |> group_by(category) |> summarise(mean_val = mean(value), n = n())' },
    ],
  };
  res.json(templates[lang] || []);
});

router.get('/templates/:language', authenticate, async (req, res) => {
  const lang = req.params.language.toLowerCase();
  const templates = {
    sql: [
      { name: 'Basic SELECT', code: 'SELECT column1, column2\nFROM dataset\nWHERE condition = true\nORDER BY column1 ASC\nLIMIT 100;' },
      { name: 'Aggregation with GROUP BY', code: 'SELECT category, COUNT(*) AS count, SUM(value) AS total, AVG(value) AS avg_value\nFROM dataset\nGROUP BY category\nHAVING COUNT(*) > 5\nORDER BY total DESC;' },
      { name: 'Window Function', code: 'SELECT name, value,\n  SUM(value) OVER (PARTITION BY category ORDER BY date) AS running_total,\n  ROW_NUMBER() OVER (PARTITION BY category ORDER BY value DESC) AS rank\nFROM dataset;' },
      { name: 'CTE (Common Table Expression)', code: 'WITH summary AS (\n  SELECT category, AVG(value) AS avg_val\n  FROM dataset\n  GROUP BY category\n)\nSELECT d.*, s.avg_val\nFROM dataset d\nJOIN summary s ON d.category = s.category\nWHERE d.value > s.avg_val;' },
      { name: 'Time-series monthly', code: 'SELECT DATE_TRUNC(\'month\', date_column) AS month, COUNT(*) AS records, SUM(value) AS total\nFROM dataset\nGROUP BY DATE_TRUNC(\'month\', date_column)\nORDER BY month;' },
    ],
    python: [
      { name: 'Pandas EDA', code: 'import pandas as pd\nimport numpy as np\n\ndf = pd.read_csv("data.csv")\n\n# Basic info\nprint(df.shape)\nprint(df.dtypes)\nprint(df.describe())\nprint(df.isnull().sum())\n\n# Correlation\nprint(df.corr(numeric_only=True))' },
      { name: 'Data Cleaning', code: 'import pandas as pd\n\ndf = pd.read_csv("data.csv")\n\n# Drop duplicates\ndf = df.drop_duplicates()\n\n# Fill missing\ndf[\'numeric_col\'].fillna(df[\'numeric_col\'].median(), inplace=True)\ndf[\'category_col\'].fillna(\'Unknown\', inplace=True)\n\n# Remove outliers (IQR)\nQ1 = df[\'value\'].quantile(0.25)\nQ3 = df[\'value\'].quantile(0.75)\nIQR = Q3 - Q1\ndf = df[(df[\'value\'] >= Q1 - 1.5*IQR) & (df[\'value\'] <= Q3 + 1.5*IQR)]' },
      { name: 'Sklearn Pipeline', code: 'from sklearn.pipeline import Pipeline\nfrom sklearn.preprocessing import StandardScaler\nfrom sklearn.ensemble import RandomForestClassifier\nfrom sklearn.model_selection import train_test_split, cross_val_score\n\nX = df.drop("target", axis=1)\ny = df["target"]\n\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n\npipeline = Pipeline([\n    (\'scaler\', StandardScaler()),\n    (\'model\', RandomForestClassifier(n_estimators=100, random_state=42))\n])\n\npipeline.fit(X_train, y_train)\nprint(f"Accuracy: {pipeline.score(X_test, y_test):.3f}")' },
    ],
    r: [
      { name: 'tidyverse EDA', code: 'library(tidyverse)\n\ndf <- read_csv("data.csv")\n\n# Summary stats\nglimpse(df)\nsummary(df)\n\n# Correlation\ndf |> select(where(is.numeric)) |> cor(use = "complete.obs")\n\n# Distribution plot\ndf |>\n  ggplot(aes(x = value_col)) +\n  geom_histogram(bins = 30, fill = "steelblue") +\n  theme_minimal()' },
      { name: 'dplyr Aggregation', code: 'library(dplyr)\n\nresult <- df |>\n  filter(!is.na(value_col)) |>\n  group_by(category) |>\n  summarise(\n    n = n(),\n    mean_val = mean(value_col),\n    median_val = median(value_col),\n    sd_val = sd(value_col),\n    .groups = "drop"\n  ) |>\n  arrange(desc(mean_val))' },
      { name: 'ggplot2 Chart', code: 'library(ggplot2)\n\ndf |>\n  ggplot(aes(x = x_col, y = y_col, color = category)) +\n  geom_point(alpha = 0.7, size = 2) +\n  geom_smooth(method = "lm", se = TRUE) +\n  scale_color_brewer(palette = "Set2") +\n  labs(title = "Scatter Plot", x = "X Axis", y = "Y Axis") +\n  theme_minimal() +\n  theme(legend.position = "bottom")' },
    ],
  };
  res.json(templates[lang] || []);
});

module.exports = router;
