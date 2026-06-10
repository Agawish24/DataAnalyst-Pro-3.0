"""
checker.py — Comprehensive deep semantic/type-aware syntax checker for SQL, Python, and R.
Exposed as POST /check-syntax  { language, code } → { errors: [...] }

Each error: { type, line, language, message, fix }
"""

import re


# ════════════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════════════

def _lines(code):
    return code.split('\n')


def _strip_sql_strings(line):
    """Replace string literals so we don't false-positive on their contents."""
    return re.sub(r"'[^']*'", "''", line)


def _strip_py_strings(line):
    line = re.sub(r'""".*?"""', '""', line)
    line = re.sub(r"'''.*?'''", "''", line)
    line = re.sub(r'"[^"\\]*"', '""', line)
    line = re.sub(r"'[^'\\]*'", "''", line)
    return line


def _err(ln, lang, msg, fix, kind='error'):
    return {'type': kind, 'line': ln, 'language': lang, 'message': msg, 'fix': fix}


# ════════════════════════════════════════════════════════════════════════════
# SQL CHECKER
# ════════════════════════════════════════════════════════════════════════════

SQL_NUMERIC_FUNCS = {
    'AVG', 'SUM', 'ROUND', 'CEIL', 'CEILING', 'FLOOR', 'ABS', 'SQRT',
    'MOD', 'POWER', 'EXP', 'LOG', 'LN', 'SIGN', 'TRUNC', 'TRUNCATE',
    'STDEV', 'STDDEV', 'VARIANCE', 'VAR',
}
SQL_STRING_FUNCS = {
    'UPPER', 'LOWER', 'LENGTH', 'SUBSTR', 'SUBSTRING', 'TRIM', 'LTRIM',
    'RTRIM', 'REPLACE', 'CONCAT', 'CHARINDEX', 'INSTR', 'LPAD', 'RPAD',
    'REVERSE', 'LEFT', 'RIGHT', 'INITCAP', 'TRANSLATE',
}
# Columns whose names suggest they hold text (heuristic for type-mismatch in SET)
_TEXT_COL_HINTS = {'name', 'email', 'title', 'description', 'label', 'address',
                   'text', 'message', 'comment', 'note', 'status', 'type',
                   'category', 'tag', 'slug', 'username', 'password', 'phone'}


