const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Expanded SQL keyword + datatype list for typo detection ───────────────────
const SQL_KEYWORDS = new Set([
  // Core DML
  'SELECT','FROM','WHERE','JOIN','LEFT','RIGHT','INNER','OUTER','FULL','CROSS',
  'GROUP','ORDER','HAVING','LIMIT','OFFSET','UNION','INTERSECT','EXCEPT',
  'DISTINCT','AS','ON','AND','OR','NOT','IN','IS','NULL','LIKE','ILIKE',
  'BETWEEN','EXISTS','CASE','WHEN','THEN','ELSE','END','INTO','VALUES',
  'SET','BY','ASC','DESC','WITH','RETURNING','PARTITION','OVER','WINDOW',
  // DML statements
  'INSERT','UPDATE','DELETE','MERGE','TRUNCATE','REPLACE','CALL',
  // DDL
  'CREATE','DROP','ALTER','TABLE','INDEX','VIEW','TRIGGER','FUNCTION',
  'PROCEDURE','DATABASE','SCHEMA','SEQUENCE','COLUMN','CONSTRAINT',
  'TEMPORARY','MATERIALIZED','ADD','IF','DO','ONLY','SOME',
  'RECURSIVE','LATERAL','NATURAL','USING','CUBE','ROLLUP','GROUPING',
  'FILTER','WITHIN','COLLATE','NULLS','FIRST','LAST','NEXT','ROWS',
  'UNBOUNDED','PRECEDING','FOLLOWING','CURRENT','CASCADING','RESTRICT',
  'CASCADE','PRIVILEGES','OPTION','GRANT','REVOKE','OWNER',
  // Constraint keywords
  'PRIMARY','FOREIGN','REFERENCES','UNIQUE','DEFAULT','CHECK','GENERATED',
  'ALWAYS','IDENTITY','AUTO_INCREMENT','AUTOINCREMENT','KEY',
  'BEFORE','AFTER','INSTEAD','EACH','ROW','STATEMENT','EXECUTE','NEW','OLD',
  'RETURNS','BEGIN','RETURN','LANGUAGE','DECLARE','END',
  // Transaction
  'COMMIT','ROLLBACK','TRANSACTION','SAVEPOINT',
  // Aggregates & functions
  'COUNT','SUM','AVG','MIN','MAX','COALESCE','NULLIF','CAST','CONVERT',
  'GREATEST','LEAST','CONCAT','LENGTH','SUBSTRING','TRIM','UPPER','LOWER',
  'NOW','CURRENT_DATE','CURRENT_TIMESTAMP','DATE_TRUNC','EXTRACT',
  // Data types (critical for catching MONY→MONEY, AUTOIN→AUTO_INCREMENT, etc.)
  'INT','INTEGER','BIGINT','SMALLINT','TINYINT','DECIMAL','NUMERIC',
  'FLOAT','DOUBLE','REAL','MONEY','SMALLMONEY','CHAR','VARCHAR','TEXT',
  'NCHAR','NVARCHAR','DATE','TIME','TIMESTAMP','DATETIME','BOOLEAN','BOOL',
  'BIT','SERIAL','BIGSERIAL','SMALLSERIAL','UUID','JSON','JSONB','BYTEA',
  'INET','CIDR','MACADDR','ARRAY','INTERVAL',
]);

// ── Levenshtein distance (edit distance = 1 typo detection) ───────────────────
const editDist = (a, b) => {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
};

// Strip string literal content from a line so 'Salary updated' doesn't produce tokens
const stripStringLiterals = (line) => line.replace(/'[^']*'/g, "''");

