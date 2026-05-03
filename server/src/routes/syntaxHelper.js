const express = require('express');
const https = require('https');
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
  // ── PostgreSQL-specific DDL keywords (prevent false typo hits on pg_dump output) ──
  'OWNED','READ','WRITE','UNCOMMITTED','COMMITTED','REPEATABLE','SERIALIZABLE',
  'HEAP','ACCESS','METHOD','CACHE','MINVALUE','MAXVALUE','INCREMENT','CYCLE',
  'NOCYCLE','RESTART','TABLESPACE','ROLE','LOGIN','NOLOGIN','SUPERUSER',
  'NOSUPERUSER','INHERIT','NOINHERIT','CREATEDB','NOCREATEDB','CREATEROLE',
  'NOCREATEROLE','REPLICATION','NOREPLICATION','BYPASSRLS','NOBYPASSRLS',
  'ENCRYPTED','UNENCRYPTED','PASSWORD','CONCURRENTLY','VACUUM','ANALYZE',
  'FREEZE','VERBOSE','CATALOG','PUBLIC','CONFIGURATION','WRAPPER','SERVER',
  'MAPPING','EXTENSION','PUBLICATION','SUBSCRIPTION','POLICY','RULE',
  'OPERATOR','AGGREGATE','CONVERSION','DOMAIN','TYPE','RANGE','ENUM',
  'COMMENTS','SECURITY','DEFINER','INVOKER','COST','ROWS','STABLE',
  'VOLATILE','IMMUTABLE','STRICT','CALLED','PARALLEL','SAFE','UNSAFE',
  'RESTRICTED','WINDOW','LEAKPROOF','NOLEAKPROOF','EXTERNAL','SIMPLE',
  'PARTIAL','FULL','EXCLUSION','INCLUDE','WHERE','ATTACH','DETACH',
  'INHERIT','FOR','TO','NO','START','OWNED','NOTHING','CONFLICT',
  'FORCE','WITHOUT','LOGGED','UNLOGGED','GLOBAL','LOCAL','MATCHED',
  'EXCLUDED','RESET','SHOW','LISTEN','UNLISTEN','NOTIFY','COPY','FORMAT',
  'CSV','BINARY','HEADER','DELIMITER','QUOTE','ESCAPE','FORCE_QUOTE',
  'FORCE_NOT_NULL','FORCE_NULL','ENCODING','NULL','PROGRAM','STDIN','STDOUT',
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
      const rawPat = ((stripped.match(/\bLIKE\s+(\S+)/i) || [])[1] || 'A%').replace(/[;,)\s]+$/, '');
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: SyntaxError — LIKE pattern "${rawPat}" must be a quoted string; unquoted patterns are not valid SQL — use LIKE '${rawPat}'`,
        fix: `Wrap the pattern in single quotes: LIKE '${rawPat}'`,
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

    // ── BY without preceding GROUP, ORDER, PARTITION, or other valid DDL keyword
    // Valid BY contexts: GROUP BY, ORDER BY, PARTITION BY, OWNED BY, CREATED BY,
    //   AUTHORIZED BY, SORT BY, SET ROLE … BY, FOLLOWED BY, pg_dump constructs, etc.
    if (/\bBY\b/i.test(stripped) && !/\b(GROUP|ORDER|PARTITION)\s+BY\b/i.test(stripped)) {
      const byIdx = upper.indexOf(' BY');
      if (byIdx >= 0) {
        const before = upper.substring(0, byIdx);
        // Allow any of these words directly before BY
        const validPreceding = /\b(GROUP|ORDER|PARTITION|OWNED|CREATED|AUTHORIZED|SORTED|INDEXED|FOLLOWED|WRITTEN|REPLACED|TRIGGERED|GENERATED|STORED|LOGGED|ISSUED|GIVEN|SET|SORT|CLUSTER|DISTRIBUTE)\b/;
        if (!validPreceding.test(before)) {
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

    // ── IN (table WHERE ...) — subquery missing SELECT keyword
    if (/\bIN\s*\(\s*\w+\s+WHERE\b/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: Subquery missing SELECT — use IN (SELECT col FROM table WHERE ...)`,
        fix: 'Add SELECT: IN (SELECT col FROM table WHERE condition)',
      });
    }

    // ── EXISTS bare identifier (not a subquery, not IF EXISTS)
    // Catches:  WHERE EXISTS employees;   WHERE EXISTS employees AND ...
    // Excludes: IF EXISTS name  (DROP TABLE IF EXISTS foo)
    //           EXISTS (SELECT ...)  (correct usage)
    if (
      /\bEXISTS\s+(?!\s*\()\w+/i.test(stripped) &&
      !/\bIF\s+EXISTS\b/i.test(stripped)
    ) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: EXISTS requires a subquery — use EXISTS (SELECT 1 FROM table WHERE ...)`,
        fix: 'Add subquery: EXISTS (SELECT 1 FROM table WHERE condition)',
      });
    }

    // ── DROP bare identifier with no object-type keyword: DROP company; / DROP emp_view;
    // Valid pattern:  DROP TABLE|VIEW|INDEX|SCHEMA|DATABASE|FUNCTION|PROCEDURE|TRIGGER ...
    // Invalid pattern: DROP some_name;  (missing the object-type keyword entirely)
    if (/^\s*DROP\s+\w+\s*;?\s*$/i.test(stripped)) {
      const OBJECT_TYPES = /^(TABLE|VIEW|INDEX|SCHEMA|DATABASE|FUNCTION|PROCEDURE|TRIGGER|COLUMN|CONSTRAINT|IF|TEMPORARY|TEMP|UNIQUE|MATERIALIZED|SEQUENCE|TYPE|DOMAIN|ROLE|USER|TABLESPACE|EXTENSION|PUBLICATION|SUBSCRIPTION)$/i;
      const tokens = stripped.trim().replace(/;$/, '').split(/\s+/);
      // tokens[0]=DROP, tokens[1]=first word after DROP
      if (tokens.length === 2 && !OBJECT_TYPES.test(tokens[1])) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: DROP "${tokens[1]}" is missing the object-type keyword — use DROP TABLE, DROP VIEW, DROP SCHEMA, etc.`,
          fix: `Specify object type: DROP TABLE ${tokens[1]}  (or DROP VIEW / DROP SCHEMA)`,
        });
      }
    }

    // ── ALTER TABLE missing COLUMN keyword: ALTER TABLE t DROP bonus
    if (/\bALTER\s+TABLE\s+\w+\s+(DROP|ADD|MODIFY)\s+(?!COLUMN\b)\w+/i.test(stripped)) {
      const kw = (stripped.match(/\b(DROP|ADD|MODIFY)\b/i) || [])[1] || '';
      // Only flag DROP/MODIFY — ADD is sometimes valid without COLUMN
      if (/\b(DROP|MODIFY)\b/i.test(kw)) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: ALTER TABLE ${kw} may be missing COLUMN keyword — use ALTER TABLE t ${kw} COLUMN col_name`,
          fix: `Add COLUMN: ALTER TABLE tablename ${kw} COLUMN column_name`,
        });
      }
    }

    // ── ALTER TABLE RENAME missing COLUMN keyword
    // Valid:  ALTER TABLE t RENAME COLUMN old TO new   (rename a column)
    // Valid:  ALTER TABLE t RENAME TO new_name          (rename the table itself)
    // Error:  ALTER TABLE t RENAME old TO new           (missing COLUMN)
    if (/\bALTER\s+TABLE\s+\w+\s+RENAME\b/i.test(stripped)) {
      if (!/\bALTER\s+TABLE\s+\w+\s+RENAME\s+(COLUMN\b|TO\b)/i.test(stripped)) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: ALTER TABLE RENAME missing COLUMN keyword — use "ALTER TABLE t RENAME COLUMN old_name TO new_name" to rename a column`,
          fix: 'Add COLUMN: ALTER TABLE tablename RENAME COLUMN old_name TO new_name',
        });
      }
    }

    // ── CREATE SCHEMA with no name: CREATE SCHEMA;
    if (/\bCREATE\s+SCHEMA\s*;/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: CREATE SCHEMA requires a name — CREATE SCHEMA schema_name`,
        fix: 'Add schema name: CREATE SCHEMA my_schema',
      });
    }

    // ── UPDATE missing comma between SET assignments (col=val col2=val2 no comma)
    if (/\bSET\b/i.test(stripped) && /\bUPDATE\b/i.test(stripped)) {
      const setMatch = stripped.match(/\bSET\s+(.+?)(?:\bWHERE\b|$)/i);
      if (setMatch) {
        const setClause = setMatch[1];
        if (/\w+\s*=\s*[^,\s]+\s+\w+\s*=/.test(setClause) && !setClause.includes(',')) {
          errors.push({
            type: 'error', line: lineNum, language: 'sql',
            message: `Line ${lineNum}: UPDATE SET clause missing comma between assignments`,
            fix: 'Separate assignments with commas: SET col1=val1, col2=val2',
          });
        }
      }
    }

    // ── DROP TABLE / DROP INDEX missing table/index name: just DROP TABLE;
    if (/\bDROP\s+(TABLE|INDEX|VIEW|DATABASE|SCHEMA)\s*;/i.test(stripped)) {
      const what = (stripped.match(/\bDROP\s+(TABLE|INDEX|VIEW|DATABASE|SCHEMA)\b/i) || [])[1] || '';
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: DROP ${what.toUpperCase()} missing name — DROP ${what.toUpperCase()} object_name`,
        fix: `Add name: DROP ${what.toUpperCase()} your_${what.toLowerCase()}_name`,
      });
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

    // ── Extra closing paren in INSERT column list: INSERT INTO t (a, b)) VALUES ...
    if (/\bINSERT\s+INTO\s+\w+\s*\([^)]+\)\s*\)/i.test(stripped)) {
      errors.push({
        type: 'error', line: lineNum, language: 'sql',
        message: `Line ${lineNum}: Extra closing parenthesis ")" after INSERT column list — column list should be "(col1, col2)" not "(col1, col2))"`,
        fix: 'Remove the extra ")": INSERT INTO tablename (col1, col2) VALUES (...)',
      });
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

    // ── Unterminated string literal (odd number of unescaped single quotes) ────
    {
      let inStr = false;
      for (let ci = 0; ci < stripped.length; ci++) {
        const ch = stripped[ci];
        if (ch === "'" ) {
          if (inStr && stripped[ci + 1] === "'") { ci++; continue; } // escaped ''
          inStr = !inStr;
        }
      }
      if (inStr) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: Unterminated string literal — the single-quoted string was opened but never closed`,
          fix: "Add the matching closing single quote: WHERE name = 'value'",
        });
      }
    }

    // ── Unclosed parenthesis on this line (only flag simple single-line expressions) ─
    if (!/^\s*(SELECT|FROM|WHERE|JOIN|GROUP|ORDER|HAVING|UNION|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WITH)\b/i.test(stripped)) {
      const opens = (stripped.match(/\(/g) || []).length - (stripped.match(/\)/g) || []).length;
      if (opens > 0) {
        errors.push({
          type: 'error', line: lineNum, language: 'sql',
          message: `Line ${lineNum}: Unclosed parenthesis — ${opens} opening "(" without a matching ")"`,
          fix: 'Add the missing closing parenthesis',
        });
      }
    }
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

  // ── Pre-pass: extract column names from CREATE TABLE statements for column-ref validation
  const tableSchemas = {}; // tableName (lower) → Set<colName (lower)>
  const skipColKw = new Set(['primary','foreign','unique','check','constraint','index','key']);
  const ctRe = /CREATE\s+(?:TEMP\w*\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]+?)\)\s*;/gi;
  let ctm;
  while ((ctm = ctRe.exec(code)) !== null) {
    const tbl = ctm[1].toLowerCase();
    const body = ctm[2];
    const cols = new Set();
    body.split('\n').forEach(bl => {
      const t = bl.trim().replace(/,\s*$/, '');
      const colMatch = t.match(/^(\w+)\s+\w/);
      if (colMatch) {
        const col = colMatch[1].toLowerCase();
        if (!skipColKw.has(col)) cols.add(col);
      }
    });
    if (cols.size > 0) tableSchemas[tbl] = cols;
  }

  for (let si = 0; si < statements.length; si++) {
    const { stmt, lineStart } = statements[si];
    // Always work on comment-stripped text so keywords in comments don't confuse checks
    const clean = stripSQLComments(stmt);

    // ── Invalid column reference in WHERE clause (validated against CREATE TABLE schema)
    // Covers: DELETE FROM t WHERE col = val  /  UPDATE t SET ... WHERE col = val
    const whereColCheck = clean.match(/\b(?:DELETE\s+FROM|UPDATE)\s+(\w+)\b[\s\S]*?\bWHERE\s+(\w+)\s*[=<>!]/i);
    if (whereColCheck) {
      const tblName = whereColCheck[1].toLowerCase();
      const colName = whereColCheck[2].toLowerCase();
      const knownCols = tableSchemas[tblName];
      if (knownCols && !knownCols.has(colName)) {
        errors.push({
          type: 'error', line: lineStart, language: 'sql',
          message: `Line ~${lineStart}: Column "${colName}" does not exist in table "${whereColCheck[1]}" — known columns: ${[...knownCols].join(', ')}`,
          fix: `Use a valid column from "${whereColCheck[1]}": ${[...knownCols].join(', ')}`,
        });
      }
    }

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

    // ── Trigger body: BEGIN without matching END
    if (/\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b/i.test(clean)) {
      const hasBegin   = /\bBEGIN\b/i.test(clean);
      const hasEnd     = /\bEND\b/i.test(clean);
      const forEachRow = /\bFOR\s+EACH\s+ROW\b/i.test(clean);

      if (hasBegin && !hasEnd) {
        // Peek ahead: if the VERY next statement is just "END" the splitter split the trigger — not a real error
        const nextClean = si + 1 < statements.length
          ? stripSQLComments(statements[si + 1].stmt).trim()
          : '';
        const nextIsEnd = /^END\s*;?\s*$/i.test(nextClean);
        if (!nextIsEnd) {
          errors.push({
            type: 'error', line: lineStart, language: 'sql',
            message: `Line ~${lineStart}: Trigger body has BEGIN but no matching END — trigger block must be closed with END;`,
            fix: 'Add END; after the last statement in the trigger body',
          });
        }
      }
    }

    // ── DROP SCHEMA/DATABASE/TABLE followed immediately by ; (no name) — already caught per-line
    // but also catch the pattern split across statements: "DROP\nSCHEMA;" etc.
    if (/^\s*DROP\s*$/i.test(clean.trim())) {
      errors.push({
        type: 'error', line: lineStart, language: 'sql',
        message: `Line ~${lineStart}: Bare DROP with no object type or name`,
        fix: 'Use: DROP TABLE name, DROP VIEW name, DROP SCHEMA name, etc.',
      });
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

  // ── Trigger with multiple statements but no BEGIN/END wrapper
  // Pattern: FOR EACH ROW <non-BEGIN statement>; <another statement>;
  // The splitter breaks these into separate stmts so we must scan the raw code.
  const triggerMultiStmt = /\bFOR\s+EACH\s+ROW\s+(?!BEGIN\b)(\w[^;]+;[^;]+;)/gi;
  let tmMatch;
  while ((tmMatch = triggerMultiStmt.exec(code)) !== null) {
    // Calculate approximate line number
    const lineNum = (code.slice(0, tmMatch.index).match(/\n/g) || []).length + 1;
    errors.push({
      type: 'error', line: lineNum, language: 'sql',
      message: `Line ~${lineNum}: Multi-statement trigger body without BEGIN ... END — FOR EACH ROW followed by multiple statements requires a BEGIN/END block`,
      fix: 'Wrap trigger body: FOR EACH ROW BEGIN stmt1; stmt2; END;',
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
// ── SQL auto-fixer ────────────────────────────────────────────────────────────
const SQL_AUTO_FIXES = [
  // Keyword typos (safe single-word replacements)
  { re: /\bFORM\b(?!\w)/g,                                            fix: 'FROM' },
  { re: /\bAUTOIN\b/ig,                                               fix: 'AUTO_INCREMENT' },
  { re: /\bREFERENCE\b(?=\s+\w)/ig,                                   fix: 'REFERENCES' },
  { re: /\bHAVING\b(?!\s)/ig,                                         fix: 'HAVING ' },
  { re: /\bLIMIT\s+TO\s+/ig,                                          fix: 'LIMIT ' },
  { re: /\bMONY\b/ig,                                                  fix: 'MONEY' },
  { re: /\bDRIP\b(?=\s+(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER)\b)/ig, fix: 'DROP' },
  { re: /\b((?:DROP|CREATE|ALTER)\s+)VIE\b(?=\s)/ig,                 fix: '$1VIEW' },
  // Boolean literals as strings → bare keywords
  { re: /\bBOOLEAN\s+DEFAULT\s+'true'/ig,                             fix: "BOOLEAN DEFAULT TRUE" },
  { re: /\bBOOLEAN\s+DEFAULT\s+'false'/ig,                            fix: "BOOLEAN DEFAULT FALSE" },
  { re: /\bBOOLEAN\s+DEFAULT\s+'yes'/ig,                              fix: "BOOLEAN DEFAULT TRUE" },
  { re: /\bBOOLEAN\s+DEFAULT\s+'no'/ig,                               fix: "BOOLEAN DEFAULT FALSE" },
  // CREATE VIEW missing AS
  { re: /\b(CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+\w+)\s+(SELECT\b)/ig, fix: '$1 AS $2' },
  // CREATE INDEX missing ON: CREATE INDEX idx table(col) → CREATE INDEX idx ON table(col)
  { re: /\b(CREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+)\s+(?!ON\b)(\w+\s*\()/ig, fix: '$1 ON $2' },
  // Trigger timing missing ON: AFTER DELETE tbl FOR → AFTER DELETE ON tbl FOR
  { re: /\b((?:AFTER|BEFORE)\s+(?:INSERT|UPDATE|DELETE))\s+(?!ON\b)(\w+)(\s+FOR\b)/ig, fix: '$1 ON $2$3' },
  // Date format: 'MM-YYYY-DD' → 'YYYY-MM-DD' (middle group is 4-digit year)
  { re: /'(\d{2})-(\d{4})-(\d{2})'/g,                                fix: "'$2-$1-$3'" },
  // LIKE with unquoted pattern: LIKE A% → LIKE 'A%'
  { re: /\bLIKE\s+([A-Za-z][A-Za-z0-9_%]*)(?!\s*['"])/ig,           fix: "LIKE '$1'" },
  // BETWEEN missing AND: BETWEEN 3000 6000 → BETWEEN 3000 AND 6000
  { re: /\bBETWEEN\s+(\S+)\s+(?!AND\b)(\d[\d.]*)\b/ig,              fix: 'BETWEEN $1 AND $2' },
  // INSERT missing VALUES: INSERT INTO t (cols) (vals) → INSERT INTO t (cols) VALUES (vals)
  { re: /\b(INSERT\s+INTO\s+\w+\s*\([^)]+\))\s*(\()/ig,             fix: '$1 VALUES $2' },
  // SELECT col[, col2] DISTINCT → SELECT DISTINCT col[, col2]
  { re: /\bSELECT\s+(.+?)\s+DISTINCT\b/ig,                           fix: 'SELECT DISTINCT $1' },
];

const fixSQLCode = (code) => {
  let fixed = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const { re, fix } of SQL_AUTO_FIXES) {
    fixed = fixed.replace(re, fix);
  }

  // Fix line-by-line checks
  const lines = fixed.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // CHECK missing parens: CHECK expr → CHECK (expr)
    line = line.replace(/\bCHECK\s+(?!\()([^()\n;,]+?)\s*([,;]?\s*)$/i, (m, expr, trail) => {
      return `CHECK (${expr.trim()})${trail}`;
    });
    lines[i] = line;
  }

  // Fix line-by-line: missing comma after column def in CREATE TABLE
  // (detect two consecutive non-comma-terminated col defs and add comma to first)
  const dataTypeKw = /\b(INT|INTEGER|BIGINT|SMALLINT|TINYINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|MONEY|CHAR|VARCHAR|TEXT|DATE|TIME|TIMESTAMP|DATETIME|BOOLEAN|BOOL|SERIAL|UUID|JSON|JSONB|BYTEA|NVARCHAR|NCHAR)\b/i;
  let inCreate = false;
  for (let i = 0; i < lines.length - 1; i++) {
    const t = lines[i].trimEnd();
    const next = lines[i + 1].trim();
    if (/\bCREATE\s+(TEMP\w*\s+)?TABLE\b/i.test(t)) { inCreate = true; continue; }
    if (inCreate && /^\)/.test(next)) { inCreate = false; continue; }
    if (inCreate && dataTypeKw.test(t) && !t.endsWith(',') && !t.endsWith('(')) {
      if (dataTypeKw.test(next) || /^\s*(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(next)) {
        lines[i] = t + ',';
      }
    }
  }
  return lines.join('\n');
};

const analyzeSQL = (code) => {
  const lines = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
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

  // Auto-fix: only return fixedCode when it actually differs
  const fixedCode = fixSQLCode(code);
  const fixed = fixedCode !== code ? fixedCode : null;

  return { errors, fixed, suggestions: generateSQLSuggestions(code) };
};

// ── Python analysis ───────────────────────────────────────────────────────────

// Strip an inline comment from a line (naively — doesn't handle all string edge cases)
const stripPyComment = (raw) => raw.replace(/#(?=([^"'\\]*(\\.|'([^'\\]*\\.)*[^'\\]*'|"([^"\\]*\\.)*[^"\\]*"))*[^"']*$).*$/, '');

const checkPythonLines = (lines) => {
  const errors = [];
  const seen = new Set(); // deduplicate identical messages

  const push = (type, line, message, fix) => {
    const key = `${line}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push({ type, line, language: 'python', message, fix });
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const indent = (raw.match(/^(\s*)/) || ['', ''])[1].length;
    const noComment = stripPyComment(raw);
    const trimmed = noComment.trim();
    const trimmedRaw = raw.trim();

    if (!trimmedRaw || trimmedRaw.startsWith('#')) continue;

    // ── 1. Keyword typos at line start ──────────────────────────────────────
    if (/^improt\b/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: "improt" is not valid Python — did you mean "import"?`,
        'Replace improt with import');
    }
    if (/^form\s+\w+\s+import\b/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: "form" is not a Python keyword — did you mean "from"?`,
        'Replace "form" with "from": from module import name');
    }
    if (/^tr\s*:/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: "tr" is not a Python keyword — did you mean "try"?`,
        'Replace "tr:" with "try:"');
    }

    // ── 2. Missing colon on block-starting statements ────────────────────────
    if (/^\s*(def|class|if|elif|else|for|while|try|except|finally|with|async\s+def)\b/.test(raw)) {
      // Strip parenthesised groups (removes type annotations like x: int inside parens)
      // then check whether any colon survives — if none, the colon is truly missing.
      // This also allows valid one-liners: `if n<=1: return 1` (colon present, not at end).
      const stripped = noComment.replace(/\([^()]*\)/g, '()');
      if (!stripped.includes(':')) {
        const kw = trimmed.split(/[\s(]/)[0];
        push('error', lineNum,
          `Line ${lineNum}: Missing colon at end of "${kw}" statement`,
          `Add a colon: ${kw} ...:`);
      }
    }

    // ── 3. Indentation error: line after block opener at same or lower indent ─
    if (i > 0) {
      const prevRaw  = lines[i - 1];
      const prevNC   = stripPyComment(prevRaw);
      const prevTrim = prevNC.trim();
      const prevIndent = (prevRaw.match(/^(\s*)/) || ['', ''])[1].length;
      if (/:\s*$/.test(prevTrim) &&
          /^\s*(def|class|if|elif|else|for|while|try|except|finally|with)\b/.test(prevRaw) &&
          trimmed && indent <= prevIndent) {
        push('error', lineNum,
          `Line ${lineNum}: Expected indented block after "${prevTrim.split(/\s/)[0]}" on line ${lineNum - 1} but found unindented code`,
          'Indent this line with 4 spaces');
      }
    }

    // ── 4. Missing self in class method ─────────────────────────────────────
    if (/^\s{4,}def\s+\w+\s*\(/.test(raw)) {
      const paramMatch = raw.match(/def\s+(\w+)\s*\(([^)]*)\)/);
      if (paramMatch) {
        const params = paramMatch[2].trim();
        const isMissingself = params === '' ||
          (!params.startsWith('self') && !params.startsWith('cls') &&
           !params.startsWith('*') && !/\bself\b/.test(params));
        if (isMissingself) {
          let inClass = false;
          for (let j = i - 1; j >= 0 && j >= i - 40; j--) {
            const pl = lines[j];
            if (/^class\s+\w+/.test(pl.trim())) { inClass = true; break; }
            if (/^def\s+\w+/.test(pl.trim()) && (pl.match(/^(\s*)/) || ['', ''])[1].length === 0) break;
          }
          if (inClass) {
            push('error', lineNum,
              `Line ${lineNum}: Class method "${paramMatch[1]}" is missing "self" as first parameter`,
              'Add self: def method_name(self, ...)');
          }
        }
      }
    }

    // ── 5. Python 2 print statement ─────────────────────────────────────────
    if (/^\s*print\s+[^(=\n]/.test(raw) && !/^\s*print\s*\(/.test(raw) && !/^\s*print\s*$/.test(raw)) {
      push('error', lineNum,
        `Line ${lineNum}: Python 2 print statement — Python 3 requires parentheses: print(...)`,
        'Add parentheses: print("text")');
    }

    // ── 6. range without parentheses ────────────────────────────────────────
    if (/\brange\s+\d/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: range() requires parentheses — use range(n), not range n`,
        'Add parentheses: range(10)');
    }

    // ── 7. Dict literal missing colon between key and value ─────────────────
    if (/\{["'][^"']+["']\s+[^:\s}]/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: Dictionary literal missing colon — each key-value pair needs a colon: {"key": value}`,
        'Add colon: {"x": 1, "y": 2}');
    }

    // ── 8. Assignment instead of comparison in while/if condition ────────────
    if (/^\s*(while|if|elif)\s+\w+\s*=\s*\w/.test(raw) && !/^\s*(while|if|elif)\s+\w+\s*==/.test(raw)) {
      push('error', lineNum,
        `Line ${lineNum}: Assignment (=) used in ${trimmed.split(/\s/)[0]} condition — this is a SyntaxError; use == for equality comparison`,
        'Replace = with ==');
    }

    // ── 9. Double import alias ───────────────────────────────────────────────
    if (/^\s*import\s+\S+(\s+as\s+\w+){2,}/.test(raw)) {
      push('error', lineNum,
        `Line ${lineNum}: Invalid import — cannot chain "as" twice: use one alias only (import module as alias)`,
        'Use one alias: import pandas as pd');
    }

    // ── 10. Missing 'as' in with statement ──────────────────────────────────
    if (/^\s*with\s+.+\)\s+\w+\s*:/.test(raw) && !/\bas\b/.test(raw)) {
      push('error', lineNum,
        `Line ${lineNum}: with statement missing "as" keyword — use "with expression as variable:"`,
        'Add as: with open("file") as f:');
    }

    // ── 11. lambda missing colon ─────────────────────────────────────────────
    if (/\blambda\b/.test(trimmed) && !/\blambda\b[^:]*:/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: lambda expression missing colon — syntax is "lambda params: expression"`,
        'Add colon: lambda x: x * 2');
    }

    // ── 12. yield / break / continue at module level (indent = 0) ───────────
    if (indent === 0) {
      if (/^yield\b/.test(trimmed)) {
        push('error', lineNum,
          `Line ${lineNum}: "yield" outside function — yield can only be used inside a generator function`,
          'Move yield inside a def function');
      }
      if (/^break\b/.test(trimmed)) {
        push('error', lineNum,
          `Line ${lineNum}: "break" outside loop — break can only be used inside a for/while loop`,
          'Move break inside a loop body');
      }
      if (/^continue\b/.test(trimmed)) {
        push('error', lineNum,
          `Line ${lineNum}: "continue" outside loop — continue can only be used inside a for/while loop`,
          'Move continue inside a loop body');
      }
    }

    // ── 13. Wrong True / False / None capitalization ─────────────────────────
    const capMatch = trimmed.match(/\b(true|false|none|TRUE|FALSE|NONE|truE|falSe|tRue|fAlse|nOne)\b/);
    if (capMatch) {
      const bad = capMatch[1];
      const lc  = bad.toLowerCase();
      const correct = lc === 'true' ? 'True' : lc === 'false' ? 'False' : 'None';
      // Skip if it's clearly inside a string on the same line
      if (!new RegExp(`["'][^"']*${bad}[^"']*["']`).test(trimmed)) {
        push('error', lineNum,
          `Line ${lineNum}: "${bad}" is not defined — Python booleans/None are capitalized: use ${correct}`,
          `Replace "${bad}" with "${correct}"`);
      }
    }

    // ── 14. f-string with ) instead of } closing expression ─────────────────
    // Works even when the f-string itself is unclosed (intentionally malformed)
    if (/f["']/.test(trimmed)) {
      if (/f["'][^"']*\{[^}]*\)/.test(trimmed) && !/f["'][^"']*\{[^}]*\}/.test(trimmed)) {
        push('error', lineNum,
          `Line ${lineNum}: Unterminated f-string expression — used ")" to close instead of "}"; syntax is f"Hello {name}"`,
          'Replace ) with } inside the f-string expression: f"text {variable}"');
      }
    }

    // ── 15. assert with single = (assignment, not comparison) ────────────────
    if (/^\s*assert\s*\(.*[^=!<>]=[^=].*\)/.test(raw) && !/^\s*assert\s*\(.*==/.test(raw)) {
      push('error', lineNum,
        `Line ${lineNum}: assert uses single = (assignment) instead of == (comparison)`,
        'Replace = with ==: assert(x == y)');
    }

    // ── 16. Missing def keyword: `word word(args):` at indented line ─────────
    if (/^\s{4,}\w+\s+\w+\s*\([^)]*\)\s*:/.test(raw) &&
        !/^\s*(def|class|if|elif|else|for|while|try|except|finally|with|async|return|import|from|raise|yield|del|pass|assert|global|nonlocal|print|and|or|not)\b/.test(raw)) {
      push('warning', lineNum,
        `Line ${lineNum}: Looks like a function definition missing the "def" keyword`,
        'Add def before function name: def function_name(params):');
    }

    // ── 17. Duplicate values in numeric set literal ──────────────────────────
    const setLiteralMatch = trimmed.match(/=\s*\{([\d\s,]+)\}/);
    if (setLiteralMatch) {
      const nums = setLiteralMatch[1].split(',').map(n => n.trim()).filter(Boolean);
      const uniq = new Set(nums);
      if (uniq.size < nums.length) {
        push('warning', lineNum,
          `Line ${lineNum}: Duplicate values in set literal — sets store only unique elements, duplicates are silently discarded`,
          'Remove duplicate values from the set literal');
      }
    }

    // ── 18. Bare except: ────────────────────────────────────────────────────
    if (/^\s*except\s*:/.test(raw)) {
      push('warning', lineNum,
        `Line ${lineNum}: Bare except: catches all exceptions including SystemExit and KeyboardInterrupt — use except Exception:`,
        'Replace except: with except Exception:');
    }

    // ── 19. Mixed tabs and spaces ────────────────────────────────────────────
    const indentStr = (raw.match(/^(\s+)/) || [])[1] || '';
    if (indentStr.includes('\t') && indentStr.includes(' ')) {
      push('error', lineNum,
        `Line ${lineNum}: Mixed tabs and spaces in indentation — Python 3 raises TabError (use 4 spaces per PEP 8)`,
        'Replace all tab characters with 4 spaces');
    }

    // ── 20. Unterminated string literal ──────────────────────────────────────
    // Walk character-by-character to track open quote state (skip escaped chars)
    {
      let inSingle = false, inDouble = false, inTripleS = false, inTripleD = false;
      const noShebang = trimmed.startsWith('#') ? '' : trimmed;
      for (let ci = 0; ci < noShebang.length; ci++) {
        const ch = noShebang[ci];
        if (ch === '\\') { ci++; continue; }
        const two = noShebang.slice(ci, ci + 3);
        if (!inSingle && !inDouble) {
          if (two === "'''") { inTripleS = !inTripleS; ci += 2; continue; }
          if (two === '"""') { inTripleD = !inTripleD; ci += 2; continue; }
        }
        if (!inDouble && !inTripleS && !inTripleD && ch === "'") { inSingle = !inSingle; continue; }
        if (!inSingle && !inTripleS && !inTripleD && ch === '"') { inDouble = !inDouble; continue; }
      }
      if (inSingle || inDouble) {
        push('error', lineNum,
          `Line ${lineNum}: Unterminated string literal — the string was opened with a quote but never closed on this line`,
          "Add the matching closing quote: s = 'Hello'");
      }
    }

    // ── 21. Unclosed bracket / parenthesis on a single-line expression ────────
    // Only flag simple assignment lines (not multi-line continuations like function args)
    if (/^\s*\w+\s*=\s*[(\[{]/.test(raw) && !/[,\\]\s*$/.test(raw)) {
      const expr = raw.replace(/^\s*\w+\s*=\s*/, '');
      const opens  = (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;
      const square = (expr.match(/\[/g) || []).length - (expr.match(/\]/g) || []).length;
      const curly  = (expr.match(/\{/g) || []).length - (expr.match(/\}/g) || []).length;
      if (opens > 0) {
        push('error', lineNum,
          `Line ${lineNum}: Unclosed parenthesis — expression has ${opens} opening "(" without a matching ")"`,
          'Add the missing closing parenthesis: t = (1, 2, 3)');
      } else if (square > 0) {
        push('error', lineNum,
          `Line ${lineNum}: Unclosed bracket — expression has ${square} opening "[" without a matching "]"`,
          'Add the missing closing bracket: lst = [1, 2, 3]');
      } else if (curly > 0) {
        push('error', lineNum,
          `Line ${lineNum}: Unclosed brace — expression has ${curly} opening "{" without a matching "}"`,
          'Add the missing closing brace: s = {1, 2, 3}');
      }
    }
  }

  return errors;
};

// ── Python auto-fixer ─────────────────────────────────────────────────────────
const fixPythonCode = (code) => {
  const lines = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const fixed = lines.map(raw => {
    let line = raw;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;

    // improt → import
    line = line.replace(/^(\s*)improt\b/, '$1import');
    // form X import → from X import
    line = line.replace(/^(\s*)form\s+(\w[\w.]*)\s+import\b/, '$1from $2 import');
    // tr: → try:
    line = line.replace(/^(\s*)tr\s*:/, '$1try:');

    // Wrong boolean capitalization (skip inside strings naively)
    line = line.replace(/\b(truE|tRue|TRUE)\b/g, 'True');
    line = line.replace(/\b(falSe|fAlse|FALSE)\b/g, 'False');
    line = line.replace(/\b(nOne|NONE)\b/g, 'None');

    // Python 2 print: print "text" → print("text")
    line = line.replace(/^(\s*)print\s+([^(=\n].*)$/, (m, indent, rest) => {
      const clean = rest.trimEnd();
      // Don't double-wrap if somehow already has parens
      if (clean.startsWith('(') && clean.endsWith(')')) return m;
      return `${indent}print(${clean})`;
    });

    // Missing colon on block-starting statement
    const blockMatch = line.match(/^(\s*)(def|class|if|elif|else|for|while|try|except|finally|with)\b(.*)/);
    if (blockMatch) {
      const [, indent2, kw, rest2] = blockMatch;
      const noComment = rest2.replace(/#.*$/, '').trimEnd();
      if (noComment && !noComment.endsWith(':')) {
        line = `${indent2}${kw}${rest2.trimEnd()}:`;
      }
    }

    // bare except: → except Exception:
    line = line.replace(/^(\s*)except\s*:\s*$/, '$1except Exception:');

    // assert(x = y) → assert(x == y)
    line = line.replace(/^(\s*assert\s*\([^)]*)[^=!<>]=[^=]/, (m) => m.replace(/([^=!<>])=([^=])/, '$1==$2'));

    // while/if x = y → while/if x == y
    line = line.replace(/^(\s*(?:while|if|elif)\s+\w+)\s*=\s*(\w)/, '$1 == $2');

    // Missing 'as' in with statement: with open(...) f: → with open(...) as f:
    line = line.replace(/^(\s*with\s+.+\))\s+(\w+)\s*:/, '$1 as $2:');

    // lambda missing colon: lambda x expr → lambda x: expr
    line = line.replace(/\blambda\s+([^:,\n]+?)\s+([^:\s].*)$/, (m, params, body) => {
      if (params.includes(':')) return m;
      return `lambda ${params.trim()}: ${body}`;
    });

    // f-string expression closed with ) instead of }: f"Hello {name)" → f"Hello {name}"
    line = line.replace(/f(["'])([^"']*\{[^}]*)\)/g, 'f$1$2}');

    // Dict literal missing colon between key and value: {"x" 1} → {"x": 1}
    line = line.replace(/([{,])\s*(["'][^"']*["'])\s+([^:,}\s])/g, '$1 $2: $3');

    // Unclosed bracket/paren/brace on simple assignment: t = (1,2,3 → t = (1,2,3)
    if (/^\s*\w+\s*=\s*[(\[{]/.test(line) && !/[,\\]\s*$/.test(line)) {
      const eqIdx = line.indexOf('=');
      const expr = line.slice(eqIdx + 1);
      const opens  = (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;
      const square = (expr.match(/\[/g) || []).length - (expr.match(/\]/g) || []).length;
      const curly  = (expr.match(/\{/g) || []).length - (expr.match(/\}/g) || []).length;
      if (opens > 0)  line = line.trimEnd() + ')'.repeat(opens);
      else if (square > 0) line = line.trimEnd() + ']'.repeat(square);
      else if (curly > 0)  line = line.trimEnd() + '}'.repeat(curly);
    }

    // Unterminated string literal — walk chars and close open quote
    {
      let inSingle = false, inDouble = false;
      const t = line.trimEnd();
      for (let ci = 0; ci < t.length; ci++) {
        const ch = t[ci];
        if (ch === '\\') { ci++; continue; }
        const three = t.slice(ci, ci + 3);
        if (!inDouble && three === "'''") { inSingle = !inSingle; ci += 2; continue; }
        if (!inSingle && three === '"""') { inDouble = !inDouble; ci += 2; continue; }
        if (!inDouble && ch === "'") { inSingle = !inSingle; continue; }
        if (!inSingle && ch === '"') { inDouble = !inDouble; continue; }
      }
      if (inSingle) line = t + "'";
      else if (inDouble) line = t + '"';
    }

    return line;
  });

  // Post-process: inject 'pass' into empty def/class bodies
  // A def/class whose next non-empty line has equal or less indentation has no body.
  const result = [];
  for (let i = 0; i < fixed.length; i++) {
    result.push(fixed[i]);
    const blockMatch = fixed[i].match(/^(\s*)(def|class)\b.*:\s*$/);
    if (blockMatch) {
      const defIndent = blockMatch[1];
      let nextIdx = i + 1;
      while (nextIdx < fixed.length && !fixed[nextIdx].trim()) nextIdx++;
      const nextLine = fixed[nextIdx];
      const nextIndent = nextLine !== undefined ? (nextLine.match(/^(\s*)/)?.[1] ?? '') : '';
      if (nextIndent.length <= defIndent.length) {
        result.push(defIndent + '    pass');
      }
    }
  }
  return result.join('\n');
};

// Whole-file Python pattern checks (things that can't be done per-line)
const PYTHON_GLOBAL_PATTERNS = [
  { re: /==['"](True|False|None)['"]/g, type: 'warning', msg: 'Comparing == with string "True"/"False"/"None" — use boolean True/False/None literals', fix: c => c.replace(/==["'](True)["']/g, '== True').replace(/==["'](False)["']/g, '== False').replace(/==["'](None)["']/g, 'is None') },
  { re: /\brange\s*\(\s*len\s*\(/g,     type: 'warning', msg: 'Avoid range(len(x)) — iterate directly: for item in x', fix: c => c },
  { re: /import \*/,                     type: 'warning', msg: 'Wildcard imports (import *) pollute namespace — import specific names', fix: c => c },
  { re: /\bxrange\b/,                   type: 'error',   msg: 'xrange does not exist in Python 3 — use range()', fix: c => c.replace(/\bxrange\b/g, 'range') },
  { re: /\bdict\.has_key\b/,            type: 'error',   msg: '.has_key() removed in Python 3 — use "key in dict"', fix: c => c.replace(/(\w+)\.has_key\(([^)]+)\)/g, '$2 in $1') },
  { re: /==\s*None\b/g,                 type: 'warning', msg: 'Use "is None" instead of "== None"', fix: c => c.replace(/([^=!<>])==\s*None\b/g, '$1is None') },
  { re: /!=\s*None\b/g,                 type: 'warning', msg: 'Use "is not None" instead of "!= None"', fix: c => c.replace(/!=\s*None\b/g, 'is not None') },
  { re: /\bexecfile\b/,                 type: 'error',   msg: 'execfile() removed in Python 3 — use exec(open("file").read())', fix: c => c.replace(/\bexecfile\s*\(([^)]+)\)/g, 'exec(open($1).read())') },
];

// HELLO-style undefined ALL_CAPS identifiers
const KNOWN_UPPER = new Set([
  'TRUE','FALSE','NONE','OK','ERROR','DEBUG','INFO','WARNING','CRITICAL','SQL','URL','API',
  'HTTP','HTTPS','HTML','JSON','CSV','XML','PDF','UTC','EST','GMT','EOF','NaN','INF',
  'MAX','MIN','PI','E','SIGTERM','SIGKILL','STDIN','STDOUT','STDERR','PATH','HOME',
  'GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS',
]);

const checkUndefinedCaps = (lines) => {
  const errors = [];
  // Collect all top-level assignments like HELLO = ...
  const defined = new Set();
  lines.forEach(l => {
    const m = l.match(/^([A-Z][A-Z0-9_]{1,})\s*=/);
    if (m) defined.add(m[1]);
    // Also catch: import X as CAP
    const im = l.match(/import\s+\w+\s+as\s+([A-Z][A-Z0-9_]+)\b/);
    if (im) defined.add(im[1]);
    // from X import CAP
    const fm = l.match(/from\s+\w[\w.]*\s+import\s+(.+)/);
    if (fm) {
      fm[1].split(',').forEach(name => {
        const trimName = name.trim().split(/\s+as\s+/).pop().trim();
        if (/^[A-Z][A-Z0-9_]+$/.test(trimName)) defined.add(trimName);
      });
    }
  });

  const seen = new Set();
  lines.forEach((raw, i) => {
    const lineNum = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const capsMatches = trimmed.match(/\b([A-Z][A-Z0-9_]{1,})\b/g) || [];
    capsMatches.forEach(cap => {
      if (KNOWN_UPPER.has(cap) || defined.has(cap) || seen.has(`${cap}:${lineNum}`)) return;
      // Skip if it's the LHS of an assignment on this line
      if (new RegExp(`^\\s*${cap}\\s*=(?!=)`).test(raw)) return;
      // Skip if it's in an import statement
      if (/^\s*(import|from)\b/.test(raw)) return;
      seen.add(`${cap}:${lineNum}`);
      errors.push({
        type: 'warning', line: lineNum, language: 'python',
        message: `Line ${lineNum}: "${cap}" is used but never defined — uppercase identifiers are usually module-level constants; did you mean a string or a defined variable?`,
        fix: `Define it first: ${cap} = "..." or use a lowercase variable name`,
      });
    });
  });
  return errors;
};

const checkEmptyFunctions = (lines) => {
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNum = i + 1;
    if (!/^\s*def\s+\w+\s*\([^)]*\)\s*:/.test(raw)) continue;
    const funcIndent = (raw.match(/^(\s*)/) || ['', ''])[1].length;
    const funcName = (raw.match(/def\s+(\w+)/) || [])[1];

    const bodyLines = [];
    let j = i + 1;
    while (j < lines.length) {
      const nl = lines[j];
      const nt = nl.trim();
      const ni = (nl.match(/^(\s*)/) || ['', ''])[1].length;
      if (!nt) { j++; continue; }
      if (ni <= funcIndent) break;
      bodyLines.push(nt);
      j++;
    }

    if (bodyLines.length === 0) {
      errors.push({
        type: 'error', line: lineNum, language: 'python',
        message: `Line ${lineNum}: Function "${funcName}" has no body — add "pass" or a return statement`,
        fix: 'Add pass, a return statement, or a docstring to the function body',
      });
    } else if (
      bodyLines.length >= 1 &&
      bodyLines.every(bl => /^\w+\s*=(?!=)/.test(bl)) &&
      !bodyLines.some(bl => /\b(return|yield|print|raise|self\.|cls\.|os\.|sys\.)\b/.test(bl))
    ) {
      errors.push({
        type: 'warning', line: lineNum, language: 'python',
        message: `Line ${lineNum}: Function "${funcName}" only assigns local variables but has no return — those values are lost when the function exits`,
        fix: 'Add a return statement: return variable_name',
      });
    }
  }
  return errors;
};

// ── Python built-in names (never flag these as undefined) ─────────────────────
const PYTHON_BUILTINS = new Set([
  'print','len','range','list','dict','set','tuple','str','int','float','bool','bytes',
  'type','isinstance','issubclass','hasattr','getattr','setattr','delattr','callable',
  'input','open','super','object','None','True','False','abs','all','any','ascii',
  'bin','chr','compile','complex','delattr','dir','divmod','enumerate','eval','exec',
  'filter','format','frozenset','globals','hash','help','hex','id','iter','locals',
  'map','max','min','next','oct','ord','pow','print','property','repr','reversed',
  'round','setattr','slice','sorted','staticmethod','sum','vars','zip','classmethod',
  'Exception','ValueError','TypeError','KeyError','IndexError','AttributeError',
  'RuntimeError','StopIteration','FileNotFoundError','OSError','IOError','ImportError',
  'NameError','NotImplementedError','OverflowError','PermissionError','RecursionError',
  'SyntaxError','UnicodeError','ZeroDivisionError','AssertionError','BufferError',
  'EOFError','GeneratorExit','MemoryError','ReferenceError','SystemError','SystemExit',
  'ArithmeticError','LookupError','BaseException','ConnectionError','TimeoutError',
  'NotImplemented','Ellipsis','__name__','__file__','__doc__','__package__','__spec__',
  '__builtins__','__all__','self','cls','args','kwargs',
  // Very common aliases / modules used without explicit import in educational code
  'math','os','sys','re','json','csv','datetime','time','random','collections',
  'functools','itertools','pathlib','shutil','subprocess','threading','logging',
  'numpy','np','pandas','pd','matplotlib','plt','scipy','sklearn','tf','torch',
  'requests','flask','django','sqlalchemy','abc','copy','io','struct','socket',
  'typing','dataclasses','enum','contextlib','warnings','traceback','inspect',
  // Common test/data names
  'x','y','z','n','i','j','k','v','a','b','c','d','e','f','g','h','t','s','m',
]);

// ── Typo map: wrong_name → correct_name ──────────────────────────────────────
const PY_TYPO_MAP = {
  prnt: 'print', prnit: 'print', pritn: 'print', pint: 'print',
  lenght: 'len', lengt: 'len', lenth: 'len',
  retrun: 'return', reutrn: 'return',
  ture: 'True', tru: 'True', flase: 'False', fasle: 'False', fase: 'False',
  noen: 'None', noe: 'None',
};

// ── checkPythonAdvanced: structural + semantic detectors ──────────────────────
const checkPythonAdvanced = (lines) => {
  const errors = [];
  const seen = new Set();
  const push = (type, line, message, fix) => {
    const key = `${line}:${message.slice(0, 60)}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push({ type, line, language: 'python', message, fix });
  };

  // ── Pass 1: build a comprehensive symbol table ───────────────────────────
  const defined = new Set(PYTHON_BUILTINS);
  const funcSigs = {}; // funcName → {line, requiredCount}
  const classNames = new Set();
  const tupleVars = new Set(); // variables assigned a tuple literal
  const allAssigned = new Set(); // every LHS name seen anywhere
  const listSizes = {};       // varName → element count (for OOB detection)
  const dictLiteralKeys = {}; // varName → Set<string> of known keys

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const noComment = stripPyComment(raw).trim();

    // import X  /  import X as Y  /  from X import Y, Z
    const impM = noComment.match(/^import\s+(\S+?)(?:\s+as\s+(\w+))?$/);
    if (impM) { defined.add(impM[2] || impM[1].split('.')[0]); allAssigned.add(impM[2] || impM[1].split('.')[0]); }
    const fromM = noComment.match(/^from\s+\S+\s+import\s+(.+)/);
    if (fromM) {
      fromM[1].split(',').forEach(nm => {
        const alias = nm.trim().split(/\s+as\s+/).pop().trim();
        if (/^\w+$/.test(alias)) { defined.add(alias); allAssigned.add(alias); }
      });
    }
    // def name(...)
    const defM = noComment.match(/^def\s+(\w+)\s*\(([^)]*)\)/);
    if (defM) {
      defined.add(defM[1]); allAssigned.add(defM[1]);
      const params = defM[2].trim();
      if (params === '') {
        funcSigs[defM[1]] = { line: i + 1, requiredCount: 0 };
      } else {
        const paramList = params.split(',').map(p => p.trim()).filter(Boolean);
        // required = params without defaults and not *args/**kwargs
        const required = paramList.filter(p => !p.includes('=') && !p.startsWith('*'));
        const count = required.filter(p => p !== 'self' && p !== 'cls').length;
        funcSigs[defM[1]] = { line: i + 1, requiredCount: count };
      }
      // Also add each parameter to defined
      if (defM[2].trim()) {
        defM[2].split(',').forEach(p => {
          const pname = p.trim().split(/[=:*]/)[0].trim().replace(/^\*+/, '');
          if (pname) { defined.add(pname); allAssigned.add(pname); }
        });
      }
    }
    // class Name
    const clsM = noComment.match(/^class\s+(\w+)/);
    if (clsM) { defined.add(clsM[1]); classNames.add(clsM[1]); }
    // name = ...  /  name, name2 = ...
    const assignM = noComment.match(/^(\w+(?:\s*,\s*\w+)*)\s*=(?!=)/);
    if (assignM) {
      assignM[1].split(',').forEach(nm => {
        const t = nm.trim();
        if (/^\w+$/.test(t)) { defined.add(t); allAssigned.add(t); }
      });
      // Track tuple assignments: name = (...)
      const tupleAssign = noComment.match(/^(\w+)\s*=\s*\(/);
      if (tupleAssign) tupleVars.add(tupleAssign[1]);
    }
    // for var in ...  /  for var, var2 in ...
    const forM = noComment.match(/^for\s+(\w+(?:\s*,\s*\w+)*)\s+in\b/);
    if (forM) {
      forM[1].split(',').forEach(nm => {
        const t = nm.trim();
        if (/^\w+$/.test(t)) { defined.add(t); allAssigned.add(t); }
      });
    }
    // with X as var
    const withM = noComment.match(/^with\s+.+\bas\s+(\w+)/);
    if (withM) { defined.add(withM[1]); allAssigned.add(withM[1]); }
    // except ExcType as var
    const excM = noComment.match(/^except\s+\w+\s+as\s+(\w+)/);
    if (excM) { defined.add(excM[1]); allAssigned.add(excM[1]); }
    // global / nonlocal name
    const globalM = noComment.match(/^(?:global|nonlocal)\s+(.+)/);
    if (globalM) globalM[1].split(',').forEach(n => { defined.add(n.trim()); allAssigned.add(n.trim()); });

    // Track list literal sizes: name = [1,2,3,4,5]  →  listSizes["name"] = 5
    const listLitM = noComment.match(/^(\w+)\s*=\s*\[([^\]]*)\]/);
    if (listLitM) {
      const content = listLitM[2].trim();
      listSizes[listLitM[1]] = content === '' ? 0 : content.split(',').filter(a => a.trim()).length;
    }

    // Track dict literal keys: name = {"a":1, "b":2}  →  dictLiteralKeys["name"] = Set{"a","b"}
    const dictLitM = noComment.match(/^(\w+)\s*=\s*\{([^}]+)\}/);
    if (dictLitM) {
      const keySet = new Set();
      const keyRe = /["']([^"']+)["']\s*:/g;
      let km;
      while ((km = keyRe.exec(dictLitM[2])) !== null) keySet.add(km[1]);
      if (keySet.size > 0) dictLiteralKeys[dictLitM[1]] = keySet;
    }
  }

  // ── Pass 2: per-line detectors ────────────────────────────────────────────
  let insideExcept = false;
  let exceptIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const noComment = stripPyComment(raw).trim();
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = (raw.match(/^(\s*)/) || ['', ''])[1].length;

    // Track except context for bare-raise check
    if (/^except\b/.test(noComment)) {
      insideExcept = true;
      exceptIndent = indent;
    } else if (insideExcept && indent <= exceptIndent && /^\S/.test(raw[0] || '')) {
      insideExcept = false;
    }

    // ── A. Common lowercase typos used as identifiers ─────────────────────
    for (const [typo, correct] of Object.entries(PY_TYPO_MAP)) {
      // Only flag if used as a function call or standalone value (not inside a string)
      const re = new RegExp(`\\b${typo}\\b`);
      if (re.test(noComment)) {
        // Skip if it's inside a string (crude heuristic: after an odd number of quotes)
        const before = noComment.split(re)[0];
        const singleQ = (before.match(/'/g) || []).length % 2;
        const doubleQ = (before.match(/"/g) || []).length % 2;
        if (!singleQ && !doubleQ) {
          push('error', lineNum,
            `Line ${lineNum}: "${typo}" is not defined — did you mean "${correct}"?`,
            `Replace "${typo}" with "${correct}"`);
        }
      }
    }

    // ── B. Duplicate function parameter names ─────────────────────────────
    const defParamM = noComment.match(/^def\s+\w+\s*\(([^)]+)\)/);
    if (defParamM) {
      const params = defParamM[1].split(',')
        .map(p => p.trim().split(/[=:]/)[0].trim().replace(/^\*+/, ''))
        .filter(p => p && p !== 'self' && p !== 'cls');
      const paramSet = new Set(params);
      if (paramSet.size < params.length) {
        const dups = params.filter((p, idx) => params.indexOf(p) !== idx);
        push('error', lineNum,
          `Line ${lineNum}: Duplicate parameter name "${dups[0]}" in function definition — this is a SyntaxError in Python 3; each parameter must have a unique name`,
          `Rename the duplicate: def ${noComment.match(/def\s+(\w+)/)?.[1] || 'func'}(${dups[0]}, ${dups[0]}2)`);
      }
    }

    // ── C. Duplicate keys in dict literal (string or integer keys) ────────
    // Match simple one-line dicts: {"key1": v, "key1": v2}  or  {1: v, 1: v2}
    const dictKeyRe = /\{([^{}]+)\}/g;
    let dm;
    while ((dm = dictKeyRe.exec(noComment)) !== null) {
      const inner = dm[1];
      // Extract string or integer keys
      const keyMatches = [...inner.matchAll(/(?:^|,)\s*(["']\w+["']|\d+)\s*:/g)].map(m => m[1]);
      const keySet = new Set(keyMatches);
      if (keySet.size < keyMatches.length) {
        const dups = keyMatches.filter((k, idx) => keyMatches.indexOf(k) !== idx);
        push('error', lineNum,
          `Line ${lineNum}: Duplicate key ${dups[0]} in dict literal — later value silently overwrites earlier one`,
          'Use unique keys in the dictionary');
      }
    }

    // ── D. Tuple unpacking count mismatch ─────────────────────────────────
    // (a, b) = (1, 2, 3)
    const unpackM = noComment.match(/^\(([^)]+)\)\s*=\s*\(([^)]+)\)/);
    if (unpackM) {
      const lhs = unpackM[1].split(',').filter(s => s.trim()).length;
      const rhs = unpackM[2].split(',').filter(s => s.trim()).length;
      if (lhs !== rhs) {
        push('error', lineNum,
          `Line ${lineNum}: Tuple unpacking mismatch — left side has ${lhs} variable${lhs > 1 ? 's' : ''} but right side has ${rhs} value${rhs > 1 ? 's' : ''} (not enough to unpack)`,
          `Match the number of variables to the number of values, or use a, *rest = ... for variable-length`);
      }
    }

    // ── E. List inside set literal (unhashable type) ──────────────────────
    // s = {[1,2], 3}  — a list [] inside a {set}
    if (/=\s*\{[^}]*\[/.test(noComment) && !/=\s*\{[^}]*:[^}]*\[/.test(noComment)) {
      push('error', lineNum,
        `Line ${lineNum}: Unhashable type — a list ([...]) inside a set literal is not allowed; lists cannot be set elements`,
        'Use a tuple instead: s = {(1, 2), 3}');
    }

    // ── F. Bare "raise" outside of an except block ────────────────────────
    if (/^raise\s*$/.test(noComment) && !insideExcept) {
      push('error', lineNum,
        `Line ${lineNum}: Bare "raise" outside except block — bare raise re-raises the current exception and is only valid inside an except handler`,
        'Add an exception: raise ValueError("message")  or move inside an except block');
    }

    // ── G. .append() / .remove() / .index() called with no arguments ──────
    const noArgCalls = noComment.match(/\.\s*(append|remove|index|insert|count|extend|add|discard|get|pop)\s*\(\s*\)/g) || [];
    for (const call of noArgCalls) {
      const method = call.match(/\.\s*(\w+)/)[1];
      const required = { append: 1, remove: 1, index: 1, insert: 2, extend: 1, add: 1, discard: 1, get: 1 };
      if (required[method]) {
        push('error', lineNum,
          `Line ${lineNum}: ${method}() requires ${required[method] > 1 ? required[method] + ' arguments' : 'an argument'} — called here with none`,
          `Pass the required argument: .${method}(value)`);
      }
    }

    // ── H. math.sqrt / math.log / math.pow called with a string literal ───
    const mathStrM = noComment.match(/\bmath\s*\.\s*(sqrt|log|log2|log10|pow|exp|sin|cos|tan|floor|ceil)\s*\(\s*(["'][^"']*["'])/);
    if (mathStrM) {
      push('error', lineNum,
        `Line ${lineNum}: Type error — math.${mathStrM[1]}() expects a number but received a string literal "${mathStrM[2]}"`,
        `Pass a number instead: math.${mathStrM[1]}(value) where value is int or float`);
    }

    // ── I. Inheritance from undefined class ───────────────────────────────
    const clsInheritM = noComment.match(/^class\s+\w+\s*\((\w+)\s*\)/);
    if (clsInheritM) {
      const base = clsInheritM[1];
      if (base !== 'object' && !defined.has(base) && !PYTHON_BUILTINS.has(base)) {
        push('error', lineNum,
          `Line ${lineNum}: Class inherits from "${base}" but "${base}" is not defined anywhere in this file`,
          `Define "${base}" before this class, or import it`);
      }
    }

    // ── J. (removed — Check S is a superset covering nested calls too) ──────

    // ── K. SQL keyword accidentally in Python code ────────────────────────
    if (/\bNOT\s+NULL\b/.test(noComment) && !/["'][^"']*NOT NULL[^"']*["']/.test(noComment)) {
      push('error', lineNum,
        `Line ${lineNum}: "NOT NULL" is a SQL constraint, not valid Python — use "is not None" to check for None`,
        'Replace NOT NULL with: if value is not None:');
    }

    // ── L. String literal as first arg to numeric-named function (nested too) ──
    // Catches: add("five"), print(add("five", 3)), result = multiply("two", 3)
    const NUMERIC_FUNCS = /^(add|subtract|multiply|divide|sum_|total|calc|compute|average|mean)\w*$/i;
    const strArgRe = /\b([a-zA-Z_]\w*)\s*\(\s*(["'][^"']+["'])\s*[,)]/g;
    let saMatch;
    while ((saMatch = strArgRe.exec(noComment)) !== null) {
      const [, funcName, strLit] = saMatch;
      if (NUMERIC_FUNCS.test(funcName) && (funcSigs[funcName] || /^(add|subtract|multiply|divide)$/.test(funcName))) {
        push('error', lineNum,
          `Line ${lineNum}: "${funcName}" likely expects a number but received string ${strLit} — type mismatch`,
          'Pass a numeric value instead of a string');
      }
    }

    // ── M. Bare "return" with no value ───────────────────────────────────
    if (/^return\s*$/.test(noComment)) {
      let enclosingFunc = null;
      for (let j = i - 1; j >= 0 && j >= i - 60; j--) {
        const pm = lines[j].match(/^\s*def\s+(\w+)\s*\(/);
        if (pm) { enclosingFunc = pm[1]; break; }
      }
      if (enclosingFunc) {
        push('warning', lineNum,
          `Line ${lineNum}: Empty return body in "${enclosingFunc}" — bare "return" returns None; if intentional use "return None" explicitly, otherwise add a return value`,
          'Add a return value: return result  or  write return None to make the intent explicit');
      }
    }

    // ── N. Bare assert (no condition) ─────────────────────────────────────
    if (/^assert\s*$/.test(noComment)) {
      push('error', lineNum,
        `Line ${lineNum}: Bare "assert" with no condition — assert must be followed by an expression to test`,
        'Add a condition: assert x > 0  or  assert value is not None, "message"');
    }

    // ── O. Unclosed { inside f-string ─────────────────────────────────────
    // f"Hello {name"  — missing closing }
    if (/f["']/.test(noComment)) {
      // Find the f-string content between the outer quotes
      const fStrM = noComment.match(/f(["'])((?:(?!\1).)*)\1?/);
      if (fStrM) {
        const content = fStrM[2];
        const opens  = (content.match(/\{/g) || []).length;
        const closes = (content.match(/\}/g) || []).length;
        if (opens > closes && opens > 0) {
          push('error', lineNum,
            `Line ${lineNum}: Unclosed "{" in f-string — every "{" must have a matching "}" to close the expression`,
            'Add the closing brace: f"Hello {name}"');
        }
      }
    }

    // ── P. Invalid open() file mode ───────────────────────────────────────
    const openModeM = noComment.match(/\bopen\s*\(\s*(?:["'][^"']*["']|\w+)\s*,\s*["']([^"']+)["']/);
    if (openModeM) {
      const VALID_MODES = new Set(['r','w','a','rb','wb','ab','r+','w+','a+','rb+','wb+','ab+','x','xb','x+','rw','br','bw','ba']);
      const mode = openModeM[1];
      if (!VALID_MODES.has(mode)) {
        push('error', lineNum,
          `Line ${lineNum}: Invalid file mode "${mode}" in open() — valid modes are: "r", "w", "a", "rb", "wb", "ab", "r+", "w+", "x"`,
          'Use a valid mode: open("file.txt", "r") or open("file.txt", "wb")');
      }
    }

    // ── Q. Tuple item assignment (tuples are immutable) ───────────────────
    // t[0] = 5  where t was assigned a tuple literal
    const subscriptAssignM = noComment.match(/^(\w+)\s*\[.+\]\s*=(?!=)/);
    if (subscriptAssignM && tupleVars.has(subscriptAssignM[1])) {
      push('error', lineNum,
        `Line ${lineNum}: "${subscriptAssignM[1]}" is a tuple and is immutable — you cannot assign to tuple items`,
        'Convert to list first: lst = list(t)  then assign lst[0] = value');
    }

    // ── R. set.add([list]) — unhashable type ─────────────────────────────
    if (/\.\s*add\s*\(\s*\[/.test(noComment)) {
      push('error', lineNum,
        `Line ${lineNum}: Unhashable type — cannot add a list to a set; lists are mutable and cannot be hashed`,
        'Use a tuple instead: s.add((4, 5))');
    }

    // ── S. Wrong argument count for user functions (nested calls too) ─────
    // Scan every func(...) call on the line, not just statement-level
    if (Object.keys(funcSigs).length > 0) {
      const callRe = /\b([a-zA-Z_]\w*)\s*\(([^()]*)\)/g;
      let cm;
      // Skip function definition lines themselves
      if (!/^def\s/.test(noComment) && !/^class\s/.test(noComment)) {
        while ((cm = callRe.exec(noComment)) !== null) {
          const [, callName, callArgs] = cm;
          if (!funcSigs[callName]) continue;
          const { requiredCount, line: defLine } = funcSigs[callName];
          if (requiredCount === 0) continue; // no-arg functions always fine
          const argStr = callArgs.trim();
          const argCount = argStr === '' ? 0 : argStr.split(',').filter(a => a.trim()).length;
          if (argCount > 0 && argCount < requiredCount) {
            push('error', lineNum,
              `Line ${lineNum}: "${callName}" expects at least ${requiredCount} argument${requiredCount > 1 ? 's' : ''} but was called with ${argCount} (defined on line ${defLine})`,
              `Pass the required arguments: ${callName}(${Array(requiredCount).fill('arg').map((a,idx)=>a+(idx+1)).join(', ')})`);
          } else if (argCount === 0 && requiredCount > 0) {
            push('error', lineNum,
              `Line ${lineNum}: "${callName}" expects ${requiredCount} argument${requiredCount > 1 ? 's' : ''} but was called with none (defined on line ${defLine})`,
              `Pass the required arguments: ${callName}(${Array(requiredCount).fill('arg').map((a,idx)=>a+(idx+1)).join(', ')})`);
          }
        }
      }
    }

    // ── T. Infinite recursion — function body is only `return self(same_args)` ──
    const infRecM = noComment.match(/^def\s+(\w+)\s*\([^)]*\)\s*:\s*return\s+(\w+)\s*\(/);
    if (infRecM && infRecM[1] === infRecM[2]) {
      push('error', lineNum,
        `Line ${lineNum}: Infinite recursion — "${infRecM[1]}" calls itself unconditionally with no base case; this will cause a RecursionError`,
        `Add a base case before the recursive call, e.g.: if n <= 0: return 1`);
    }
    // Multi-line version: single-statement body on the next line
    if (/^def\s+(\w+)\s*\([^)]*\):$/.test(noComment)) {
      const funcName = noComment.match(/^def\s+(\w+)/)[1];
      const nextTrimmed = (lines[i + 1] || '').trim();
      const nextNC = stripPyComment(lines[i + 1] || '').trim();
      if (nextTrimmed && /^return\s+/.test(nextNC)) {
        const recM = nextNC.match(/^return\s+(\w+)\s*\(/);
        if (recM && recM[1] === funcName) {
          push('error', i + 2,
            `Line ${i + 2}: Infinite recursion — "${funcName}" calls itself unconditionally with no base case; this will cause a RecursionError`,
            `Add a base case before the recursive call, e.g.: if n <= 0: return 1`);
        }
      }
    }

    // ── U. Undefined variable used in print/return/assignment RHS ─────────
    // Only flag names that: length>=5, all-lowercase with underscore, not in defined set
    const UNDEF_CONTEXTS = [
      /^print\s*\(\s*([a-z][a-z_]{4,})\s*\)$/,       // print(total_value)
      /^return\s+([a-z][a-z_]{4,})\s*$/,              // return total_value
      /^(?:result|value|out|output|data)\s*=\s*([a-z][a-z_]{4,})\s*$/, // x = total_value
    ];
    for (const ctxRe of UNDEF_CONTEXTS) {
      const um = noComment.match(ctxRe);
      if (um) {
        const name = um[1];
        if (!defined.has(name) && !allAssigned.has(name)) {
          push('error', lineNum,
            `Line ${lineNum}: "${name}" is used but was never defined — this will cause a NameError at runtime`,
            `Define "${name}" before this line: ${name} = <value>`);
        }
        break;
      }
    }

    // ── V. .push() on a list — should be .append() ───────────────────────
    if (/\.\s*push\s*\(/.test(noComment) && !/['"]\s*push\s*['"]/.test(noComment)) {
      push('error', lineNum,
        `Line ${lineNum}: Python lists have no .push() method — use .append() to add elements`,
        'Replace .push() with .append()');
    }

    // ── W. Shadowing a built-in name ──────────────────────────────────────
    const BUILTIN_NAMES = new Set([
      'list','dict','set','tuple','str','int','float','bool',
      'print','len','type','input','range','open','sum','max','min','abs',
      'sorted','reversed','enumerate','zip','map','filter','all','any',
      'bytes','chr','ord','hex','bin','oct','pow','round','id','hash',
      'repr','vars','dir','iter','next','callable','getattr','setattr',
    ]);
    const shadowM = noComment.match(/^([a-z_]\w*)\s*=(?!=)/);
    if (shadowM && BUILTIN_NAMES.has(shadowM[1])) {
      push('warning', lineNum,
        `Line ${lineNum}: "${shadowM[1]}" shadows the built-in ${shadowM[1]}() — this will break later uses of the built-in`,
        `Rename the variable: ${shadowM[1]}_data = ... or use a more descriptive name`);
    }

    // ── X. Python 2 exception syntax: except E, var: ─────────────────────
    if (/^except\s+[\w.]+\s*,\s*\w+\s*:/.test(noComment)) {
      push('error', lineNum,
        `Line ${lineNum}: Python 2 exception syntax "except E, var:" — use "except E as var:" in Python 3`,
        'Replace the comma with "as": except ValueError as e:');
    }

    // ── Y. "is" compared with a literal (use == instead) ─────────────────
    if (/\bis\s+(?:-?\d|["'])/.test(noComment) &&
        !/\bis\s+not\b/.test(noComment) && !/\bis\s+None\b/.test(noComment)) {
      push('warning', lineNum,
        `Line ${lineNum}: Using "is" to compare with a literal — "is" checks object identity, not equality; use "==" instead`,
        'Replace "is value" with "== value"');
    }

    // ── Z. Mutable default argument def f(lst=[], d={}) ──────────────────
    if (/^def\s+\w+\s*\([^)]*=\s*[\[{]/.test(noComment)) {
      push('warning', lineNum,
        `Line ${lineNum}: Mutable default argument (list or dict) — shared across all calls and mutated in place; use None as default`,
        'Use: def f(lst=None):  then inside:  if lst is None: lst = []');
    }

    // ── AA. for x in <integer_literal>: — iterating a non-iterable ───────
    if (/^for\s+\w+\s+in\s+\d+\s*:/.test(noComment)) {
      push('error', lineNum,
        `Line ${lineNum}: Cannot iterate over an integer — wrap it with range(): "for i in range(n):"`,
        'Replace the integer with range(n): for i in range(5):');
    }

    // ── BB. len() called on a non-sequence literal ────────────────────────
    const lenLitM = noComment.match(/\blen\s*\(\s*(-?\d[\d.]*|True|False)\s*\)/);
    if (lenLitM) {
      push('error', lineNum,
        `Line ${lineNum}: TypeError — len() expects a sequence (str/list/tuple/dict/set) but received ${lenLitM[1]}`,
        'Pass a sequence: len("hello") or len([1, 2, 3])');
    }

    // ── CC. range() called with a float argument ──────────────────────────
    if (/\brange\s*\(\s*\d+\.\d+/.test(noComment)) {
      push('error', lineNum,
        `Line ${lineNum}: TypeError — range() requires integer arguments, not float`,
        'Convert to int first: range(int(n)) or use a whole number');
    }

    // ── DD. Unreachable code — statement at same indent after return/break/etc ──
    if (i > 0) {
      const prevRaw   = lines[i - 1] || '';
      const prevNC    = stripPyComment(prevRaw).trim();
      const prevInd   = (prevRaw.match(/^(\s*)/) || ['',''])[1].length;
      const curInd    = (raw.match(/^(\s*)/)     || ['',''])[1].length;
      const exitWord  = (prevNC.match(/^(return|break|continue|raise)\b/) || [])[1];
      if (exitWord && curInd === prevInd &&
          noComment && !/^(else|elif|except|finally|def|class|#)\b/.test(noComment)) {
        push('warning', lineNum,
          `Line ${lineNum}: Unreachable code — this line never executes because the previous statement always exits (${exitWord})`,
          `Remove the unreachable code or move it before the ${exitWord} statement`);
      }
    }

    // ── EE. % format string placeholder / argument count mismatch ─────────
    const fmtM = noComment.match(/(["'])([^"']*%[^"']*)(\1)\s*%\s*\(([^)]*)\)/);
    if (fmtM) {
      const fmtStr = fmtM[2];
      const argPart = fmtM[4];
      const placeholders = (fmtStr.match(/%[sdiufFeEgGxXob]/g) || []).length;
      const argCount = argPart.trim() === '' ? 0
        : argPart.split(',').filter(a => a.trim()).length;
      if (placeholders > 0 && placeholders !== argCount) {
        push('error', lineNum,
          `Line ${lineNum}: String format mismatch — format string has ${placeholders} placeholder${placeholders > 1 ? 's' : ''} but ${argCount} argument${argCount !== 1 ? 's were' : ' was'} provided`,
          'Match the number of % placeholders to the number of values in the tuple');
      }
    }

    // ── FF. return at module level (indent = 0, not inside any function) ──
    if (/^return\b/.test(noComment) && indent === 0) {
      push('error', lineNum,
        `Line ${lineNum}: "return" at module level — return can only be used inside a function or method`,
        'Move return inside a def function, or remove it');
    }

    // ── GG. __init__ returning a non-None value ───────────────────────────
    if (/^def\s+__init__\s*\(/.test(noComment)) {
      // peek ahead for a return <value> inside the same block
      for (let k = i + 1; k < Math.min(i + 30, lines.length); k++) {
        const peekNC = stripPyComment(lines[k]).trim();
        const peekInd = (lines[k].match(/^(\s*)/) || ['',''])[1].length;
        if (peekInd <= indent && peekNC) break; // exited the function block
        if (/^return\s+(?!None\b)\S/.test(peekNC)) {
          push('error', k + 1,
            `Line ${k + 1}: "__init__" must not return a value — constructors always return None implicitly`,
            'Remove the return value from __init__; use self.attribute = value to store data');
          break;
        }
      }
    }

    // ── HH. x += 1 where x was never assigned (augmented assign to undefined) ──
    // Note: we bypass PYTHON_BUILTINS here because it contains common letter aliases
    // (x, y, z, i, …) that are NOT real builtins; use a hard-coded real-builtins guard.
    const HH_REAL_BUILTINS = new Set([
      'print','len','range','list','dict','set','tuple','str','int','float','bool',
      'type','isinstance','input','open','super','object','abs','all','any','sum',
      'max','min','map','filter','sorted','reversed','enumerate','zip','hash','id',
      'repr','vars','dir','iter','next','chr','ord','hex','bin','oct','pow','round',
      'bytes','format','eval','exec','compile','globals','locals','getattr','setattr',
      'hasattr','delattr','callable','classmethod','staticmethod','property','slice',
    ]);
    const augM = noComment.match(/^([a-z_]\w*)\s*\+=\s*/);
    if (augM) {
      const varName = augM[1];
      // Use allAssigned (actual code assignments) not defined (starts with all PYTHON_BUILTINS)
      if (!allAssigned.has(varName) && !HH_REAL_BUILTINS.has(varName)) {
        push('error', lineNum,
          `Line ${lineNum}: "${varName}" used in "+=" but was never assigned a value — this will cause a NameError`,
          `Assign an initial value first: ${varName} = 0  then use ${varName} += 1`);
      }
    }

    // ── II. List index out of range (constant index on known-size list) ────
    const oobM = noComment.match(/\b([a-zA-Z_]\w*)\s*\[\s*(\d+)\s*\]/);
    if (oobM) {
      const lName = oobM[1];
      const idx   = parseInt(oobM[2], 10);
      if (listSizes[lName] !== undefined && idx >= listSizes[lName]) {
        const sz = listSizes[lName];
        push('error', lineNum,
          `Line ${lineNum}: IndexError — "${lName}" has ${sz} element${sz !== 1 ? 's' : ''} (valid indices: 0–${sz - 1}) but index ${idx} is out of range`,
          `Use a valid index (0 to ${sz - 1}), or use ${lName}[-1] for the last element`);
      }
    }

    // ── JJ. Dict access with a key not in the literal definition ──────────
    const dictAccM = noComment.match(/\b([a-zA-Z_]\w*)\s*\[\s*["']([^"']+)["']\s*\]/);
    if (dictAccM) {
      const dName = dictAccM[1];
      const dKey  = dictAccM[2];
      if (dictLiteralKeys[dName] && !dictLiteralKeys[dName].has(dKey)) {
        const knownKeys = [...dictLiteralKeys[dName]].map(k => `"${k}"`).join(', ');
        push('error', lineNum,
          `Line ${lineNum}: KeyError — "${dKey}" is not a key in "${dName}"; defined keys are: ${knownKeys}`,
          `Use .get("${dKey}", default) to safely access, or check with: if "${dKey}" in ${dName}:`);
      }
    }

    // ── KK. Import of a non-standard / unknown module ─────────────────────
    const KNOWN_MODULES = new Set([
      // Python stdlib (key subset)
      'abc','ast','asyncio','base64','builtins','cmath','collections','contextlib',
      'copy','csv','datetime','decimal','difflib','email','enum','fractions','ftplib',
      'functools','gc','glob','gzip','hashlib','heapq','hmac','html','http','importlib',
      'inspect','io','itertools','json','keyword','linecache','logging','math','mimetypes',
      'multiprocessing','numbers','operator','os','pathlib','pickle','platform','pprint',
      'queue','random','re','shutil','signal','socket','sqlite3','ssl','statistics',
      'string','struct','subprocess','sys','tarfile','tempfile','textwrap','threading',
      'time','timeit','tkinter','traceback','types','typing','unittest','urllib','uuid',
      'warnings','weakref','xml','xmlrpc','zipfile','zlib','zoneinfo',
      // Common third-party
      'numpy','np','pandas','pd','matplotlib','plt','scipy','sklearn','tensorflow','tf',
      'torch','keras','flask','django','fastapi','requests','sqlalchemy','pytest','boto3',
      'redis','celery','pydantic','aiohttp','httpx','click','rich','PIL','cv2','seaborn',
      'plotly','streamlit','gradio','transformers','langchain','openai','anthropic',
      'pymongo','psycopg2','pymysql','aiosqlite','sqlmodel','alembic','peewee',
      'bs4','lxml','yaml','toml','dotenv','tqdm','colorama','tabulate','arrow',
      'pendulum','dateutil','pytz','paramiko','fabric','invoke','nox','black','isort',
      'flake8','mypy','pylint','bandit','attrs','dataclasses','pydantic','marshmallow',
    ]);
    const impBadM = noComment.match(/^import\s+([a-zA-Z_]\w*)(?:\s+as\s+\w+)?\s*$/);
    if (impBadM && !KNOWN_MODULES.has(impBadM[1])) {
      push('warning', lineNum,
        `Line ${lineNum}: "import ${impBadM[1]}" — "${impBadM[1]}" is not a recognised standard library or common package; this may cause a ModuleNotFoundError`,
        `Check the module name spelling, or install it: pip install ${impBadM[1]}`);
    }
  }

  return errors;
};

const analyzePython = (code) => {
  const normalized = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines  = normalized.split('\n');
  const errors = [
    ...checkPythonLines(lines),
    ...checkUndefinedCaps(lines),
    ...checkEmptyFunctions(lines),
    ...checkPythonAdvanced(lines),
  ];

  // Apply auto-fixer to generate fixedCode
  const autoFixed = fixPythonCode(code);

  // Global patterns: apply fixes and deduplicate
  let fixed = autoFixed;
  const existingMsgs = new Set(errors.map(e => e.message));
  for (const p of PYTHON_GLOBAL_PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.replace('g', ''));
    if (re.test(code)) {
      const match = code.match(re);
      const lineNum = match ? code.substring(0, match.index).split('\n').length : null;
      const msg = lineNum ? `Line ${lineNum}: ${p.msg}` : p.msg;
      if (!existingMsgs.has(msg)) {
        errors.push({ type: p.type, message: msg, language: 'python', line: lineNum });
        existingMsgs.add(msg);
      }
      if (p.fix) fixed = p.fix(fixed);
    }
  }

  // Sort by line number
  errors.sort((a, b) => (a.line || 9999) - (b.line || 9999));

  return { errors, fixed: fixed !== code ? fixed : null, suggestions: generatePythonSuggestions(code) };
};

// ── R line-by-line checker ────────────────────────────────────────────────────
const checkRLines = (lines) => {
  const errors = [];
  const push = (type, ln, message, fix) =>
    errors.push({ type, line: ln, language: 'r', message, fix: fix || null });

  // Brace balance tracking
  let braceDepth = 0;
  let parenDepth = 0;

  lines.forEach((raw, i) => {
    const lineNum = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    // Track brace/paren balance (ignore inside strings naively)
    const stripped = trimmed.replace(/"[^"]*"|'[^']*'/g, '""');
    braceDepth += (stripped.match(/\{/g) || []).length - (stripped.match(/\}/g) || []).length;
    parenDepth += (stripped.match(/\(/g) || []).length - (stripped.match(/\)/g) || []).length;

    // ── 1. Python-style for loop ───────────────────────────────────────────────
    if (/^for\s+\w+\s+in\s/.test(trimmed) && !/^for\s*\(/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: Python-style "for x in ..." — R syntax is: for (x in ...) { }`,
        'Wrap loop variable in parens: for (x in vec) { }');
    }

    // ── 2. Python-style if/while (missing parens around condition) ─────────────
    if (/^(if|while)\s+[^(]/.test(trimmed)) {
      const kw = trimmed.match(/^(if|while)/)[1];
      push('error', lineNum,
        `Line ${lineNum}: R requires parentheses around ${kw} condition — use "${kw} (condition)"`,
        `Change to: ${kw} (condition) { }`);
    }

    // ── 3. elif (Python keyword) ───────────────────────────────────────────────
    if (/^elif\s/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: "elif" is Python syntax — R uses "else if (condition)"`,
        'Change to: } else if (condition) {');
    }

    // ── 4. def keyword ────────────────────────────────────────────────────────
    if (/^def\s+\w+\s*\(/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: "def" is Python syntax — R defines functions with: myFn <- function(args) { }`,
        'Change to: myFn <- function(args) { }');
    }

    // ── 5. Python True / False / None ─────────────────────────────────────────
    if (/\bTrue\b/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: "True" is Python — R uses uppercase TRUE`,
        'Change True → TRUE');
    }
    if (/\bFalse\b/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: "False" is Python — R uses uppercase FALSE`,
        'Change False → FALSE');
    }
    if (/\bNone\b/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: "None" is Python — R uses NULL (or NA for missing values)`,
        'Change None → NULL or NA');
    }

    // ── 6. print without parens: print x ──────────────────────────────────────
    if (/^print\s+[^(]/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: "print x" is Python syntax — R requires: print(x)`,
        'Change to: print(x)');
    }

    // ── 7. len() instead of length() ──────────────────────────────────────────
    if (/\blen\s*\(/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: len() is a Python function — R equivalent is length()`,
        'Change len(x) → length(x)');
    }

    // ── 8. Python range() ─────────────────────────────────────────────────────
    if (/\brange\s*\(/.test(trimmed)) {
      push('warning', lineNum,
        `Line ${lineNum}: range() is Python — R uses seq(from, to) or the colon operator from:to`,
        'Change range(1, 10) → 1:9 (0-indexed in Python, 1-indexed in R) or seq(1, 10)');
    }

    // ── 9. Python-style string format: f"..." ─────────────────────────────────
    if (/\bf["']/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: f-strings are Python syntax — R uses sprintf() or glue::glue()`,
        'Use sprintf("value=%s", x) or library(glue); glue("value={x}")');
    }

    // ── 10. import statement ───────────────────────────────────────────────────
    if (/^import\s+\w/.test(trimmed) || /^from\s+\w/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: "import" is Python syntax — R uses library(pkg) or require(pkg)`,
        'Change import pkg → library(pkg)');
    }

    // ── 11. = for function assignment ──────────────────────────────────────────
    if (/^\w+\s*=\s*function\s*\(/.test(trimmed)) {
      const name = trimmed.match(/^(\w+)/)[1];
      push('warning', lineNum,
        `Line ${lineNum}: Function "${name}" assigned with = — R convention is to use <-`,
        `Change: ${name} = function(...) to: ${name} <- function(...)`);
    }

    // ── 12. <<- global assignment warning ─────────────────────────────────────
    if (/<<-/.test(trimmed)) {
      push('warning', lineNum,
        `Line ${lineNum}: <<- modifies a variable in the parent environment — this can cause hard-to-find bugs`,
        'Prefer returning values explicitly; avoid <<- except in well-understood closures');
    }

    // ── 13. Missing closing brace at colon (Python block style) ───────────────
    if (/:\s*$/.test(trimmed) && !/^\s*#/.test(trimmed) && !/^[^"']*["'][^"']*:\s*$/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: Line ends with ":" — this is Python block syntax, not R; R uses { } braces`,
        'Remove the colon and wrap the block in { }');
    }

    // ── 14. paste() with sep="" — should be paste0() ──────────────────────────
    if (/\bpaste\s*\([^)]*,\s*sep\s*=\s*["']["']/.test(trimmed)) {
      push('warning', lineNum,
        `Line ${lineNum}: paste(..., sep="") — use paste0() which is shorter and avoids the sep argument`,
        'Change paste(..., sep="") → paste0(...)');
    }

    // ── 15. T / F as booleans ─────────────────────────────────────────────────
    if (/\bT\b(?!\w)/.test(trimmed) && !/^\s*#/.test(trimmed)) {
      push('warning', lineNum,
        `Line ${lineNum}: "T" used as boolean — T can be overwritten by assignment; use TRUE`,
        'Change T → TRUE');
    }
    if (/\bF\b(?!\w)/.test(trimmed) && !/^\s*#/.test(trimmed)) {
      push('warning', lineNum,
        `Line ${lineNum}: "F" used as boolean — F can be overwritten by assignment; use FALSE`,
        'Change F → FALSE');
    }

    // ── 16. Missing library for common functions ───────────────────────────────
    if (/\bggplot\s*\(/.test(trimmed) && !lines.some(l => /library\s*\(\s*ggplot2\s*\)/.test(l))) {
      push('warning', lineNum,
        `Line ${lineNum}: ggplot() used without library(ggplot2)`,
        'Add at top: library(ggplot2)');
    }
    if (/\b(mutate|filter|select|group_by|summarise|arrange|rename)\s*\(/.test(trimmed) &&
        !lines.some(l => /library\s*\(\s*dplyr\s*\)/.test(l))) {
      push('warning', lineNum,
        `Line ${lineNum}: dplyr function used without library(dplyr)`,
        'Add at top: library(dplyr)');
    }

    // ── 17. Deprecated $ on NULL object ───────────────────────────────────────
    if (/NULL\s*\$/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: Accessing $ on NULL will produce NULL — check that the object exists first`,
        'Use is.null(obj) before accessing obj$field');
    }

    // ── 18. rbind in a loop (performance) ─────────────────────────────────────
    if (/\brbind\s*\(/.test(trimmed) && lines.slice(Math.max(0, i - 5), i).some(l => /\bfor\b/.test(l))) {
      push('warning', lineNum,
        `Line ${lineNum}: rbind() inside a loop is O(n²) — pre-allocate a list and rbind once outside the loop`,
        'Use: result <- vector("list", n); for (...) { result[[i]] <- ... }; do.call(rbind, result)');
    }

    // ── 19. Unterminated string literal ───────────────────────────────────────
    {
      let inSingle = false, inDouble = false;
      for (let ci = 0; ci < trimmed.length; ci++) {
        const ch = trimmed[ci];
        if (ch === '\\') { ci++; continue; }
        if (!inDouble && ch === "'") { inSingle = !inSingle; continue; }
        if (!inSingle && ch === '"') { inDouble = !inDouble; continue; }
      }
      if (inSingle || inDouble) {
        push('error', lineNum,
          `Line ${lineNum}: Unterminated string literal — the string was opened with a quote but never closed`,
          "Add the matching closing quote: x <- 'Hello'");
      }
    }

    // ── 20. Unclosed paren/bracket on ANY R assignment ────────────────────────
    if (/^\w+\s*(<-|=)\s*\S/.test(trimmed) && !/[,\\+|&]\s*$/.test(trimmed)) {
      const eqIdx = trimmed.search(/(<-|=)/);
      const expr = trimmed.slice(eqIdx + 2);
      const s2 = expr.replace(/"[^"]*"|'[^']*'/g, '""');
      const opens  = (s2.match(/\(/g) || []).length - (s2.match(/\)/g) || []).length;
      const square = (s2.match(/\[/g) || []).length - (s2.match(/\]/g) || []).length;
      if (opens > 0) {
        push('error', lineNum,
          `Line ${lineNum}: Unclosed parenthesis — expression has ${opens} opening "(" without a matching ")"`,
          'Add the missing closing parenthesis: x <- c(1, 2, 3)');
      } else if (square > 0) {
        push('error', lineNum,
          `Line ${lineNum}: Unclosed bracket — expression has ${square} opening "[" without a matching "]"`,
          'Add the missing closing bracket: x <- df[1, ]');
      }
    }

    // ── 21. na.rm=TRU / na.rm=FALS typos ─────────────────────────────────────
    if (/\bna\.rm\s*=\s*(TRU|FALS)\b/.test(trimmed)) {
      const got = trimmed.match(/\bna\.rm\s*=\s*(TRU|FALS)\b/)[1];
      push('error', lineNum,
        `Line ${lineNum}: "${got}" is not valid — did you mean na.rm=${got === 'TRU' ? 'TRUE' : 'FALSE'}?`,
        `Change ${got} → ${got === 'TRU' ? 'TRUE' : 'FALSE'}`);
    }

    // ── 22. ggplot layer missing + operator on same line ──────────────────────
    if (/\bggplot\s*\(/.test(trimmed) && /\)\s+(geom_|stat_|scale_|facet_|coord_|theme\s*[_(])\w*\s*\(/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: ggplot layer is missing + operator — use ggplot(...) + geom_*()`,
        'Add + between ggplot and layer: ggplot(...) + geom_point()');
    }
    // ggplot line that ends without + but next line is a layer
    if (/\bggplot\s*\(.*\)\s*$/.test(trimmed)) {
      const nextNE = lines.slice(i + 1).find(l => l.trim() !== '' && !l.trim().startsWith('#'));
      if (nextNE && /^\+?\s*(geom_|stat_|scale_|facet_|coord_|theme\s*[_(])/.test(nextNE.trim()) && !/\+\s*$/.test(trimmed)) {
        push('error', lineNum,
          `Line ${lineNum}: ggplot(...) must end with + to chain layers — e.g. ggplot(...) +`,
          'Add + at the end of the ggplot() line');
      }
    }

    // ── 23. substr() called with fewer than 3 arguments ──────────────────────
    if (/\bsubstr\s*\(/.test(trimmed)) {
      const m = trimmed.match(/\bsubstr\s*\(([^)]*)\)/);
      if (m && m[1].split(',').length < 3) {
        push('error', lineNum,
          `Line ${lineNum}: substr() requires 3 arguments — substr(string, start, stop)`,
          'Add the missing stop argument: substr(s, 1, 5)');
      }
    }

    // ── 24. apply() with non-numeric margin (wrong argument order) ─────────────
    if (/\bapply\s*\(/.test(trimmed)) {
      const m = trimmed.match(/\bapply\s*\(\s*[\w.]+\s*,\s*([^,)]+)/);
      if (m) {
        const margin = m[1].trim();
        if (!/^[12]$/.test(margin)) {
          push('error', lineNum,
            `Line ${lineNum}: apply() second argument (margin) must be 1 (rows) or 2 (columns), got: "${margin}"`,
            'Use apply(data, 2, fun) for columns or apply(data, 1, fun) for rows');
        }
      }
    }

    // ── 25. String argument to numeric sampling/distribution functions ─────────
    if (/\b(rnorm|runif|rpois|rbinom|rexp)\s*\(\s*["']/.test(trimmed)) {
      const fn = trimmed.match(/\b(rnorm|runif|rpois|rbinom|rexp)\s*\(/)[1];
      push('error', lineNum,
        `Line ${lineNum}: ${fn}() first argument (n) must be an integer, not a string`,
        `Use a number: ${fn}(5)`);
    }
    if (/\bsample\s*\([^)]+,\s*["']/.test(trimmed)) {
      push('error', lineNum,
        `Line ${lineNum}: sample() size argument must be an integer, not a string`,
        'Use a number: sample(1:10, 5)');
    }

    // ── 26. Incomplete model formula — trailing operator ───────────────────────
    if (/\bm\s*=\s*lm\b|\blm\s*\(/.test(trimmed) || /~/.test(trimmed)) {
      if (/~[^,)\n]*[+\-*/]\s*[,)]/.test(trimmed) || /~[^,)\n]*[+\-*/]\s*$/.test(trimmed)) {
        push('error', lineNum,
          `Line ${lineNum}: Incomplete model formula — trailing operator with no right-hand term`,
          'Remove the trailing operator or add a variable: lm(y ~ x + z, data=df)');
      }
    }

    // ── 27. break / next at top level (outside any loop) ──────────────────────
    if (/^\s*(break|next)\s*;?\s*$/.test(raw) && braceDepth === 0) {
      const kw = trimmed.replace(/;$/, '');
      push('error', lineNum,
        `Line ${lineNum}: "${kw}" outside a loop — ${kw} can only be used inside a for/while loop`,
        `Move ${kw} inside a loop body: for (...) { ${kw} }`);
    }

    // ── 28. for() loop missing opening brace ──────────────────────────────────
    if (/^for\s*\(.+\)\s*$/.test(trimmed)) {
      const nextNE = lines.slice(i + 1).find(l => l.trim() !== '' && !l.trim().startsWith('#'));
      if (!nextNE || !nextNE.trim().startsWith('{')) {
        push('warning', lineNum,
          `Line ${lineNum}: for() loop body is missing braces — always use { } even for single-line bodies`,
          'Add braces: for (i in 1:n) { statement }');
      }
    }

    // ── 29. function() declaration missing opening brace ──────────────────────
    if (/\bfunction\s*\([^)]*\)\s*$/.test(trimmed) && !/^\s*#/.test(trimmed)) {
      const nextNE = lines.slice(i + 1).find(l => l.trim() !== '' && !l.trim().startsWith('#'));
      if (!nextNE || !nextNE.trim().startsWith('{')) {
        push('warning', lineNum,
          `Line ${lineNum}: function body is missing opening brace — wrap the body in { }`,
          'Add braces: myFn <- function(args) { return(...) }');
      }
    }

    // ── 30. Missing comma between function arguments ───────────────────────────
    // Detects: plot(x y) — two plain identifiers with only whitespace between them
    if (/\b\w+\s*\(\s*\w+\s+\w+\s*\)/.test(trimmed)) {
      // Exclude known patterns: for(i in ...), if(cond), function(...), known 2-word args
      if (!/^(for|if|while|function|switch)\b/.test(trimmed) &&
          !/\b(in|else|and|or)\b/.test(trimmed)) {
        push('error', lineNum,
          `Line ${lineNum}: Missing comma between function arguments — use func(arg1, arg2)`,
          'Add comma: plot(x, y)');
      }
    }

    // ── 31. Aggregation functions called with no arguments ────────────────────
    if (/\b(mean|sum|sd|var|median|max|min|length|nrow|ncol)\s*\(\s*\)/.test(trimmed)) {
      const fn = trimmed.match(/\b(mean|sum|sd|var|median|max|min|length|nrow|ncol)\s*\(\s*\)/)[1];
      push('error', lineNum,
        `Line ${lineNum}: ${fn}() called with no arguments — provide a vector or data frame`,
        `Use ${fn}(x) where x is a numeric vector`);
    }

    // ── 32. Single-bracket subscript with unquoted symbol: list1[age] ─────────
    {
      const m = trimmed.match(/\b(\w+)\[([a-zA-Z]\w*)\]/);
      if (m && !['TRUE','FALSE','NULL','NA','T','F'].includes(m[2]) && !/^\d/.test(m[2])) {
        push('error', lineNum,
          `Line ${lineNum}: "${m[2]}" is used as a subscript but is not defined — did you mean "${m[1]}"[["${m[2]}"]]?`,
          `Use double brackets with quotes: ${m[1]}[["${m[2]}"]]`);
      }
    }

    // ── 33. Unclosed paren on non-assignment lines (return, print, etc.) ───────
    if (!/^\w+\s*(<-|=)\s*/.test(trimmed) && !/[,\\+|&]\s*$/.test(trimmed) && /\(/.test(trimmed)) {
      const s3 = trimmed.replace(/"[^"]*"|'[^']*'/g, '""');
      const opens = (s3.match(/\(/g) || []).length - (s3.match(/\)/g) || []).length;
      if (opens > 0 && !/^\s*(for|if|while|else)\b/.test(trimmed)) {
        push('error', lineNum,
          `Line ${lineNum}: Unclosed parenthesis — ${opens} opening "(" without a matching ")"`,
          'Add the missing closing parenthesis');
      }
    }

    // ── 34. Assignment to reserved constants ──────────────────────────────────
    {
      const RESERVED = /^(NA|TRUE|FALSE|NULL|Inf|NaN|T|F|NA_integer_|NA_real_|NA_complex_|NA_character_)\s*(<-|=(?!=))/;
      if (RESERVED.test(trimmed)) {
        const name = trimmed.match(RESERVED)[1];
        push('error', lineNum,
          `Line ${lineNum}: "${name}" is a reserved constant and cannot be assigned to — this will cause unexpected behaviour`,
          `Use a different variable name instead of "${name}"`);
      }
    }

    // ── 35. Empty function body ───────────────────────────────────────────────
    // Single-line: function(x) { } or function(x) {}
    if (/\bfunction\s*\([^)]*\)\s*\{\s*\}/.test(trimmed)) {
      push('warning', lineNum,
        `Line ${lineNum}: Empty function body — function returns NULL by default; add a return value or body`,
        'Add a body: function(x) { return(x) }');
    }
    // Multi-line: check if this is a function open-brace line and the next non-empty lines are only } 
    if (/\bfunction\s*\([^)]*\)\s*\{/.test(trimmed) && trimmed.endsWith('{')) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && /^\s*\}\s*$/.test(lines[j])) {
        push('warning', lineNum,
          `Line ${lineNum}: Empty function body — function returns NULL; add a return value or body`,
          'Add a return statement: function(args) { return(result) }');
      }
    }

    // ── 36. = instead of == inside if/while conditions ────────────────────────
    // Detects: if(x = y) or while(a = b) — assignment instead of comparison
    {
      const condMatch = trimmed.match(/^(if|while)\s*\((.+)\)/);
      if (condMatch) {
        const cond = condMatch[2];
        // Assignment = that is not ==, !=, <=, >= and not a known named argument like na.rm=
        if (/[^=!<>]=(?!=)/.test(cond) && !/\b(na\.rm|method|lower\.tail|alternative|paired|correct)\s*=/.test(cond)) {
          push('error', lineNum,
            `Line ${lineNum}: Possible assignment (=) used instead of equality (==) inside ${condMatch[1]}() condition`,
            `Change = to == for comparison: ${condMatch[1]}(x == y)`);
        }
      }
    }
  });

  // Unbalanced braces (whole-file)
  if (braceDepth > 0) {
    errors.push({ type: 'error', line: null, language: 'r',
      message: `Unbalanced braces: ${braceDepth} unclosed "{" — missing closing }`,
      fix: `Add ${braceDepth} closing brace(s) "}"` });
  } else if (braceDepth < 0) {
    errors.push({ type: 'error', line: null, language: 'r',
      message: `Unbalanced braces: ${Math.abs(braceDepth)} extra "}" with no matching {`,
      fix: 'Remove extra closing brace(s) or add matching opening braces' });
  }

  return errors;
};

// ── R global pattern checks and auto-fixer ────────────────────────────────────
// R_PATTERNS are global fixes applied AFTER line-by-line checks.
// Only include patterns NOT already covered by checkRLines() to avoid duplicates.
const R_PATTERNS = [
  { re: /==\s*NULL\b/g,   msg: 'Use is.null() to check for NULL, not ==',           fix: c => c.replace(/(\w+)\s*==\s*NULL\b/g, 'is.null($1)') },
  { re: /==\s*NA\b/g,     msg: 'Use is.na() to check for NA, not ==',               fix: c => c.replace(/(\w+)\s*==\s*NA\b/g, 'is.na($1)') },
  { re: /\bsetwd\b/,      msg: 'Avoid setwd() — use here::here() or relative paths', fix: c => c },
  { re: /\battach\s*\(/,  msg: 'Avoid attach() — it pollutes namespace, use $ notation', fix: c => c },
  { re: /\bfor\s*\(\w+\s+in\s+1:nrow/, msg: 'Avoid row-by-row loops — use apply() or dplyr/data.table', fix: c => c },
  { re: /1:length\(/,     msg: 'Avoid 1:length(x) — use seq_along(x) for safety with zero-length vectors', fix: c => c.replace(/1:length\(([^)]+)\)/g, 'seq_along($1)') },
  { re: /1:nrow\(/,       msg: 'Avoid 1:nrow(x) — use seq_len(nrow(x)) for safety with zero rows',       fix: c => c.replace(/1:nrow\(([^)]+)\)/g, 'seq_len(nrow($1))') },
  { re: /\bsapply\b/,     msg: 'sapply() can return different types — use lapply() + explicit coercion',  fix: c => c },
  { re: /library\s*\(\s*["']/, msg: 'library() accepts unquoted names — prefer library(pkg) over library("pkg")', fix: c => c.replace(/library\s*\(\s*["']([^"']+)["']\s*\)/g, 'library($1)') },
  { re: /\bpaste\s*\([^)]*,\s*sep\s*=\s*["']["']/, msg: 'paste(..., sep="") — use paste0() which is cleaner', fix: c => c },
  // Auto-fixes for Python-isms (complement the line error messages with actual fixes)
  { re: /\bTrue\b/,  msg: null, fix: c => c.replace(/\bTrue\b/g, 'TRUE') },
  { re: /\bFalse\b/, msg: null, fix: c => c.replace(/\bFalse\b/g, 'FALSE') },
  { re: /\bNone\b/,  msg: null, fix: c => c.replace(/\bNone\b/g, 'NULL') },
  { re: /\blen\s*\(/, msg: null, fix: c => c.replace(/\blen\s*\(/g, 'length(') },
  { re: /(\w+)\s*=\s*(function\s*\()/, msg: null, fix: c => c.replace(/(\w+)\s*=\s*(function\s*\()/g, '$1 <- $2') },
  { re: /\bT\b(?!\w)/, msg: null, fix: c => c.replace(/\bT\b(?!\w)/g, 'TRUE') },
  { re: /\bF\b(?!\w)/, msg: null, fix: c => c.replace(/\bF\b(?!\w)/g, 'FALSE') },
];

// ── R auto-fixer (line-by-line) ───────────────────────────────────────────────
const fixRCode = (code) => {
  const lines = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const fixed = lines.map(raw => {
    let line = raw;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;

    // Python True/False/None → R TRUE/FALSE/NULL
    line = line.replace(/\bTrue\b/g, 'TRUE');
    line = line.replace(/\bFalse\b/g, 'FALSE');
    line = line.replace(/\bNone\b/g, 'NULL');

    // len(x) → length(x)
    line = line.replace(/\blen\s*\(/g, 'length(');

    // T / F shorthand → TRUE / FALSE (only as standalone tokens, not in variable names)
    line = line.replace(/\bT\b(?!\w)/g, 'TRUE');
    line = line.replace(/\bF\b(?!\w)/g, 'FALSE');

    // = for function assignment → <-
    line = line.replace(/^(\s*)(\w+)\s*=\s*(function\s*\()/, '$1$2 <- $3');

    // 1:length(x) → seq_along(x)
    line = line.replace(/1:length\(([^)]+)\)/g, 'seq_along($1)');

    // 1:nrow(x) → seq_len(nrow(x))
    line = line.replace(/1:nrow\(([^)]+)\)/g, 'seq_len(nrow($1))');

    // library("pkg") → library(pkg)
    line = line.replace(/library\s*\(\s*["']([^"']+)["']\s*\)/g, 'library($1)');

    // Python-style for: for x in vec → for (x in vec) {
    line = line.replace(/^(\s*)for\s+(\w+)\s+in\s+(.+)$/, (m, ind, v, iter) => {
      const clean = iter.trimEnd().replace(/:$/, '');
      return `${ind}for (${v} in ${clean}) {`;
    });

    // Python-style if/while without parens: if x > 5: → if (x > 5) {
    line = line.replace(/^(\s*)(if|while)\s+([^({\n].+?)(?::)?\s*$/, (m, ind, kw, cond) => {
      const c = cond.trim().replace(/:$/, '');
      return `${ind}${kw} (${c}) {`;
    });

    // = instead of == inside if/while condition: if(x = 5) → if(x == 5)
    line = line.replace(/^(\s*(?:if|while)\s*\()([^)]+)(\)\s*)/, (m, open, cond, close) => {
      if (!/\b(na\.rm|method|lower\.tail|alternative|paired|correct)\s*=/.test(cond)) {
        const fixed2 = cond.replace(/([^=!<>])=(?!=)/g, '$1==');
        return open + fixed2 + close;
      }
      return m;
    });

    // elif → } else if (...)
    line = line.replace(/^(\s*)elif\s+([^:]+):?\s*$/, '$1} else if ($2) {');

    // Python def → R function assignment
    line = line.replace(/^(\s*)def\s+(\w+)\s*\(([^)]*)\)\s*:?\s*$/, '$1$2 <- function($3) {');

    // Unclosed paren/bracket on simple R assignment: x <- c(1,2,3 → x <- c(1,2,3)
    if (/^\s*\w+\s*(<-|=)\s*[(\[c(]/.test(line) && !/[,\\]\s*$/.test(line)) {
      const eqIdx = line.search(/(<-|=)/);
      const expr = line.slice(eqIdx + 2);
      const opens  = (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;
      const square = (expr.match(/\[/g) || []).length - (expr.match(/\]/g) || []).length;
      if (opens > 0)  line = line.trimEnd() + ')'.repeat(opens);
      else if (square > 0) line = line.trimEnd() + ']'.repeat(square);
    }

    // Unterminated string literal — walk chars and close open quote
    {
      let inSingle = false, inDouble = false;
      const t = line.trimEnd();
      for (let ci = 0; ci < t.length; ci++) {
        const ch = t[ci];
        if (ch === '\\') { ci++; continue; }
        if (!inDouble && ch === "'") { inSingle = !inSingle; continue; }
        if (!inSingle && ch === '"') { inDouble = !inDouble; continue; }
      }
      if (inSingle) line = t + "'";
      else if (inDouble) line = t + '"';
    }

    return line;
  });
  return fixed.join('\n');
};

const analyzeR = (code) => {
  const normalized = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const lineErrors = checkRLines(lines);

  // Apply line-by-line fixer first, then global pattern fixer on top
  let fixed = fixRCode(normalized);

  const existingMsgs = new Set(lineErrors.map(e => e.message));
  const globalErrors = [];

  for (const p of R_PATTERNS) {
    const re = new RegExp(p.re.source, (p.re.flags || '').replace('g', ''));
    if (re.test(normalized)) {
      const match = normalized.match(re);
      if (p.msg) {
        const lineNum = match ? normalized.substring(0, match.index).split('\n').length : null;
        const msg = lineNum ? `Line ${lineNum}: ${p.msg}` : p.msg;
        if (!existingMsgs.has(msg)) {
          globalErrors.push({ type: 'warning', message: msg, language: 'r', line: lineNum });
          existingMsgs.add(msg);
        }
      }
      if (p.fix) fixed = p.fix(fixed);
    }
  }

  const allErrors = [...lineErrors, ...globalErrors];
  allErrors.sort((a, b) => (a.line || 9999) - (b.line || 9999));

  return { errors: allErrors, fixed: fixed !== normalized ? fixed : null, suggestions: generateRSuggestions(code) };
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

// ── Groq AI fix suggestion ────────────────────────────────────────────────────
const extractCodeFromResponse = (text, language) => {
  if (!text) return null;

  // 1. Prefer a fully-closed fenced block (```lang ... ```)
  const strict = text.match(/```[\w]*\n?([\s\S]*?)```/);
  if (strict) return strict[1].trim();

  // 2. Truncated response — opening fence present but no closing fence
  //    (finish_reason=length, model ran out of tokens mid-output)
  const openFence = text.match(/```[\w]*\n?([\s\S]+)/);
  if (openFence) return openFence[1].trim();

  // 3. No fences at all — model returned raw code (common for short fixes)
  //    Accept only if it looks like actual code (contains SQL/Python keywords)
  const codeKeywords = { sql: /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WITH|FROM|WHERE)\b/i, python: /\b(import|def|class|return|for|if|print)\b/, r: /\b(library|function|data\.frame|read_csv|ggplot)\b/ };
  const kw = codeKeywords[language] || codeKeywords.sql;
  if (kw.test(text) && text.split('\n').length > 1) return text.trim();

  return null;
};

const groqAIFix = (code, language, errors) => new Promise((resolve) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return resolve(null);

  // Use a larger, smarter model for Python/R; 8b-instant for SQL (faster)
  const model = (language === 'python' || language === 'r')
    ? 'llama-3.3-70b-versatile'
    : 'llama-3.1-8b-instant';

  // For very large files send only the erroneous sections with 5-line context
  let codeToSend = code;
  if (code.length > 6000) {
    const codeLines = code.split('\n');
    const errorLines = new Set(errors.map(e => e.line).filter(Boolean));
    const contextLines = new Set();
    for (const el of errorLines) {
      for (let k = Math.max(0, el - 6); k <= Math.min(codeLines.length - 1, el + 4); k++) {
        contextLines.add(k);
      }
    }
    const selectedLines = [...contextLines].sort((a, b) => a - b);
    const numbered = selectedLines.map(idx => `${idx + 1}: ${codeLines[idx]}`).join('\n');
    codeToSend = `# [Showing ${selectedLines.length} lines around errors — total file is ${codeLines.length} lines]\n` + numbered;
  }

  const errorSummary = errors.slice(0, 15).map(e => `- ${e.message}`).join('\n');
  const prompt = `You are a ${language.toUpperCase()} syntax expert. Fix ALL errors listed below in the code.\n\nDetected errors:\n${errorSummary}\n\nCode:\n\`\`\`${language}\n${codeToSend}\n\`\`\`\n\nRules:\n1. Output ONLY the corrected, complete code.\n2. Wrap it in a single \`\`\`${language} ... \`\`\` fenced block.\n3. Never add explanations, comments about changes, or any prose outside the code block.`;

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: `You are a precise ${language.toUpperCase()} code fixer. Output ONLY a single fenced \`\`\`${language} ... \`\`\` code block. No explanations whatsoever.` },
      { role: 'user', content: prompt },
    ],
    max_tokens: 8192,
    temperature: 0.05,
  });

  const options = {
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.error) { resolve(null); return; }
        const text = json.choices?.[0]?.message?.content || '';
        resolve(extractCodeFromResponse(text, language));
      } catch { resolve(null); }
    });
  });
  req.on('error', () => resolve(null));
  req.setTimeout(30000, () => { req.destroy(); resolve(null); });
  req.write(body);
  req.end();
});

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
    const { code, language = 'sql', useAI = false } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });

    let result;
    const lang = language.toLowerCase();
    if (lang === 'sql') result = analyzeSQL(code);
    else if (lang === 'python' || lang === 'py') result = analyzePython(code);
    else if (lang === 'r') result = analyzeR(code);
    else return res.status(400).json({ error: 'Language must be sql, python, or r' });

    // If there are errors and AI is requested (or GROQ key is available), get AI fix
    let aiFixedCode = null;
    const hasGroq = !!process.env.GROQ_API_KEY;
    if (result.errors.length > 0 && (useAI || hasGroq)) {
      aiFixedCode = await groqAIFix(code, lang, result.errors);
    }

    await pool.query(
      'INSERT INTO syntax_sessions (language, code, errors, suggestions, fixed_code, user_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [lang, code.slice(0, 5000), JSON.stringify(result.errors), JSON.stringify(result.suggestions), result.fixed || aiFixedCode, req.user.id]
    ).catch(() => {});

    res.json({
      language: lang,
      errorCount: result.errors.length,
      errors: result.errors,
      suggestions: result.suggestions,
      fixedCode: result.fixed,
      aiFixedCode,
      isClean: result.errors.length === 0,
      hasAI: hasGroq,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Standalone AI fix endpoint — called explicitly when user clicks "AI Fix"
router.post('/ai-fix', authenticate, async (req, res) => {
  try {
    const { code, language = 'sql', errors = [] } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });
    if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'AI fix not available — GROQ_API_KEY not configured' });

    const lang = language.toLowerCase();
    // Run static analysis if no errors passed in
    let errs = errors;
    if (!errs.length) {
      let result;
      if (lang === 'sql') result = analyzeSQL(code);
      else if (lang === 'python' || lang === 'py') result = analyzePython(code);
      else if (lang === 'r') result = analyzeR(code);
      if (result) errs = result.errors;
    }

    const aiFixed = await groqAIFix(code, lang, errs);
    if (!aiFixed) return res.status(502).json({ error: 'AI fix failed — model did not return corrected code' });

    res.json({ aiFixedCode: aiFixed, errorCount: errs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM syntax_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Alias /sessions → /history (used by some frontend calls)
router.get('/sessions', authenticate, async (req, res) => {
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