def check_sql(code):
    errors = []
    raw_lines = _lines(code)
    # Strip line comments for whole-query checks
    no_comments = re.sub(r'--[^\n]*', '', code)
    full_upper = no_comments.upper()

    for i, raw in enumerate(raw_lines):
        ln = i + 1
        stripped = re.sub(r'--.*$', '', raw).strip()
        if not stripped:
            continue
        clean = _strip_sql_strings(stripped)
        upper = clean.upper()

        # ── INSERT col/value count mismatch ──────────────────────────────────
        ins = re.search(r'INSERT\s+INTO\s+\w+\s*\(([^)]+)\)\s*VALUES\s*\(([^)]*)\)', upper)
        if ins:
            cols = [c.strip() for c in ins.group(1).split(',') if c.strip()]
            vals = [v.strip() for v in ins.group(2).split(',') if v.strip()]
            if cols and vals and len(cols) != len(vals):
                errors.append(_err(ln, 'sql',
                    f'Line {ln}: INSERT column/value count mismatch — {len(cols)} column(s) but {len(vals)} value(s)',
                    'Make sure the number of columns matches the number of VALUES'))
        # INSERT with no column list but extra VALUES
        ins2 = re.search(r'INSERT\s+INTO\s+\w+\s+VALUES\s*\(([^)]+)\)', upper)
        if ins2:
            n = len([v for v in ins2.group(1).split(',') if v.strip()])
            if n > 20:
                errors.append(_err(ln, 'sql',
                    f'Line {ln}: INSERT VALUES has {n} values — if no column list, verify this matches the table column count',
                    'Add an explicit column list: INSERT INTO t (col1,col2,...) VALUES (...)', 'warning'))

        # ── Empty IN() / VALUES() ─────────────────────────────────────────────
        for kw in ('IN', 'VALUES', 'EXISTS'):
            if re.search(rf'\b{kw}\s*\(\s*\)', upper):
                errors.append(_err(ln, 'sql',
                    f'Line {ln}: Empty {kw}() — must contain at least one value or subquery',
                    f'Add content: {kw}(1) or {kw}(SELECT id FROM ...)'))

        # ── NOT IN without parenthesis ────────────────────────────────────────
        if re.search(r'\bNOT\s+IN\s*(?!\s*\()', upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: NOT IN requires a parenthesised list or subquery — NOT IN (...)',
                'Use: WHERE id NOT IN (1, 2, 3) or NOT IN (SELECT id FROM ...)'))

        # ── Negative / zero LIMIT or OFFSET ──────────────────────────────────
        m = re.search(r'\bLIMIT\s+(-\d+)', upper)
        if m:
            errors.append(_err(ln, 'sql',
                f'Line {ln}: LIMIT cannot be negative (got {m.group(1)})',
                'Use a positive integer: LIMIT 10'))
        m = re.search(r'\bOFFSET\s+(-\d+)', upper)
        if m:
            errors.append(_err(ln, 'sql',
                f'Line {ln}: OFFSET cannot be negative (got {m.group(1)})',
                'Use a non-negative integer: OFFSET 0'))
        # OFFSET with a string value
        if re.search(r"\bOFFSET\s+'", upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: OFFSET requires an integer, not a string literal',
                'Use: OFFSET 10 (unquoted integer)'))

        # ── AVG / numeric functions on string literal ─────────────────────────
        for fn in SQL_NUMERIC_FUNCS:
            if re.search(rf"\b{fn}\s*\(\s*'", upper):
                errors.append(_err(ln, 'sql',
                    f'Line {ln}: {fn}() called on a string literal — use it on a numeric column',
                    f"Example: {fn}(price) not {fn}('value')"))

        # ── LIKE on a number (needs string pattern) ───────────────────────────
        if re.search(r'\bLIKE\s+\d', upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: LIKE requires a string pattern, not a number',
                "Use: col LIKE '%abc%'"))

        # ── Invalid operators: >> === ─────────────────────────────────────────
        if '>>' in stripped:
            errors.append(_err(ln, 'sql',
                f'Line {ln}: Invalid operator >> — SQL uses >, >=, <, <=, =, <>, !=',
                'Replace >> with the correct comparison operator'))
        if '===' in stripped:
            errors.append(_err(ln, 'sql',
                f"Line {ln}: Invalid operator === — SQL uses = for equality (not == or ===)",
                'Use: WHERE id = 5'))
        if re.search(r'(?<!=)={2}(?!=)', stripped) and not re.search(r'==\s*\d', stripped):
            # catch == but not in comments or strings
            if '==' in _strip_sql_strings(stripped):
                errors.append(_err(ln, 'sql',
                    f"Line {ln}: SQL uses single = for equality, not ==",
                    'Use: WHERE col = value'))

        # ── Dangling AND / OR at end of line ─────────────────────────────────
        if re.search(r'\b(AND|OR)\s*;?\s*$', upper.rstrip()):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: Dangling {re.search(r"AND|OR", upper).group()} — condition is incomplete',
                'Complete the condition: AND column = value'))

        # ── Dangling arithmetic operator ──────────────────────────────────────
        stmt_no_select_star = not re.search(r'SELECT\s+\*', upper)
        if stmt_no_select_star and re.search(r'(?<!\*)[+\-]\s*[;]?\s*$', stripped.rstrip(';')):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: Dangling arithmetic operator at end of expression',
                'Complete the expression or remove the trailing operator', 'warning'))

        # ── FORM typo (should be FROM) ────────────────────────────────────────
        if re.search(r'\bFORM\b', upper) and not re.search(r'\bFORM\s+\d', upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: Typo — "FORM" should be "FROM"',
                'Replace FORM with FROM'))

        # ── ORDER without BY ─────────────────────────────────────────────────
        if re.search(r'\bORDER\s+(?!BY\b)\w', upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: ORDER without BY — use ORDER BY column',
                'Use: ORDER BY column_name ASC|DESC'))

        # ── Missing BY after GROUP ────────────────────────────────────────────
        if re.search(r'\bGROUP\s+(?!BY\b)\w', upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: GROUP without BY — use GROUP BY column',
                'Use: GROUP BY column_name'))

        # ── GROUP BY with no columns ──────────────────────────────────────────
        if re.search(r'\bGROUP\s+BY\s*[;,)]', upper) or re.search(r'\bGROUP\s+BY\s*$', upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: GROUP BY with no column specified',
                'Specify column(s): GROUP BY region, product'))

        # ── HAVING without GROUP BY (whole query check) ───────────────────────
        if 'HAVING' in upper and 'GROUP' not in full_upper:
            errors.append(_err(ln, 'sql',
                f'Line {ln}: HAVING without GROUP BY — HAVING filters groups and requires GROUP BY',
                'Add GROUP BY before HAVING, or use WHERE instead'))

        # ── Incomplete subquery: (SELECT) or EXISTS (SELECT) ─────────────────
        if re.search(r'\(\s*SELECT\s*\)', upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: Incomplete subquery — (SELECT) with no columns or FROM clause',
                'Use: (SELECT id FROM table WHERE condition)'))

        # ── UPDATE without WHERE ──────────────────────────────────────────────
        if re.search(r'\bUPDATE\s+\w', upper) and 'WHERE' not in upper and 'SET' in upper:
            errors.append(_err(ln, 'sql',
                f'Line {ln}: UPDATE without WHERE — this will update ALL rows',
                'Add WHERE clause to restrict which rows are updated', 'warning'))

        # ── DELETE without WHERE ──────────────────────────────────────────────
        if re.search(r'\bDELETE\s+FROM\s+\w', upper) and 'WHERE' not in upper:
            errors.append(_err(ln, 'sql',
                f'Line {ln}: DELETE FROM without WHERE — this will delete ALL rows',
                'Add WHERE clause: DELETE FROM table WHERE condition', 'warning'))

        # ── Type mismatch: UPDATE SET text_col = integer ──────────────────────
        set_m = re.findall(r'SET\s+(\w+)\s*=\s*(\d+)', upper)
        for col_name, _ in set_m:
            if col_name.lower() in _TEXT_COL_HINTS:
                errors.append(_err(ln, 'sql',
                    f'Line {ln}: Possible type mismatch — column "{col_name}" appears to be text but is being set to an integer',
                    f"Use a quoted string: SET {col_name} = 'value'", 'warning'))

        # ── Type mismatch: WHERE id = 'abc' (int col = string) ───────────────
        if re.search(r"WHERE\s+\w*id\w*\s*=\s*'[^0-9][^']*'", upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: Possible type mismatch — comparing an ID column to a non-numeric string',
                "If the column is integer, use an unquoted number: WHERE id = 5", 'warning'))

        # ── Wrong string delimiter: double quotes ─────────────────────────────
        if re.search(r'WHERE\s+.*=\s*"[^"]*"', stripped) or re.search(r'SET\s+.*=\s*"[^"]*"', stripped):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: Wrong string delimiter — SQL uses single quotes for strings, not double quotes',
                "Use single quotes: WHERE col = 'value'"))

        # ── Unescaped single quote inside string literal ──────────────────────
        raw_strings = re.findall(r"'([^']*)'", raw)
        for s in raw_strings:
            if "'" in s:
                errors.append(_err(ln, 'sql',
                    f'Line {ln}: Unescaped single quote inside string literal',
                    "Escape with doubling: 'it''s' or use parameterised queries"))
                break

        # ── Boolean / keyword typos ───────────────────────────────────────────
        for typo, fix in [('TRUEE', 'TRUE'), ('FALSEE', 'FALSE'), ('FLASE', 'FALSE'),
                          ('NULLS ', 'NULL '), ('NILL', 'NULL'), ('NULE', 'NULL')]:
            if re.search(rf'\b{typo}\b', upper):
                errors.append(_err(ln, 'sql',
                    f'Line {ln}: Possible typo — "{typo}" should be "{fix}"',
                    f'Replace {typo} with {fix}'))

        # ── Double NOT NOT ────────────────────────────────────────────────────
        if re.search(r'\bNOT\s+NOT\b', upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: Redundant double NOT NOT — double negation cancels out',
                'Remove one NOT or rewrite the condition positively'))

        # ── Invalid number format: 1.2.3 ─────────────────────────────────────
        if re.search(r'\b\d+\.\d+\.\d+\b', stripped):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: Invalid number format — "1.2.3" is not a valid SQL numeric literal',
                'Use a valid number: 1.2 or cast a date string'))

        # ── Invalid hex literal: 0xZZ ─────────────────────────────────────────
        if re.search(r'\b0x[0-9A-Fa-f]*[G-Zg-z][0-9A-Za-z]*\b', stripped):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: Invalid hexadecimal literal — contains non-hex characters',
                'Hex literals use 0-9 and A-F only: 0xFF or 0x1A3C'))

        # ── EXISTS without subquery ───────────────────────────────────────────
        if re.search(r'\bEXISTS\s+\w+\b', upper) and not re.search(r'\bEXISTS\s*\(', upper) \
                and not re.search(r'\bIF\s+EXISTS\b', upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: EXISTS must be followed by a subquery — EXISTS (SELECT 1 FROM ...)',
                'Use: WHERE EXISTS (SELECT 1 FROM table WHERE condition)'))

        # ── BETWEEN with mismatched types (string range for numeric context) ──
        bet = re.search(r'\bBETWEEN\s+\'([^\']+)\'\s+AND\s+\'([^\']+)\'', upper)
        if bet:
            a, b = bet.group(1), bet.group(2)
            if a.isdigit() is False and b.isdigit() is False:
                # Only warn if it looks like non-date text (pure alpha)
                if re.match(r'^[A-Z]+$', a) and re.match(r'^[A-Z]+$', b):
                    errors.append(_err(ln, 'sql',
                        f'Line {ln}: BETWEEN with text strings on a potentially numeric column',
                        "Ensure the column type matches: BETWEEN 10 AND 100 for numbers", 'warning'))

        # ── ESCAPE / SIMILAR TO / REGEXP without pattern ─────────────────────
        for kw in ('ESCAPE', 'SIMILAR TO', 'REGEXP'):
            if re.search(rf'\b{kw}\s*;', upper) or re.search(rf'\b{kw}\s*$', upper):
                errors.append(_err(ln, 'sql',
                    f'Line {ln}: Incomplete {kw} clause — missing the pattern argument',
                    f"Provide a pattern: {kw} '%pattern%'"))

        # ── WHERE comma separator instead of AND ─────────────────────────────
        if re.search(r'\bWHERE\b.*\d\s*,\s*\w+\s*[=<>!]', upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: Possible use of comma instead of AND in WHERE clause',
                'Use AND to combine conditions: WHERE a = 1 AND b = 2', 'warning'))

        # ── SELECT DISTINCT with aggregate without GROUP BY ───────────────────
        if 'DISTINCT' in upper and re.search(r'\bCOUNT\s*\(\s*\*\)', upper) and 'GROUP' not in full_upper:
            errors.append(_err(ln, 'sql',
                f'Line {ln}: SELECT DISTINCT with COUNT(*) but no GROUP BY — likely incorrect',
                'Add GROUP BY or remove DISTINCT: SELECT col, COUNT(*) FROM t GROUP BY col', 'warning'))

        # ── UPDATE SET type mismatch: string col = numeric ─────────────────────
        # (already handled above via _TEXT_COL_HINTS)

        # ── LIKE with integer operand ─────────────────────────────────────────
        if re.search(r'\w+\s+LIKE\s+\d', upper):
            errors.append(_err(ln, 'sql',
                f'Line {ln}: LIKE requires a string column, not a numeric literal as pattern',
                "Use: name LIKE '%John%'"))

    return errors