const findSQLTypos = (code, lines) => {
  const errors = [];
  const seenTok = new Set();

  const lineTokens = lines.map((line, idx) => {
    if (line.trim().startsWith('--')) return [];
    // Remove string literals first to avoid flagging words inside quoted values
    const noStrings = stripStringLiterals(line);
    const toks = noStrings.toUpperCase().split(/[\s,()[\]=<>!;'"\n\t+\-*/]/);
    return toks.map(t => ({ tok: t, lineNum: idx + 1 }));
  }).flat();

  for (const { tok, lineNum } of lineTokens) {
    if (!tok || tok.length < 3 || seenTok.has(tok)) continue;
    if (SQL_KEYWORDS.has(tok)) continue;
    if (/^\d+(\.\d+)?$/.test(tok)) continue;
    // Skip tokens that look like identifiers with underscores or dots (table.col, my_col)
    if (/[._]/.test(tok)) continue;
    // Skip ED/ING/S/LY suffixes that are likely plain English words inside comments/strings that slipped through
    if (tok.endsWith('S') && SQL_KEYWORDS.has(tok.slice(0, -1))) continue;
    if (tok.endsWith('ED') && SQL_KEYWORDS.has(tok.slice(0, -2))) continue;
    if (tok.endsWith('ING') && SQL_KEYWORDS.has(tok.slice(0, -3))) continue;
    seenTok.add(tok);

    for (const kw of SQL_KEYWORDS) {
      if (kw.length < 3) continue;
      if (Math.abs(tok.length - kw.length) > 2) continue;
      if (editDist(tok, kw) === 1) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: Possible keyword typo — "${tok}" did you mean "${kw}"?`,
          fix: `Replace "${tok.toLowerCase()}" with "${kw.toLowerCase()}"`,
        });
        break;
      }
    }
  }
  return errors;
};

// ── Strip SQL comments (for structural analysis) ──────────────────────────────
const stripComments = (line) => line.replace(/--.*$/, '').trim();

// ── Line-by-line structural checks ───────────────────────────────────────────
const checkSQLLines = (lines) => {
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const stripped = stripComments(raw);
    if (!stripped) continue;
    const upper = stripped.toUpperCase();

    // ── LIMIT TO n (invalid — should be LIMIT n)
    if (/\bLIMIT\s+TO\b/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: "LIMIT TO" is not valid SQL — use "LIMIT n"`,
        fix: 'Remove TO: LIMIT 10',
      });
    }

    // ── DISTINCT placed after column list: SELECT col DISTINCT FROM ...
    if (/\bSELECT\b/i.test(stripped) && /\bDISTINCT\b/i.test(stripped)) {
      if (!/\bSELECT\s+(ALL\s+)?DISTINCT\b/i.test(stripped)) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: DISTINCT must immediately follow SELECT — "SELECT DISTINCT col", not "SELECT col DISTINCT"`,
          fix: 'Move DISTINCT right after SELECT',
        });
      }
    }

    // ── LIKE with unquoted pattern: WHERE name LIKE A%
    if (/\bLIKE\s+[A-Za-z0-9_]/i.test(stripped) && !/\bLIKE\s+['"$?%]/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: LIKE pattern must be a quoted string — LIKE 'A%', not LIKE A%`,
        fix: "Wrap the pattern in single quotes: LIKE 'A%'",
      });
    }

    // ── BETWEEN missing AND keyword
    if (/\bBETWEEN\b/i.test(stripped) && !/\bBETWEEN\b.+\bAND\b/i.test(stripped)) {
      // Check if AND is on next line
      const nextLine = i + 1 < lines.length ? stripComments(lines[i + 1]) : '';
      if (!/^\s*AND\b/i.test(nextLine)) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: BETWEEN requires AND — "BETWEEN val1 AND val2"`,
          fix: 'Add AND: BETWEEN 3000 AND 6000',
        });
      }
    }

    // ── CHECK constraint missing parentheses: CHECK amount > 0
    if (/\bCHECK\b/i.test(stripped) && !/\bCHECK\s*\(/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: CHECK constraint requires parentheses — CHECK (amount > 0), not CHECK amount > 0`,
        fix: 'Add parentheses: CHECK (condition)',
      });
    }

    // ── BOOLEAN DEFAULT with a string literal ('yes', 'no', 'true')
    if (/\bBOOLEAN\s+DEFAULT\s+['"]/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: BOOLEAN DEFAULT must be TRUE or FALSE, not a string like 'yes'`,
        fix: "Use DEFAULT TRUE or DEFAULT FALSE",
      });
    }

    // ── NOT NULL inside VALUES list: VALUES (1, NOT NULL)
    if (/\bVALUES\b/i.test(stripped) && /\bNOT\s+NULL\b/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: NOT NULL cannot appear inside a VALUES clause — it's a column constraint, not a value`,
        fix: 'Use NULL to insert a null value, or omit the column',
      });
    }

    // ── Incomplete IS clause: WHERE col IS; or WHERE col IS (end of line)
    if (/\bIS\s*$/i.test(stripped) || /\bIS\s*[;,)]/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: Incomplete IS clause — must be followed by NULL, NOT NULL, TRUE, or FALSE`,
        fix: 'Use: WHERE col IS NULL or WHERE col IS NOT NULL',
      });
    }

    // ── CREATE INDEX missing ON: CREATE INDEX idx employees(col)
    if (/\bCREATE\s+(UNIQUE\s+)?INDEX\s+\w+\s+(?!ON\b)\w+\s*\(/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: CREATE INDEX missing ON keyword — "CREATE INDEX name ON table(col)"`,
        fix: 'Add ON: CREATE INDEX idx_name ON tablename(column)',
      });
    }

    // ── CREATE VIEW missing AS: CREATE VIEW name SELECT ...
    if (/\bCREATE\s+(OR\s+REPLACE\s+)?VIEW\s+\w+\s+SELECT\b/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: CREATE VIEW missing AS keyword — "CREATE VIEW name AS SELECT ..."`,
        fix: 'Add AS: CREATE VIEW viewname AS SELECT ...',
      });
    }

    // ── BY without preceding GROUP or ORDER on same line
    if (/\bBY\b/i.test(stripped) && !/\b(GROUP|ORDER|PARTITION)\s+BY\b/i.test(stripped)) {
      const byIdx = upper.indexOf(' BY');
      if (byIdx >= 0) {
        const before = upper.substring(0, byIdx);
        if (!/\b(GROUP|ORDER|PARTITION)\b/.test(before)) {
          errors.push({
            type: 'error', line: lineNum, language: 'sql',
            message: `Line ${lineNum}: Standalone BY — missing GROUP, ORDER, or PARTITION before BY`,
            fix: 'Add GROUP before BY: GROUP BY column_name',
          });
        }
      }
    }

    // ── Trigger AFTER/BEFORE missing ON: AFTER DELETE salaries
    if (/\b(AFTER|BEFORE)\s+(INSERT|UPDATE|DELETE)\b/i.test(stripped)) {
      if (!/\b(AFTER|BEFORE)\s+(INSERT|UPDATE|DELETE)(\s+OF\s+\w+)?\s+ON\b/i.test(stripped)) {
        // ON might be on same line later or next line — check next two lines
        const nextLines = lines.slice(i + 1, i + 3).map(stripComments).join(' ');
        if (!/^\s*ON\b/i.test(nextLines) && !/\bON\b/i.test(stripped)) {
          errors.push({
            type: 'error', line: lineNum, language: 'sql',
            message: `Line ${lineNum}: Trigger timing clause missing ON keyword — "AFTER DELETE ON table_name FOR EACH ROW"`,
            fix: 'Add ON before the table name: AFTER DELETE ON tablename',
          });
        }
      }
    }

    // ── Duplicate table alias: FROM employees e e (exact same word twice)
    if (/\bFROM\s+\w+\s+(\w+)\s+\1\b/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: Duplicate table alias — same alias used twice after table name`,
        fix: 'Remove the duplicate alias: FROM tablename alias',
      });
    }
    // FROM table alias1 alias2 — only flag if both words are NOT SQL keywords
    const SQL_CLAUSE_WORDS = new Set([
      'JOIN','LEFT','RIGHT','INNER','OUTER','CROSS','NATURAL','FULL',
      'WHERE','ON','ORDER','GROUP','HAVING','LIMIT','OFFSET','AND','OR',
      'UNION','INTERSECT','EXCEPT','AS','SELECT','WITH','BY','PARTITION',
      'USING','SET','INTO','VALUES','RETURNING','FETCH',
    ]);
    const dupAlias = stripped.match(/\bFROM\s+(\w+)\s+(\w+)\s+(\w+)\b/i);
    if (dupAlias) {
      const [, , a1, a2] = dupAlias;
      if (!SQL_CLAUSE_WORDS.has(a1.toUpperCase()) && !SQL_CLAUSE_WORDS.has(a2.toUpperCase())) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: Possible duplicate alias — table followed by two plain identifiers; each table should have only one alias`,
          fix: `Use single alias: FROM tablename alias`,
        });
      }
    }

    // ── JOIN missing ON: JOIN table alias qualified_col (no ON keyword)
    if (/\bJOIN\s+\w+\s+\w+\s+\w+\.\w+/i.test(stripped) && !/\bJOIN\s+\w+(\s+\w+)?\s+ON\b/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: JOIN appears to be missing ON keyword — "JOIN table ON a.col = b.col"`,
        fix: 'Add ON: JOIN tablename ON a.key = b.key',
      });
    }
    // Also catch: JOIN t WHERE / JOIN t then immediately =
    if (/\bJOIN\s+\w+\s+\w+\.\w+\s*=/i.test(stripped) && !/\bON\b/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: JOIN is missing the ON keyword before the join condition`,
        fix: 'Add ON: JOIN tablename alias ON a.col = b.col',
      });
    }

    // ── UPDATE SET without WHERE or comma separator: SET x = y id = z
    if (/\bUPDATE\b/i.test(stripped) && /\bSET\b/i.test(stripped)) {
      if (/\bSET\s+\w+\s*=\s*\S+\s+\w+\s*=/i.test(stripped) && !/\bWHERE\b/i.test(stripped) && !/,/.test(stripped)) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: UPDATE SET clause looks malformed — multiple assignments need commas, and filter needs WHERE keyword`,
          fix: 'Use: SET col1=val1, col2=val2 WHERE condition',
        });
      }
    }

    // ── WHERE subquery missing operator: WHERE col (SELECT...)
    if (/\bWHERE\b.+\(\s*SELECT\b/i.test(stripped)) {
      if (!/\b(IN|NOT\s+IN|=|>=|<=|!=|<>|>|<|EXISTS|ANY|ALL)\s*\(/i.test(stripped)) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: Subquery in WHERE clause missing comparison operator — use IN, EXISTS, =, etc.`,
          fix: 'Add IN before subquery: WHERE col IN (SELECT ...)',
        });
      }
    }

    // ── Invalid date format: non-ISO date in a string literal
    const dateCheck = stripped.match(/'(\d{2}-\d{4}-\d{2}|\d{4}\/\d{2}\/\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4})'/g);
    if (dateCheck) {
      dateCheck.forEach(d => {
        errors.push({
          type: 'warning', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: Possible non-standard date format ${d} — SQL standard format is 'YYYY-MM-DD'`,
          fix: "Use ISO format: '2022-01-01'",
        });
      });
    }

    // ── INSERT missing VALUES keyword: INSERT INTO t (cols)\n(vals) without VALUES
    if (/\bINSERT\s+INTO\s+\w+\s*\([^)]+\)\s*$/i.test(stripped)) {
      const nextLine = i + 1 < lines.length ? stripComments(lines[i + 1]) : '';
      if (nextLine.startsWith('(') && !/\bSELECT\b/i.test(nextLine)) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: INSERT missing VALUES keyword — "INSERT INTO t (cols) VALUES (vals)"`,
          fix: 'Add VALUES before the data parenthesis',
        });
      }
    }

    // ── CREATE FUNCTION missing RETURNS
    if (/\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+\w+/i.test(stripped)) {
      const ctx = lines.slice(i, Math.min(i + 4, lines.length)).map(stripComments).join(' ');
      if (/\bBEGIN\b/i.test(ctx) && !/\bRETURNS\b/i.test(ctx)) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: CREATE FUNCTION missing RETURNS clause — "FUNCTION name(params) RETURNS returntype BEGIN"`,
          fix: 'Add RETURNS before the return type: FUNCTION name(params) RETURNS DECIMAL(10,2)',
        });
      }
    }

    // ── AUTOIN... (truncated/partial AUTO_INCREMENT)
    if (/\bAUTOIN\b/i.test(stripped) && !/\bAUTO_INCREMENT\b/i.test(stripped) && !/\bAUTOINCREMENT\b/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: "AUTOIN" is not a valid keyword — did you mean AUTO_INCREMENT?`,
        fix: 'Use AUTO_INCREMENT: col_id INT AUTO_INCREMENT PRIMARY KEY',
      });
    }

    // ── FORM (extra typo check beyond edit-distance, catches it clearly per line)
    if (/\bFORM\b/i.test(stripped) && !/\bFORMAT\b/i.test(stripped) && !/\bFORMULA\b/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: "FORM" is not a SQL keyword — did you mean "FROM"?`,
        fix: 'Replace FORM with FROM',
      });
    }

    // ── REFERENCE (missing S → REFERENCES)
    if (/\bREFERENCE\s+\w/i.test(stripped) && !/\bREFERENCES\b/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: "REFERENCE" should be "REFERENCES" (with S) — foreign key constraint keyword`,
        fix: 'Use REFERENCES: col INT REFERENCES table(col)',
      });
    }

    // ── Missing comma in CREATE TABLE body (detect two col defs on adjacent lines)
    // This is handled in statement-level analysis
  }

  return errors;
};

// ── Statement-level structural checks ────────────────────────────────────────
// Strip -- line comments and /* block comments */ from a SQL snippet
const stripSQLComments = (sql) =>
  sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const splitIntoStatements = (code) => {
  const statements = [];
  let cur = '';
  let lineStart = 1;
  let curLine = 1;
  let inString = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '\n') curLine++;
    if (ch === "'" && !inString) { inString = true; cur += ch; continue; }
    if (ch === "'" && inString) { inString = false; cur += ch; continue; }
    if (inString) { cur += ch; continue; }
    if (ch === ';') {
      if (cur.trim()) statements.push({ stmt: cur.trim(), lineStart });
      cur = '';
      lineStart = curLine + 1;
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) statements.push({ stmt: cur.trim(), lineStart });
  return statements;
};

const countSelectColumns = (selectClause) => {
  // Count comma-separated items at depth 0 (not inside subqueries)
  let depth = 0, commas = 0;
  for (const ch of selectClause) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) commas++;
  }
  return commas + 1;
};

const checkSQLStatements = (code) => {
  const errors = [];
  const statements = splitIntoStatements(code);

  for (const { stmt, lineStart } of statements) {
    // Always work on comment-stripped text so keywords in comments don't confuse checks
    const clean = stripSQLComments(stmt);

    // ── UNION column count mismatch
    if (/\bUNION\b/i.test(clean)) {
      const parts = clean.split(/\bUNION\b(?:\s+ALL\b)?/i);
      const colCounts = parts.map(part => {
        const m = part.match(/\bSELECT\b([\s\S]+?)\bFROM\b/i);
        if (!m) return -1;
        return countSelectColumns(m[1]);
      }).filter(c => c > 0);
      if (new Set(colCounts).size > 1) {
        errors.push({
          type: 'error', line: lineStart, language: 'sql',
          message: `Line ~${lineStart}: UNION column count mismatch — each SELECT must return the same number of columns (got: ${colCounts.join(' vs ')})`,
          fix: 'Make all SELECT lists in the UNION return the same number of columns',
        });
      }
    }

    // ── CREATE TABLE: detect missing commas between column definitions
    if (/\bCREATE\s+(TEMP\w*\s+)?TABLE\b/i.test(clean)) {
      const bodyMatch = clean.match(/\bCREATE\s+(?:TEMP\w*\s+)?TABLE\s+\w+\s*\(([\s\S]+)\)/i);
      if (bodyMatch) {
        const body = bodyMatch[1];
        const bodyLines = body.split('\n');
        const dataTypeKw = /\b(INT|INTEGER|BIGINT|SMALLINT|TINYINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|MONEY|CHAR|VARCHAR|TEXT|DATE|TIME|TIMESTAMP|DATETIME|BOOLEAN|BOOL|SERIAL|BIGSERIAL|UUID|JSON|JSONB|BYTEA|INET|BIT|NVARCHAR|NCHAR)\b/i;
        const constraintKw = /^\s*(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|INDEX)\b/i;

        let lastDefIdx = -1;
        let lastEndsWithComma = true;
        const stmtLines = stmt.split('\n');
        const bodyStartLine = lineStart + stmtLines.findIndex(l => l.includes('('));

        bodyLines.forEach((bl, bi) => {
          const t = bl.trim();
          if (!t) return;
          const isColDef = dataTypeKw.test(t) && /^\s*\w+\s+/.test(t);
          const isConstraint = constraintKw.test(t);

          if (isColDef || isConstraint) {
            if (lastDefIdx >= 0 && !lastEndsWithComma) {
              const errLine = bodyStartLine + lastDefIdx + 1;
              errors.push({
                type: 'error', line: errLine, language: 'sql',
                message: `Line ~${errLine}: Missing comma after column/constraint definition in CREATE TABLE — each entry must end with a comma (except the last before ")")`,
                fix: 'Add a comma at the end of the column definition',
              });
            }
            lastDefIdx = bi;
            lastEndsWithComma = t.trim().endsWith(',');
          }
        });
      }
    }

    // ── INSERT missing VALUES: catch within statement as a whole
    if (/\bINSERT\s+INTO\s+\w+\s*\([^)]+\)\s*\(/i.test(clean)) {
      if (!/\bINSERT\s+INTO\s+\w+\s*\([^)]+\)\s+VALUES\s*\(/i.test(clean) &&
          !/\bINSERT\s+INTO\s+\w+\s*\([^)]+\)\s+SELECT\b/i.test(clean)) {
        errors.push({
          type: 'error', line: lineStart, language: 'sql',
          message: `Line ~${lineStart}: INSERT missing VALUES keyword — "INSERT INTO t (cols) VALUES (vals)"`,
          fix: 'Add VALUES before the data parenthesis',
        });
      }
    }

    // ── HAVING without GROUP BY — use comment-stripped text so "Error (HAVING without GROUP BY)" in comments doesn't confuse the check
    if (/\bHAVING\b/i.test(clean) && !/\bGROUP\s+BY\b/i.test(clean)) {
      errors.push({
        type: 'error', line: lineStart, language: 'sql',
        message: `Line ~${lineStart}: HAVING clause used without GROUP BY — HAVING filters groups and requires GROUP BY`,
        fix: 'Add GROUP BY before HAVING, or replace HAVING with WHERE',
      });
    }

    // ── CASE without END (per-statement, comment-stripped)
    const stmtCaseCount = (clean.match(/\bCASE\b/gi) || []).length;
    const stmtEndCount  = (clean.match(/\bEND\b/gi)  || []).length;
    const stmtBeginCount = (clean.match(/\bBEGIN\b/gi) || []).length;
    // END keywords must cover CASE blocks; BEGIN/END pairs absorb one END each
    if (stmtCaseCount > 0 && stmtCaseCount > stmtEndCount - stmtBeginCount) {
      const missing = stmtCaseCount - (stmtEndCount - stmtBeginCount);
      if (missing > 0) {
        errors.push({
          type: 'error', line: lineStart, language: 'sql',
          message: `Line ~${lineStart}: CASE expression missing END — ${stmtCaseCount} CASE but only ${stmtEndCount - stmtBeginCount} unmatched END keyword${missing > 1 ? 's' : ''}`,
          fix: 'Add END after each CASE block: CASE WHEN ... THEN ... ELSE ... END',
        });
      }
    }
  }

  return errors;
};

// ── Global balance checks ─────────────────────────────────────────────────────
const checkGlobalBalance = (code) => {
  const errors = [];

  // Parentheses balance (tracking per-line for better line numbers)
  let depth = 0;
  const codeLines = code.split('\n');
  let totalOpen = 0, totalClose = 0;

  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i];
    let inStr = false;
    // skip comments
    if (line.trim().startsWith('--')) continue;
    for (const ch of line) {
      if (ch === "'") { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '(') totalOpen++;
      else if (ch === ')') totalClose++;
    }
  }
  if (totalOpen !== totalClose) {
    errors.push({
      type: 'error', language: 'sql',
      message: `Unmatched parentheses: ${totalOpen} opening vs ${totalClose} closing — ${Math.abs(totalOpen - totalClose)} ${totalOpen > totalClose ? 'unclosed "("' : 'extra ")"'}`,
      fix: totalOpen > totalClose ? `Add ${totalOpen - totalClose} closing parenthesis/es ")"` : `Remove ${totalClose - totalOpen} extra closing parenthesis/es ")"`,
    });
  }

  // Single-quote balance (skipping comment lines)
  const strippedCode = codeLines.map(l => l.trim().startsWith('--') ? '' : l).join('\n');
  const singleQ = (strippedCode.match(/'/g) || []).length;
  if (singleQ % 2 !== 0) {
    errors.push({ type: 'error', language: 'sql', message: 'Unmatched single quote — a string literal is not closed' });
  }

  // CASE / END balance
  const caseCount = (code.match(/\bCASE\b/gi) || []).length;
  const endCount = (code.match(/\bEND\b/gi) || []).length;
  if (caseCount > endCount) {
    errors.push({
      type: 'error', language: 'sql',
      message: `CASE without END: ${caseCount} CASE expression${caseCount > 1 ? 's' : ''} but only ${endCount} END keyword${endCount !== 1 ? 's' : ''} — missing ${caseCount - endCount} END`,
      fix: 'Add END after each CASE block: CASE WHEN ... THEN ... END',
    });
  }
  if (endCount > caseCount + (code.match(/\bBEGIN\b/gi) || []).length) {
    errors.push({
      type: 'warning', language: 'sql',
      message: `More END keywords (${endCount}) than CASE/BEGIN blocks — possible extra END`,
    });
  }

  return errors;
};

// ── Miscellaneous SQL pattern checks (with fix suggestions) ───────────────────
const SQL_ADVISORY_PATTERNS = [
  { re: /WHERE\s*\w+\s*=\s*NULL\b/i, msg: 'Use IS NULL instead of = NULL (NULL comparisons always return false with =)', fix: 'Replace = NULL with IS NULL' },
  { re: /WHERE\s*\w+\s*!=\s*NULL\b/i, msg: 'Use IS NOT NULL instead of != NULL', fix: 'Replace != NULL with IS NOT NULL' },
  { re: /SELECT\s+\*\b.*JOIN\b/i, msg: 'SELECT * with JOINs is ambiguous and slow — specify only the columns you need', fix: 'List explicit columns' },
  { re: /\bLIMIT\s+\d+\s*,\s*\d+\b/i, msg: 'MySQL LIMIT offset,count syntax — use "LIMIT n OFFSET m" for standard SQL', fix: 'Use LIMIT n OFFSET m' },
  { re: /\bTOP\s+\d+\b/i, msg: 'TOP N is T-SQL (SQL Server) syntax — use LIMIT in standard SQL / PostgreSQL', fix: 'Replace TOP N with LIMIT N at the end of the query' },
  { re: /\[\w+\]/g, msg: 'Square bracket identifiers are SQL Server syntax — use double quotes in standard SQL', fix: 'Replace [col] with "col"' },
  { re: /`\w+`/g, msg: 'Backtick identifiers are MySQL syntax — use double quotes in standard SQL', fix: 'Replace `col` with "col"' },
  { re: /NOT\s+IN\s*\(\s*SELECT/i, msg: 'NOT IN with subquery can produce wrong results if subquery returns NULL — prefer NOT EXISTS or LEFT JOIN ... IS NULL', fix: 'Use NOT EXISTS or LEFT JOIN approach' },
  { re: /ORDER\s+BY\s+\d+\b/i, msg: 'ORDER BY column position number is fragile — changing column order breaks the query', fix: 'Use the column name: ORDER BY col_name' },
  { re: /LIKE\s+['"]%/i, msg: 'Leading wildcard LIKE "%..." prevents index use — very slow on large tables', fix: 'Avoid leading wildcard if possible, or use full-text search' },
  { re: /SELECT\s+DISTINCT\s+\*/i, msg: 'SELECT DISTINCT * is expensive — DISTINCT checks all columns. Specify only the columns you need', fix: 'List specific columns: SELECT DISTINCT col1, col2' },
];

const checkAdvisoryPatterns = (code, lines) => {
  const errors = [];
  for (const p of SQL_ADVISORY_PATTERNS) {
    const re = new RegExp(p.re.source, 'gi');
    const match = re.exec(code);
    if (match) {
      const lineNum = code.substring(0, match.index).split('\n').length;
      errors.push({ type: 'warning', line: lineNum, language: 'sql', message: `Line ${lineNum}: ${p.msg}`, fix: p.fix });
    }
  }
  return errors;
};

// ── Master SQL analysis function ──────────────────────────────────────────────
const analyzeSQL = (code) => {
  const lines = code.split('\n');
  const allErrors = [];

  // 1. Keyword typo detection (expanded keyword + datatype list)
  allErrors.push(...findSQLTypos(code, lines));

  // 2. Line-by-line structural checks
  allErrors.push(...checkSQLLines(lines));

  // 3. Statement-level structural checks
  allErrors.push(...checkSQLStatements(code));

  // 4. Global balance checks (parens, quotes, CASE/END, HAVING)
  allErrors.push(...checkGlobalBalance(code));

  // 5. Advisory patterns (best-practice warnings)
  allErrors.push(...checkAdvisoryPatterns(code, lines));

  // Deduplicate (same message + line)
  const seen = new Set();
  const errors = allErrors.filter(e => {
    const key = `${e.message}:${e.line || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by line number
  errors.sort((a, b) => (a.line || 9999) - (b.line || 9999));

  const fixed = null; // Multi-statement scripts not auto-fixed to avoid corruption
  return { errors, fixed, suggestions: generateSQLSuggestions(code) };
};

// ── Python analysis ───────────────────────────────────────────────────────────
const PYTHON_PATTERNS = [
  { re: /print\s+[^(]/, msg: 'Python 3 requires parentheses: print()', fix: c => c.replace(/\bprint\s+([^()\n]+)/g, 'print($1)') },
  { re: /^\s*(if|for|while|def|class|with|try|except|elif|else|finally)[^:]*$(?!:)/m, msg: 'Missing colon at end of block statement (if/for/while/def/class)', fix: c => c },
  { re: /==['"](True|False|None)['"]/g, msg: 'Comparing == to string "True"/"False"/"None" — use boolean True/False/None literals', fix: c => c.replace(/==["'](True)["']/g, '== True').replace(/==["'](False)["']/g, '== False').replace(/==["'](None)["']/g, 'is None') },
  { re: /\bexcept\s*:/m, msg: 'Bare except: catches all exceptions including SystemExit — use except Exception:', fix: c => c.replace(/\bexcept\s*:/g, 'except Exception:') },
  { re: /\brange\s*\(\s*len\s*\(/g, msg: 'Avoid range(len(x)) — iterate directly: for item in x', fix: c => c },
  { re: /import \*/, msg: 'Wildcard imports (import *) pollute namespace — import specific names', fix: c => c },
  { re: /\bxrange\b/, msg: 'xrange does not exist in Python 3 — use range()', fix: c => c.replace(/\bxrange\b/g, 'range') },
  { re: /\bdict\.has_key\b/, msg: '.has_key() removed in Python 3 — use "key in dict"', fix: c => c.replace(/(\w+)\.has_key\(([^)]+)\)/g, '$2 in $1') },
  { re: /==\s*None\b/g, msg: 'Use "is None" instead of "== None"', fix: c => c.replace(/==\s*None\b/g, 'is None') },
  { re: /!=\s*None\b/g, msg: 'Use "is not None" instead of "!= None"', fix: c => c.replace(/!=\s*None\b/g, 'is not None') },
  { re: /\bexecfile\b/, msg: 'execfile() removed in Python 3 — use exec(open("file").read())', fix: c => c.replace(/\bexecfile\s*\(([^)]+)\)/g, 'exec(open($1).read())') },
  { re: /\breadlines\(\)/, msg: 'readlines() loads entire file — consider iterating file directly for large files', fix: c => c },
  { re: /global\s+\w+/, msg: 'Global variables are an anti-pattern — consider returning values or using classes', fix: c => c },
  { re: /\bdf\[([^\]]+)\]\s*=\s*df\[([^\]]+)\]\.apply\(lambda/, msg: 'apply(lambda) is slow — consider vectorized operations with numpy or pandas built-ins', fix: c => c },
];

const analyzePython = (code) => {
  const errors = [];
  let fixed = code;
  const lines = code.split('\n');
  for (const p of PYTHON_PATTERNS) {
    if (p.re.test(code)) {
      const match = code.match(p.re);
      const lineNum = match ? code.substring(0, match.index).split('\n').length : null;
      errors.push({ type: 'warning', message: lineNum ? `Line ${lineNum}: ${p.msg}` : p.msg, language: 'python', line: lineNum });
      if (p.fix) fixed = p.fix(fixed);
    }
  }
  lines.forEach((line, i) => {
    const indent = line.match(/^(\s+)/)?.[1];
    if (indent && indent.includes('\t') && indent.includes(' ')) {
      errors.push({ type: 'error', message: `Line ${i+1}: Mixed tabs and spaces — use spaces only (PEP 8)`, language: 'python', line: i+1 });
    }
  });
  return { errors, fixed: fixed !== code ? fixed : null, suggestions: generatePythonSuggestions(code) };
};

// ── R analysis ────────────────────────────────────────────────────────────────
const R_PATTERNS = [
  { re: /=\s*function\s*\(/, msg: 'In R, use <- for function assignment: myFn <- function()', fix: c => c.replace(/(\w+)\s*=\s*(function\s*\()/g, '$1 <- $2') },
  { re: /\bT\b(?!\w)/, msg: '"T" can be overwritten in R — use TRUE instead', fix: c => c.replace(/\bT\b/g, 'TRUE') },
  { re: /\bF\b(?!\w)/, msg: '"F" can be overwritten in R — use FALSE instead', fix: c => c.replace(/\bF\b/g, 'FALSE') },
  { re: /==\s*NULL\b/g, msg: 'Use is.null() to check for NULL in R, not ==', fix: c => c.replace(/(\w+)\s*==\s*NULL\b/g, 'is.null($1)') },
  { re: /==\s*NA\b/g, msg: 'Use is.na() to check for NA in R, not ==', fix: c => c.replace(/(\w+)\s*==\s*NA\b/g, 'is.na($1)') },
  { re: /\bsetwd\b/, msg: 'Avoid setwd() in scripts — use here::here() or relative paths', fix: c => c },
  { re: /\battach\s*\(/, msg: 'Avoid attach() — it pollutes global namespace, use $ notation instead', fix: c => c },
  { re: /\bfor\s*\(\w+\s+in\s+1:nrow/, msg: 'Avoid row-by-row loops — use apply() or vectorized dplyr/data.table operations', fix: c => c },
  { re: /1:length\(/, msg: 'Avoid 1:length(x) — use seq_along(x) which is safe with zero-length vectors', fix: c => c.replace(/1:length\(([^)]+)\)/g, 'seq_along($1)') },
  { re: /1:nrow\(/, msg: 'Avoid 1:nrow(x) — use seq_len(nrow(x)) which handles zero rows safely', fix: c => c.replace(/1:nrow\(([^)]+)\)/g, 'seq_len(nrow($1))') },
  { re: /\bsapply\b/, msg: 'sapply() can return different types — use lapply() + explicit coercion for stable output', fix: c => c },
  { re: /library\s*\(\s*["']/, msg: 'library() accepts unquoted names — prefer library(pkg) over library("pkg")', fix: c => c.replace(/library\s*\(\s*["']([^"']+)["']\s*\)/g, 'library($1)') },
];

const analyzeR = (code) => {
  const errors = [];
  let fixed = code;
  for (const p of R_PATTERNS) {
    if (p.re.test(code)) {
      const match = code.match(p.re);
      const lineNum = match ? code.substring(0, match.index).split('\n').length : null;
      errors.push({ type: 'warning', message: lineNum ? `Line ${lineNum}: ${p.msg}` : p.msg, language: 'r', line: lineNum });
      if (p.fix) fixed = p.fix(fixed);
    }
  }
  const usedPkgs = [];
  if (/ggplot\b/.test(code) && !/library\(ggplot2\)/.test(code)) usedPkgs.push('ggplot2');
  if (/\b(mutate|filter|select|group_by|summarise|arrange)\b/.test(code) && !/library\(dplyr\)/.test(code)) usedPkgs.push('dplyr');
  if (/\bdata\.table\b/.test(code) && !/library\(data\.table\)/.test(code)) usedPkgs.push('data.table');
  if (/\bstr_/.test(code) && !/library\(stringr\)/.test(code)) usedPkgs.push('stringr');
  if (usedPkgs.length) errors.push({ type: 'warning', message: `Possible missing library() calls for: ${usedPkgs.join(', ')}`, language: 'r', fix: usedPkgs.map(p => `library(${p})`).join('\n') });
  return { errors, fixed: fixed !== code ? fixed : null, suggestions: generateRSuggestions(code) };
};

// ── Suggestion generators ─────────────────────────────────────────────────────
const generateSQLSuggestions = (code) => {
  const s = [];
  if (/SELECT\s+\*/i.test(code) && /JOIN\b/i.test(code)) s.push('SELECT * with JOINs is slow and ambiguous — specify only the columns you need');
  if (/LIKE\s+['"]%/i.test(code)) s.push('Leading wildcard in LIKE "%..." disables index lookups — avoid on large tables');
  if (/ORDER\s+BY\b/i.test(code) && !/LIMIT\b/i.test(code)) s.push('ORDER BY without LIMIT sorts all rows — add LIMIT for exploratory queries');
  if (/NOT\s+IN\s*\(/i.test(code)) s.push('NOT IN with subquery fails silently when subquery returns NULL — prefer NOT EXISTS or LEFT JOIN');
  if (!s.length) {
    s.push('Query structure looks syntactically correct');
    s.push('Consider adding column aliases (AS) to improve readability');
    s.push('Use consistent keyword casing (all uppercase SQL keywords is conventional)');
  }
  return s;
};

const generatePythonSuggestions = (code) => {
  const s = [];
  if (!/\bif\s+__name__\s*==/.test(code) && /\bdef\b/.test(code)) s.push('Add if __name__ == "__main__": guard for scripts with functions');
  if (/\bopen\s*\(/.test(code) && !/\bwith\s+open\b/.test(code)) s.push('Use "with open(...) as f:" context manager to ensure files are closed');
  if (/\+\s*str\s*\(/.test(code)) s.push('Use f-strings instead of string concatenation: f"value={x}" is cleaner and faster');
  if (/\.append\(/.test(code)) s.push('Consider list comprehensions instead of append() loops for better performance');
  if (!s.length) s.push('Code looks clean', 'Consider adding type hints to functions', 'Use docstrings to document function behavior');
  return s;
};

const generateRSuggestions = (code) => {
  const s = [];
  if (/for\s*\(/.test(code)) s.push('R is vectorized — replace loops with apply(), purrr::map(), or dplyr where possible');
  if (/\$/.test(code) && !/\bwith\b/.test(code)) s.push('Consider using dplyr to avoid repeated $ access');
  if (!s.length) s.push('Code structure looks reasonable', 'Consider tidyverse for consistent readable data manipulation', 'Use styler::style_text() to auto-format R code');
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

    res.json({
      language: lang,
      errorCount: result.errors.length,
      errors: result.errors,
      suggestions: result.suggestions,
      fixedCode: result.fixed,
      isClean: result.errors.length === 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM syntax_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const SQL_TEMPLATES = [
  { name: 'Basic SELECT', code: 'SELECT column1, column2\nFROM table_name\nWHERE condition = true\nORDER BY column1 ASC\nLIMIT 100;' },
  { name: 'Aggregation with GROUP BY', code: 'SELECT category, COUNT(*) AS count, SUM(value) AS total, AVG(value) AS avg_value\nFROM table_name\nGROUP BY category\nHAVING COUNT(*) > 5\nORDER BY total DESC;' },
  { name: 'Window Function', code: 'SELECT name, value,\n  SUM(value) OVER (PARTITION BY category ORDER BY date) AS running_total,\n  ROW_NUMBER() OVER (PARTITION BY category ORDER BY value DESC) AS rank\nFROM table_name;' },
  { name: 'CTE (Common Table Expression)', code: 'WITH summary AS (\n  SELECT category, AVG(value) AS avg_val\n  FROM table_name\n  GROUP BY category\n)\nSELECT d.*, s.avg_val\nFROM table_name d\nJOIN summary s ON d.category = s.category\nWHERE d.value > s.avg_val;' },
  { name: 'Time-series monthly', code: "SELECT DATE_TRUNC('month', date_column) AS month,\n  COUNT(*) AS records,\n  SUM(value) AS total\nFROM table_name\nGROUP BY DATE_TRUNC('month', date_column)\nORDER BY month;" },
  { name: 'CREATE TABLE with constraints', code: "CREATE TABLE orders (\n  order_id INT PRIMARY KEY,\n  customer_id INT NOT NULL REFERENCES customers(id),\n  order_date DATE DEFAULT CURRENT_DATE,\n  amount DECIMAL(10,2) CHECK (amount > 0),\n  status VARCHAR(20) DEFAULT 'pending'\n);" },
  { name: 'LEFT JOIN with NULL check', code: 'SELECT a.id, a.name, b.value\nFROM table_a a\nLEFT JOIN table_b b ON a.id = b.ref_id\nWHERE b.ref_id IS NULL  -- rows in a with no match in b\nORDER BY a.id;' },
];

const PYTHON_TEMPLATES = [
  { name: 'Pandas EDA', code: 'import pandas as pd\nimport numpy as np\n\ndf = pd.read_csv("data.csv")\nprint(df.shape)\nprint(df.dtypes)\nprint(df.describe())\nprint(df.isnull().sum())\nprint(df.corr(numeric_only=True))' },
  { name: 'Data Cleaning', code: "import pandas as pd\n\ndf = pd.read_csv('data.csv')\ndf = df.drop_duplicates()\ndf['numeric_col'].fillna(df['numeric_col'].median(), inplace=True)\ndf['category_col'].fillna('Unknown', inplace=True)\nQ1, Q3 = df['value'].quantile([0.25, 0.75])\nIQR = Q3 - Q1\ndf = df[(df['value'] >= Q1 - 1.5*IQR) & (df['value'] <= Q3 + 1.5*IQR)]" },
  { name: 'Sklearn Pipeline', code: 'from sklearn.pipeline import Pipeline\nfrom sklearn.preprocessing import StandardScaler\nfrom sklearn.ensemble import RandomForestClassifier\nfrom sklearn.model_selection import train_test_split\n\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\npipeline = Pipeline([\n    ("scaler", StandardScaler()),\n    ("model", RandomForestClassifier(n_estimators=100, random_state=42)),\n])\npipeline.fit(X_train, y_train)\nprint(f"Accuracy: {pipeline.score(X_test, y_test):.3f}")' },
];

const R_TEMPLATES = [
  { name: 'tidyverse EDA', code: 'library(tidyverse)\n\ndf <- read_csv("data.csv")\nglimpse(df)\nsummary(df)\n\ndf |> select(where(is.numeric)) |> cor(use = "complete.obs")' },
  { name: 'dplyr Aggregation', code: 'library(dplyr)\n\nresult <- df |>\n  filter(!is.na(value_col)) |>\n  group_by(category) |>\n  summarise(\n    n = n(),\n    mean_val = mean(value_col),\n    sd_val = sd(value_col),\n    .groups = "drop"\n  ) |>\n  arrange(desc(mean_val))' },
  { name: 'ggplot2 Chart', code: 'library(ggplot2)\n\ndf |>\n  ggplot(aes(x = x_col, y = y_col, color = category)) +\n  geom_point(alpha = 0.7) +\n  geom_smooth(method = "lm", se = TRUE) +\n  labs(title = "Scatter Plot", x = "X", y = "Y") +\n  theme_minimal()' },
];

router.get('/templates', authenticate, (req, res) => {
  const lang = (req.query.language || 'sql').toLowerCase();
  const map = { sql: SQL_TEMPLATES, python: PYTHON_TEMPLATES, py: PYTHON_TEMPLATES, r: R_TEMPLATES };
  res.json(map[lang] || SQL_TEMPLATES);
});

router.get('/templates/:language', authenticate, (req, res) => {
  const lang = req.params.language.toLowerCase();
  const map = { sql: SQL_TEMPLATES, python: PYTHON_TEMPLATES, py: PYTHON_TEMPLATES, r: R_TEMPLATES };
  res.json(map[lang] || SQL_TEMPLATES);
});

module.exports = router;