# ════════════════════════════════════════════════════════════════════════════
# PYTHON CHECKER
# ════════════════════════════════════════════════════════════════════════════

# Wrong-args builtins patterns
PY_WRONG_ARGS = {
    'list':  (r'list\s*\(\s*\d+(?:\s*,\s*[\d"\'])',
              'list() takes one iterable: list(range(5)) or list([1,2,3]), not list(1,2,3)'),
    'tuple': (r'tuple\s*\(\s*\d+(?:\s*,\s*\d+)',
              'tuple() takes one iterable: tuple([1,2,3]) not tuple(1,2,3)'),
    'set':   (r'set\s*\(\s*\d+(?:\s*,\s*\d+)+\s*\)',
              'set() takes one iterable: set([1,2,3]) not set(1,2,3)'),
    'dict':  (r'dict\s*\(\s*\[',
              'dict() takes keyword args or a mapping: dict(a=1) not dict([1,2])'),
    'len':   (r'len\s*\(\s*\d+',
              'len() requires a sequence/collection, not a number'),
    'abs':   (r'abs\s*\(\s*["\']',
              'abs() requires a numeric argument, not a string'),
    'round': (r'round\s*\(\s*["\']',
              'round() requires a numeric argument, not a string'),
    'pow':   (r'pow\s*\(\s*["\']',
              'pow() requires numeric arguments, not strings'),
    'sum':   (r'sum\s*\(\s*["\']',
              'sum() requires an iterable of numbers, not a string'),
}


def _count_paren_depth(s):
    depth = 0
    for ch in s:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
    return depth


def check_python(code):
    errors = []
    raw_lines = _lines(code)

    in_async_func = False
    in_func = False
    in_loop = False
    in_class = False
    # Track open paren depth across lines for multi-line defs
    open_parens = 0

    for i, raw in enumerate(raw_lines):
        ln = i + 1
        stripped = raw.strip()
        if not stripped or stripped.startswith('#'):
            continue
        clean = _strip_py_strings(stripped)

        # ── Scope tracking ────────────────────────────────────────────────────
        if re.match(r'async\s+def\s+', stripped):
            in_async_func = True
            in_func = True
        elif re.match(r'def\s+', stripped):
            in_async_func = False
            in_func = True
        if re.match(r'class\s+', stripped):
            in_class = True
        if re.match(r'\s*(for|while)\s+', raw):
            in_loop = True

        # ── Missing closing parenthesis in def / class signature ──────────────
        # Detect: def foo(x, y  — no closing paren and no continuation marker
        if re.match(r'(async\s+)?def\s+\w+\s*\(', stripped):
            depth = _count_paren_depth(clean)
            if depth > 0 and not stripped.endswith('\\') and not stripped.endswith(','):
                errors.append(_err(ln, 'python',
                    f'Line {ln}: Missing closing parenthesis in function definition',
                    'Add ) to close the parameter list: def foo(x, y):'))
        if re.match(r'class\s+\w+\s*\(', stripped):
            depth = _count_paren_depth(clean)
            if depth > 0 and not stripped.endswith('\\') and not stripped.endswith(','):
                errors.append(_err(ln, 'python',
                    f'Line {ln}: Missing closing parenthesis in class definition',
                    'Add ) to close the base class list: class Foo(Base):'))

        # ── Invalid default argument: def f(x=) or def f(x=,y) ───────────────
        if re.search(r'def\s+\w+\s*\([^)]*\w\s*=\s*[,)]', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: Invalid default argument — missing value after = in function signature',
                'Provide a default: def f(x=0) or def f(x=None)'))

        # ── Positional arg after **kwargs: def f(*args, **kw, extra) ─────────
        if re.search(r'\*\*\w+\s*,\s*\w+[^=*]', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: Positional argument after **kwargs — **kwargs must be last',
                'Reorder: def f(*args, **kwargs) — no params after **kwargs'))

        # ── *args after **kwargs ──────────────────────────────────────────────
        if re.search(r'\*\*\w+\s*,\s*\*\w+', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: **kwargs must come after *args in function signature',
                'Reorder: def f(*args, **kwargs)'))

        # ── Multiple *args ────────────────────────────────────────────────────
        single_stars = re.findall(r'(?<!\*)\*(?!\*)\w+', clean)
        if len(single_stars) > 1:
            errors.append(_err(ln, 'python',
                f'Line {ln}: Multiple *args parameters in one function signature',
                'Only one *args parameter is allowed'))

        # ── Wrong builtins ────────────────────────────────────────────────────
        for fname, (pat, fix_msg) in PY_WRONG_ARGS.items():
            if re.search(pat, clean):
                errors.append(_err(ln, 'python',
                    f'Line {ln}: Wrong argument for {fname}() — {fix_msg}',
                    fix_msg))

        # ── Incomplete lambda ─────────────────────────────────────────────────
        if re.search(r'\blambda\b[^:]*:\s*$', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: Incomplete lambda — missing expression after colon',
                'Add an expression: lambda x: x * 2'))
        # lambda with trailing operator: lambda x: x+
        if re.search(r'\blambda\b.*:\s*\S+\s*[+\-\*/]\s*$', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: Incomplete lambda body — expression ends with a dangling operator',
                'Complete the expression: lambda x: x + 1'))

        # ── Wrong raise syntax: raise Exception "msg" ─────────────────────────
        if re.search(r'\braise\s+\w+\s+["\']', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: Wrong raise syntax — use raise Exception("message") with parentheses',
                'Use: raise ValueError("message") not raise ValueError "message"'))

        # ── await outside async ───────────────────────────────────────────────
        if re.search(r'\bawait\b', clean) and not in_async_func:
            errors.append(_err(ln, 'python',
                f'Line {ln}: await used outside async function',
                'Add async keyword: async def my_func():'))
        # await on a non-awaitable literal
        if re.search(r'\bawait\s+\d', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: await on a numeric literal — can only await coroutines/awaitables',
                'Use: await some_coroutine() not await 123'))
        if re.search(r'\bawait\s+["\']', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: await on a string literal — can only await coroutines/awaitables',
                'Use: await some_coroutine() not await "string"'))

        # ── yield outside function ────────────────────────────────────────────
        if re.match(r'\s*yield\b', raw) and not in_func:
            errors.append(_err(ln, 'python',
                f'Line {ln}: yield outside function — yield can only appear inside a def',
                'Wrap in a generator function: def gen(): yield value'))

        # ── return outside function ───────────────────────────────────────────
        if re.match(r'\s*return\b', raw) and not in_func:
            errors.append(_err(ln, 'python',
                f'Line {ln}: return statement outside of a function',
                'Place return inside a def block'))

        # ── break / continue outside loop ─────────────────────────────────────
        for kw in ('break', 'continue'):
            if re.match(rf'\s*{kw}\b', raw) and not in_loop:
                errors.append(_err(ln, 'python',
                    f'Line {ln}: {kw} outside loop — can only be used inside for/while',
                    f'Place {kw} inside a for or while loop'))

        # ── finally without try ───────────────────────────────────────────────
        context_block = '\n'.join(raw_lines[max(0, i - 10):i])
        if re.match(r'\s*finally\s*:', raw):
            if 'try:' not in context_block and 'except' not in context_block:
                errors.append(_err(ln, 'python',
                    f'Line {ln}: finally without a preceding try block',
                    'Wrap in try/except/finally: try: ... except: ... finally: ...'))

        # ── assert with tuple (always truthy) ────────────────────────────────
        if re.search(r'\bassert\s*\([^)]+,', clean) and not re.search(r'\bassert\s*\([^)]+\)\s*,', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: assert(condition, message) creates a tuple — always truthy',
                'Use: assert condition, "message" (no outer parens)', 'warning'))

        # ── assert with adjacent string literals ─────────────────────────────
        if re.search(r'\bassert\s+.+["\'][^,\n]*["\'][^,]*["\']', stripped):
            errors.append(_err(ln, 'python',
                f'Line {ln}: assert with adjacent string literals — possible missing comma',
                'Use: assert condition, "message" with a comma separating condition and message', 'warning'))

        # ── with ... as f, g (invalid unpacking) ─────────────────────────────
        if re.search(r'\bwith\b.+\bas\s+\w+\s*,\s*\w+\s*:', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: Invalid context manager syntax — "as f, g" is not valid tuple unpacking',
                'Use: with open(f) as (a, b): or use two separate with statements'))

        # ── global / nonlocal with non-identifier ────────────────────────────
        for kw in ('global', 'nonlocal'):
            m = re.search(rf'\b{kw}\s+(.+)', clean)
            if m:
                for t in [t.strip() for t in m.group(1).split(',')]:
                    if t and not re.match(r'^[A-Za-z_]\w*$', t):
                        errors.append(_err(ln, 'python',
                            f'Line {ln}: {kw} requires a valid identifier, got "{t}"',
                            f'Use: {kw} variable_name'))

        # ── del on a non-target ───────────────────────────────────────────────
        if re.search(r'\bdel\s+\d', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: del requires a variable name or subscript, not a numeric literal',
                'Use: del my_var or del my_list[0]'))
        if re.search(r'\bdel\s+["\']', clean):
            errors.append(_err(ln, 'python',
                f'Line {ln}: del requires a variable name or subscript, not a string literal',
                'Use: del my_var'))

        # ── sys.exit() with too many args ─────────────────────────────────────
        m = re.search(r'\bsys\.exit\s*\(([^)]+)\)', clean)
        if m:
            args = [a.strip() for a in m.group(1).split(',') if a.strip()]
            if len(args) > 1:
                errors.append(_err(ln, 'python',
                    f'Line {ln}: sys.exit() takes at most 1 argument, got {len(args)}',
                    'Use: sys.exit(0) or sys.exit("error message")'))

        # ── Missing colon on block statements ────────────────────────────────
        block_kws = ('def ', 'async def ', 'class ', 'if ', 'elif ', 'else',
                     'for ', 'while ', 'with ', 'try', 'except', 'finally')
        is_block = any(stripped.startswith(k) for k in block_kws)
        if is_block and stripped and not stripped.endswith(':') \
                and not stripped.endswith('\\') and not stripped.endswith('(') \
                and '#' not in stripped:
            if not re.search(r'[\(\[{]', stripped) or re.search(r'[\)\]}]\s*$', stripped):
                errors.append(_err(ln, 'python',
                    f'Line {ln}: Missing colon at end of block statement',
                    f'Add : at end: {stripped[:60]}:'))

        # ── Unbalanced parens (complete-looking statement) ────────────────────
        opens  = clean.count('(') + clean.count('[') + clean.count('{')
        closes = clean.count(')') + clean.count(']') + clean.count('}')
        if opens != closes:
            if re.search(r'[;:]$', clean.rstrip()) or (opens == 0 and closes > 0):
                errors.append(_err(ln, 'python',
                    f'Line {ln}: Possibly unbalanced parentheses/brackets on this line',
                    'Check opening and closing brackets are balanced', 'warning'))

        # ── print statement style (Python 2): print "hello" ──────────────────
        if re.match(r'\s*print\s+["\']', raw) and not re.match(r'\s*print\s*\(', raw):
            errors.append(_err(ln, 'python',
                f'Line {ln}: print used as a statement — in Python 3 print is a function',
                'Use: print("hello") with parentheses'))

    return errors


# ════════════════════════════════════════════════════════════════════════════
# R CHECKER
# ════════════════════════════════════════════════════════════════════════════

def check_r(code):
    errors = []
    raw_lines = _lines(code)
    in_func = False

    for i, raw in enumerate(raw_lines):
        ln = i + 1
        stripped = raw.strip()
        if not stripped or stripped.startswith('#'):
            continue
        clean = re.sub(r'"[^"]*"', '""', re.sub(r"'[^']*'", "''", stripped))

        if re.search(r'\bfunction\s*\(', clean):
            in_func = True

        # ── mean(1, 2, 3) — should be mean(c(1,2,3)) ─────────────────────────
        if re.search(r'\bmean\s*\(\s*\d+\s*,', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: mean() takes a single vector, not comma-separated scalars',
                'Use: mean(c(1, 2, 3)) or mean(my_vector)'))

        # ── sum("a", "b") — sum on strings ────────────────────────────────────
        if re.search(r'\bsum\s*\(\s*""', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: sum() called on string(s) — sum() requires a numeric vector',
                'Use: sum(c(1, 2, 3)) or sum(numeric_column)'))

        # ── length(123) — length of scalar always 1 ───────────────────────────
        if re.search(r'\blength\s*\(\s*\d+\s*\)', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: length(scalar) always returns 1 — use nchar() for string length',
                'Use nchar("string") for character count or length(vector) for vector length',
                'warning'))

        # ── Empty calls: mean(), sum(), length(), print(), c() ───────────────
        for fn in ('mean', 'sum', 'length', 'print', 'cat', 'paste', 'c',
                   'vector', 'nchar', 'max', 'min', 'range', 'var', 'sd'):
            if re.search(rf'\b{fn}\s*\(\s*\)', clean):
                errors.append(_err(ln, 'r',
                    f'Line {ln}: {fn}() called with no arguments',
                    f'Provide at least one argument: {fn}(x)'))

        # ── Missing parentheses in if/for/while ───────────────────────────────
        for kw in ('if', 'for', 'while'):
            if re.match(rf'\s*{kw}\s+[^(]', raw) and not re.match(rf'\s*{kw}\s*\(', raw):
                errors.append(_err(ln, 'r',
                    f'Line {ln}: R {kw} requires parentheses around the condition',
                    f'Use: {kw}(condition) {{ ... }}'))

        # ── repeat without braces ─────────────────────────────────────────────
        if re.match(r'\s*repeat\s+[^{]', raw):
            errors.append(_err(ln, 'r',
                f'Line {ln}: repeat body should be enclosed in braces',
                'Use: repeat { ... }'))

        # ── for/while without braces (single-line body) ───────────────────────
        for kw in ('for', 'while'):
            # e.g. "for (i in 1:10) print(i)" — no opening brace
            if re.match(rf'\s*{kw}\s*\(', raw) and not re.search(r'\{', raw) and not re.search(r'\\\s*$', raw):
                errors.append(_err(ln, 'r',
                    f'Line {ln}: {kw} body without braces — single-expression body is legal but fragile',
                    f'Use braces: {kw}(cond) {{ body }}', 'warning'))

        # ── print "hello" — Python-style statement ───────────────────────────
        if re.match(r'\s*print\s+["\']', raw):
            errors.append(_err(ln, 'r',
                f'Line {ln}: print used without parentheses — R requires print("hello")',
                'Use: print("hello") with parentheses'))

        # ── if (cond) expr with missing closing paren ─────────────────────────
        if re.match(r'\s*if\s*\(', raw):
            depth = _count_paren_depth(clean)
            if depth > 0:
                errors.append(_err(ln, 'r',
                    f'Line {ln}: Unclosed parenthesis in if condition',
                    'Add ) to close the condition: if (cond) { ... }'))

        # ── Type errors: NA + "a" ─────────────────────────────────────────────
        if re.search(r'\bNA\s*\+\s*""', clean) or re.search(r'""\s*\+\s*NA\b', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: NA + string — arithmetic with NA and a string is not meaningful',
                'Use paste() for string concatenation: paste("text", x)'))

        # ── TRUE/FALSE + string ───────────────────────────────────────────────
        if re.search(r'\b(TRUE|FALSE)\s*\+\s*""', clean) or re.search(r'""\s*\+\s*(TRUE|FALSE)\b', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: Cannot add TRUE/FALSE to a string',
                'Convert first: as.character(TRUE) or use paste()'))

        # ── NULL + numeric ────────────────────────────────────────────────────
        if re.search(r'\bNULL\s*\+\s*\d|\d\s*\+\s*NULL\b', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: NULL + numeric returns NULL — check for NULL before arithmetic',
                'Use: if (!is.null(x)) x + 1 else 0'))

        # ── Inf + string ──────────────────────────────────────────────────────
        if re.search(r'\bInf\s*\+\s*""', clean) or re.search(r'""\s*\+\s*Inf\b', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: Inf + string is not valid — Inf is numeric, strings require paste()',
                'Use: paste("value:", Inf)'))

        # ── Double commas in arg lists ────────────────────────────────────────
        if re.search(r',\s*,', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: Double commas in argument list — missing argument between commas',
                'Remove extra comma or fill in the missing argument'))

        # ── Trailing comma ────────────────────────────────────────────────────
        if re.search(r',\s*\)', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: Trailing comma before closing parenthesis',
                'Remove the trailing comma'))

        # ── Missing commas between arguments: c(1 2 3) ───────────────────────
        if re.search(r'\bc\s*\(\s*\d+\s+\d+', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: Missing commas in c() — arguments must be separated by commas',
                'Use: c(1, 2, 3)'))

        # ── Missing comma between function args: function(x y) ───────────────
        if re.search(r'\bfunction\s*\(\s*\w+\s+\w+[^,=)]*\)', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: Missing comma between function parameters',
                'Use: function(x, y) { ... }'))

        # ── stop() / warning() with multiple message args ─────────────────────
        for fn in ('stop', 'warning'):
            m = re.search(rf'\b{fn}\s*\(([^)]+)\)', clean)
            if m:
                args = [a.strip() for a in m.group(1).split(',') if a.strip()]
                # stop/warning accept: message, call.=FALSE, domain=NULL — flag if 2+ string args
                str_args = [a for a in args if a.startswith('"') or a.startswith("'")]
                if len(str_args) > 1:
                    errors.append(_err(ln, 'r',
                        f'Line {ln}: {fn}() takes one message string — use paste() to combine strings',
                        f'Use: {fn}(paste("msg1", "msg2"))'))
            # Empty call
            if re.search(rf'\b{fn}\s*\(\s*\)', clean):
                errors.append(_err(ln, 'r',
                    f'Line {ln}: {fn}() called with no message — always provide an informative message',
                    f'{fn}("Descriptive error message here")', 'warning'))

        # ── error() — nonexistent R function ─────────────────────────────────
        if re.search(r'\berror\s*\(', clean) and not re.search(r'tryCatch|on\.error|simpleError|errorCondition', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: error() is not a base R function — use stop() to signal errors',
                'Use stop("message") to signal errors in R'))

        # ── attr() with wrong arg count ───────────────────────────────────────
        m = re.search(r'\battr\s*\(([^)]+)\)', clean)
        if m:
            args = [a.strip() for a in m.group(1).split(',')]
            if len(args) < 2:
                errors.append(_err(ln, 'r',
                    f'Line {ln}: attr() requires 2 arguments: attr(object, "name")',
                    'Use: attr(x, "names") or attr(df, "class")'))
            elif len(args) > 3:
                errors.append(_err(ln, 'r',
                    f'Line {ln}: attr() takes 2-3 arguments (object, name[, exact]) — got {len(args)}',
                    'Use: attr(x, "names") or attr(x, "names", exact=FALSE)'))

        # ── T / F instead of TRUE / FALSE ────────────────────────────────────
        # Only flag standalone T/F not as part of identifiers
        for abbr, full in [('\\bT\\b', 'TRUE'), ('\\bF\\b', 'FALSE')]:
            if re.search(abbr, clean):
                # Ignore T/F in contexts like T <- ... (assignment to T is bad too but different issue)
                if not re.search(rf'{abbr}\s*<-', clean):
                    errors.append(_err(ln, 'r',
                        f'Line {ln}: Use {full} instead of {abbr[2:-2]} — T and F can be overwritten',
                        f'Replace with {full}', 'warning'))

        # ── lm / glm without formula as first arg ────────────────────────────
        for fn in ('lm', 'glm'):
            if re.search(rf'\b{fn}\s*\(\s*data\s*=', clean):
                errors.append(_err(ln, 'r',
                    f'Line {ln}: {fn}() requires a formula as first argument — {fn}(y ~ x, data=df)',
                    f'Use: {fn}(y ~ x1 + x2, data = df)'))

        # ── lapply / sapply first arg is a function (wrong order) ────────────
        m = re.search(r'\b(lapply|sapply|tapply)\s*\(\s*function\s*\(', clean)
        if m:
            fn = m.group(1)
            errors.append(_err(ln, 'r',
                f'Line {ln}: {fn}(function(...)) — first argument must be the data, not the function',
                f'Use: {fn}(my_list, function(x) x * 2)'))

        # ── apply() misuse (wrong margin type) ───────────────────────────────
        if re.search(r'\bapply\s*\(\s*\w+\s*,\s*["\']', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: apply() second argument (MARGIN) must be 1 (rows) or 2 (columns), not a string',
                'Use: apply(matrix, 1, mean) for row-wise or apply(matrix, 2, mean) for column-wise'))

        # ── aggregate() with non-list by ─────────────────────────────────────
        if re.search(r'\baggregate\s*\(\s*[\d:]+\s*,\s*by\s*=\s*[\d:]+', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: aggregate() by= argument must be a list — aggregate(x, by=list(group), FUN=mean)',
                'Use: aggregate(x, by=list(group_col), FUN=mean)'))

        # ── merge() with non-data-frame scalars ──────────────────────────────
        if re.search(r'\bmerge\s*\(\s*\d+\s*:\s*\d+\s*,', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: merge() expects data frames, not integer vectors',
                'Use: merge(df1, df2, by="key_col")'))

        # ── rbind / cbind with mixed types ───────────────────────────────────
        if re.search(r'\b(rbind|cbind)\s*\(\s*\d+\s*,\s*"', clean) or \
           re.search(r'\b(rbind|cbind)\s*\(\s*"\s*,\s*\d+', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: Mixing numeric and string in rbind/cbind will coerce all to character',
                'Ensure all arguments are the same type or use a data.frame', 'warning'))

        # ── plot() / hist() with too many positional args ─────────────────────
        for fn in ('plot', 'hist'):
            m = re.search(rf'\b{fn}\s*\(([^)]+)\)', clean)
            if m:
                pos_args = [a.strip() for a in m.group(1).split(',')
                            if a.strip() and '=' not in a]
                if len(pos_args) > 2:
                    errors.append(_err(ln, 'r',
                        f'Line {ln}: {fn}() has {len(pos_args)} positional args — likely missing named arg labels',
                        f'Use named args: {fn}(x, main="title", xlab="x", ylab="y")', 'warning'))

        # ── matrix() with non-integer nrow/ncol ──────────────────────────────
        if re.search(r'\bmatrix\s*\(.*nrow\s*=\s*""', clean) or \
           re.search(r'\bmatrix\s*\(.*ncol\s*=\s*""', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: matrix() nrow/ncol must be integers, not strings',
                'Use: matrix(1:9, nrow=3, ncol=3)'))

        # ── Anonymous function not assigned (warning) ─────────────────────────
        if re.match(r'\s*function\s*\(', raw) and not re.search(r'<-|=\s*function', raw):
            errors.append(_err(ln, 'r',
                f'Line {ln}: Anonymous function not assigned — result will be discarded',
                'Assign it: my_fn <- function(x) { ... }', 'warning'))

        # ── <- used inside function call argument (common mistake) ───────────
        # e.g. foo(x <- 1)
        if re.search(r'\w+\s*\([^)]*\w+\s*<-\s*\w+[^)]*\)', clean):
            errors.append(_err(ln, 'r',
                f'Line {ln}: <- inside a function argument — use = for named arguments',
                'Use: foo(x = 1) not foo(x <- 1)', 'warning'))

        # ── data.frame with bare identifier (not a=...) ──────────────────────
        if re.search(r'\bdata\.frame\s*\(', clean):
            # Find args and check for bare unquoted identifiers that look like variables
            m = re.search(r'\bdata\.frame\s*\(([^)]+)\)', clean)
            if m:
                args = [a.strip() for a in m.group(1).split(',')]
                for arg in args:
                    # Bare argument with no = sign and not a number or "" 
                    if arg and '=' not in arg and not re.match(r'^[\d"\'.]', arg) \
                            and re.match(r'^[a-zA-Z_]\w*$', arg):
                        errors.append(_err(ln, 'r',
                            f'Line {ln}: data.frame() argument "{arg}" — bare variable must be defined; use named args',
                            f'Use: data.frame(col_name = {arg}) or ensure {arg} is defined', 'warning'))

    return errors


# ════════════════════════════════════════════════════════════════════════════
# Dispatcher
# ════════════════════════════════════════════════════════════════════════════

def run_checks(language, code):
    """Return list of error dicts for the given language/code."""
    lang = language.lower().strip()
    if lang == 'sql':
        return check_sql(code)
    if lang in ('python', 'py'):
        return check_python(code)
    if lang == 'r':
        return check_r(code)
    return [{'type': 'warning', 'line': 1, 'language': lang,
             'message': f'No deep checker available for language: {language}',
             'fix': 'Supported: sql, python, r'}]
