"""
checker.py — Deep semantic/type-aware syntax checker for SQL, Python, and R.
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
    return re.sub(r"'[^']*'", "''", line)


def _strip_py_strings(line):
    line = re.sub(r'""".*?"""', '""', line)
    line = re.sub(r"'''.*?'''", "''", line)
    line = re.sub(r'"[^"\\]*"', '""', line)
    line = re.sub(r"'[^'\\]*'", "''", line)
    return line


# ════════════════════════════════════════════════════════════════════════════
# SQL CHECKER
# ════════════════════════════════════════════════════════════════════════════

SQL_STRING_FUNCS  = {'UPPER', 'LOWER', 'LENGTH', 'SUBSTR', 'SUBSTRING',
                     'TRIM', 'LTRIM', 'RTRIM', 'REPLACE', 'CONCAT',
                     'CHARINDEX', 'INSTR', 'LPAD', 'RPAD', 'REVERSE',
                     'LEFT', 'RIGHT', 'INITCAP', 'TRANSLATE'}
SQL_NUMERIC_FUNCS = {'AVG', 'SUM', 'ROUND', 'CEIL', 'CEILING', 'FLOOR',
                     'ABS', 'SQRT', 'MOD', 'POWER', 'EXP', 'LOG', 'LN',
                     'SIGN', 'TRUNC', 'TRUNCATE'}

def check_sql(code):
    errors = []
    raw_lines = _lines(code)
    full_upper = re.sub(r'--[^\n]*', '', code).upper()

    for i, raw in enumerate(raw_lines):
        ln = i + 1
        stripped = re.sub(r'--.*$', '', raw).strip()
        if not stripped:
            continue
        clean = _strip_sql_strings(stripped)
        upper = clean.upper()

        # ── INSERT column/value count mismatch ───────────────────────────
        ins_m = re.search(r'INSERT\s+INTO\s+\w+\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)', upper)
        if ins_m:
            cols_raw = [c.strip() for c in ins_m.group(1).split(',') if c.strip()]
            vals_raw = [v.strip() for v in ins_m.group(2).split(',') if v.strip()]
            if cols_raw and vals_raw and len(cols_raw) != len(vals_raw):
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'sql',
                    'message': (f'Line {ln}: INSERT column/value count mismatch — '
                                f'{len(cols_raw)} column(s) but {len(vals_raw)} value(s)'),
                    'fix': 'Make sure the number of columns equals the number of VALUES'
                })

        # ── Empty IN() / VALUES() ────────────────────────────────────────
        for kw in ('IN', 'VALUES'):
            if re.search(rf'\b{kw}\s*\(\s*\)', upper):
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'sql',
                    'message': f'Line {ln}: Empty {kw}() list — must contain at least one value',
                    'fix': f'Add at least one value: {kw}(1) or {kw}(val1, val2)'
                })

        # ── Negative / zero LIMIT or OFFSET ─────────────────────────────
        m = re.search(r'\bLIMIT\s+(-\d+)', upper)
        if m:
            errors.append({
                'type': 'error', 'line': ln, 'language': 'sql',
                'message': f'Line {ln}: LIMIT cannot be negative (got {m.group(1)})',
                'fix': 'Use a positive integer: LIMIT 10'
            })
        m = re.search(r'\bOFFSET\s+(-\d+)', upper)
        if m:
            errors.append({
                'type': 'error', 'line': ln, 'language': 'sql',
                'message': f'Line {ln}: OFFSET cannot be negative (got {m.group(1)})',
                'fix': 'Use a non-negative integer: OFFSET 0'
            })

        # ── AVG / SUM on non-numeric literal or string column alias ──────
        for fn in SQL_NUMERIC_FUNCS:
            if re.search(rf'\b{fn}\s*\(\s*\'', upper):
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'sql',
                    'message': f'Line {ln}: {fn}() called on a string literal — use it on a numeric column',
                    'fix': f'Example: {fn}(price) instead of {fn}(\'value\')'
                })

        # ── LIKE on non-string (numeric column used with LIKE) ───────────
        if re.search(r'\bLIKE\s+\d', upper):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'sql',
                'message': f'Line {ln}: LIKE requires a string pattern, not a number',
                'fix': "Use a quoted string: LIKE '%abc%'"
            })

        # ── Invalid operators: >> === :=  (Python-style) ─────────────────
        if '>>' in stripped or '===' in stripped:
            errors.append({
                'type': 'error', 'line': ln, 'language': 'sql',
                'message': f'Line {ln}: Invalid operator — SQL uses =, !=, <>, >=, <= (not >> or ===)',
                'fix': 'Use SQL comparison operators: =, <>, >=, <='
            })

        # ── Dangling arithmetic operator at end of expression ────────────
        if re.search(r'(?<!\*)\*\s*$|\+\s*$|\-\s*$', stripped.rstrip(';')):
            # but skip multiplication with * at end of SELECT *
            if not re.search(r'SELECT\s+\*', upper):
                errors.append({
                    'type': 'warning', 'line': ln, 'language': 'sql',
                    'message': f'Line {ln}: Dangling operator at end of line — expression may be incomplete',
                    'fix': 'Complete the arithmetic expression or remove the trailing operator'
                })

        # ── Unescaped single quote inside string literal ─────────────────
        if re.search(r"'[^']*'[^']*'[^']*'", raw):
            pass  # proper double-quoting, ok
        elif re.search(r"'[^']*[^']'[^']*'", raw):
            pass
        raw_str_m = re.findall(r"'[^']*'", raw)
        for s in raw_str_m:
            inner = s[1:-1]
            if "'" in inner and "''" not in inner:
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'sql',
                    'message': f'Line {ln}: Unescaped single quote inside string literal — use \'\' to escape',
                    'fix': "Replace ' with '' inside SQL strings: 'it''s'"
                })
                break

        # ── HAVING without GROUP BY (in the same statement block) ────────
        if 'HAVING' in upper and 'GROUP' not in full_upper:
            errors.append({
                'type': 'error', 'line': ln, 'language': 'sql',
                'message': f'Line {ln}: HAVING without GROUP BY — HAVING filters grouped results and requires GROUP BY',
                'fix': 'Add GROUP BY before HAVING, or use WHERE instead'
            })

        # ── GROUP BY without a column: just GROUP BY; ─────────────────────
        if re.search(r'\bGROUP\s+BY\s*[;,)]', upper) or re.search(r'\bGROUP\s+BY\s*$', upper):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'sql',
                'message': f'Line {ln}: GROUP BY with no column specified',
                'fix': 'Specify column(s): GROUP BY region, product'
            })

        # ── UPDATE without WHERE ──────────────────────────────────────────
        if re.search(r'\bUPDATE\s+\w', upper) and 'WHERE' not in upper and 'SET' in upper:
            errors.append({
                'type': 'warning', 'line': ln, 'language': 'sql',
                'message': f'Line {ln}: UPDATE without WHERE — this will update ALL rows in the table',
                'fix': 'Add WHERE clause to restrict which rows are updated'
            })

        # ── DELETE without WHERE ──────────────────────────────────────────
        if re.search(r'\bDELETE\s+FROM\s+\w', upper) and 'WHERE' not in upper:
            errors.append({
                'type': 'warning', 'line': ln, 'language': 'sql',
                'message': f'Line {ln}: DELETE FROM without WHERE — this will delete ALL rows',
                'fix': 'Add WHERE clause: DELETE FROM table WHERE condition'
            })

        # ── Type mismatch: string compared to number without cast ─────────
        if re.search(r"WHERE\s+\w+\s*=\s*'\d+'", upper) and not re.search(r'CAST|::', upper):
            errors.append({
                'type': 'warning', 'line': ln, 'language': 'sql',
                'message': f'Line {ln}: Comparing a column to a quoted number — if the column is numeric use an unquoted integer',
                'fix': "Use WHERE id = 5 instead of WHERE id = '5' for numeric columns"
            })

        # ── EXISTS without subquery: WHERE EXISTS employees ───────────────
        if re.search(r'\bEXISTS\s+\w+\b', upper) and not re.search(r'\bEXISTS\s*\(', upper) and not re.search(r'\bIF\s+EXISTS\b', upper):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'sql',
                'message': f'Line {ln}: EXISTS must be followed by a subquery — EXISTS (SELECT 1 FROM ...)',
                'fix': 'Use: WHERE EXISTS (SELECT 1 FROM table WHERE condition)'
            })

    return errors


# ════════════════════════════════════════════════════════════════════════════
# PYTHON CHECKER
# ════════════════════════════════════════════════════════════════════════════

# Builtins that take exactly 1 argument
PY_SINGLE_ARG = {'len', 'abs', 'str', 'int', 'float', 'bool', 'list',
                 'tuple', 'set', 'type', 'id', 'hash', 'hex', 'oct',
                 'bin', 'ord', 'chr', 'iter', 'reversed', 'sorted',
                 'repr', 'vars', 'dir', 'callable', 'sum', 'max', 'min',
                 'any', 'all', 'enumerate', 'iter', 'next'}

# Builtins whose first arg must be iterable, not a plain int
PY_NEEDS_ITERABLE = {'len', 'sum', 'max', 'min', 'any', 'all', 'list',
                     'tuple', 'set', 'sorted', 'reversed', 'enumerate'}

# Wrong-args builtins: list(1,2,3) / set(1,2) / dict([1,2]) / sum("abc")
PY_WRONG_ARGS = {
    'list':  r'list\s*\(\s*\d+',
    'tuple': r'tuple\s*\(\s*\d+',
    'set':   r'set\s*\(\s*\d+(?:\s*,\s*\d+)+\s*\)',
    'dict':  r'dict\s*\(\s*\[',
    'len':   r'len\s*\(\s*\d+',
    'abs':   r'abs\s*\(\s*["\']',
    'round': r'round\s*\(\s*["\']',
    'pow':   r'pow\s*\(\s*["\']',
    'sum':   r'sum\s*\(\s*["\']',
}

def check_python(code):
    errors = []
    raw_lines = _lines(code)

    indent_stack = []   # track block indentation for scope checks
    in_async_func = False
    in_func = False
    in_loop = False
    in_class = False

    for i, raw in enumerate(raw_lines):
        ln = i + 1
        stripped = raw.strip()
        if not stripped or stripped.startswith('#'):
            continue
        clean = _strip_py_strings(stripped)

        # ── Detect scope context ─────────────────────────────────────────
        if re.match(r'async\s+def\s+', stripped):
            in_async_func = True
            in_func = True
        elif re.match(r'def\s+', stripped):
            in_async_func = False
            in_func = True
        elif re.match(r'class\s+', stripped):
            in_class = True
        if re.match(r'\s*(for|while)\s+', raw):
            in_loop = True

        # ── Invalid default argument: def f(x=) ──────────────────────────
        if re.search(r'def\s+\w+\s*\([^)]*\w\s*=\s*[,)]', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'python',
                'message': f'Line {ln}: Invalid default argument — missing value after = in function signature',
                'fix': 'Provide a default: def f(x=0) or def f(x=None)'
            })

        # ── *args after **kwargs: def f(**kw, *args) ─────────────────────
        if re.search(r'\*\*\w+\s*,\s*\*\w+', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'python',
                'message': f'Line {ln}: **kwargs must come after *args in function signature',
                'fix': 'Reorder: def f(*args, **kwargs)'
            })

        # ── Duplicate *args in signature ──────────────────────────────────
        stars = re.findall(r'(?<!\*)\*(?!\*)\w+', clean)
        if len(stars) > 1:
            errors.append({
                'type': 'error', 'line': ln, 'language': 'python',
                'message': f'Line {ln}: Multiple *args parameters in one function signature',
                'fix': 'Only one *args parameter is allowed'
            })

        # ── Wrong builtins ────────────────────────────────────────────────
        for fname, pat in PY_WRONG_ARGS.items():
            if re.search(pat, clean):
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'python',
                    'message': f'Line {ln}: Wrong argument type for {fname}() — see Python docs for correct usage',
                    'fix': {
                        'list':  'list() takes an iterable: list(range(5)) not list(1,2,3)',
                        'tuple': 'tuple() takes an iterable: tuple([1,2,3]) not tuple(1,2,3)',
                        'set':   'set() takes an iterable: set([1,2,3]) not set(1,2,3)',
                        'dict':  'dict() takes keyword args or mapping: dict(a=1) not dict([1,2])',
                        'len':   'len() requires a sequence/collection, not a number',
                        'abs':   'abs() requires a numeric argument, not a string',
                        'round': 'round() requires a numeric argument, not a string',
                        'pow':   'pow() requires numeric arguments',
                        'sum':   'sum() requires an iterable of numbers, not a string',
                    }.get(fname, f'{fname}() used incorrectly')
                })

        # ── Incomplete lambda: lambda x: ─────────────────────────────────
        if re.search(r'\blambda\b[^:]*:\s*$', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'python',
                'message': f'Line {ln}: Incomplete lambda — missing expression after colon',
                'fix': 'Add an expression: lambda x: x * 2'
            })

        # ── Wrong raise syntax: raise Exception "message" ────────────────
        if re.search(r'\braise\s+\w+\s+["\']', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'python',
                'message': f'Line {ln}: Wrong raise syntax — use raise Exception("message") with parentheses',
                'fix': 'Use: raise ValueError("message") not raise ValueError "message"'
            })

        # ── await outside async function ──────────────────────────────────
        if re.search(r'\bawait\b', clean) and not in_async_func:
            errors.append({
                'type': 'error', 'line': ln, 'language': 'python',
                'message': f'Line {ln}: await used outside async function — wrap enclosing function with async def',
                'fix': 'Add async keyword: async def my_func():'
            })

        # ── yield outside function ────────────────────────────────────────
        if re.match(r'\s*yield\b', raw) and not in_func:
            errors.append({
                'type': 'error', 'line': ln, 'language': 'python',
                'message': f'Line {ln}: yield outside function — yield can only appear inside a def',
                'fix': 'Wrap in a generator function: def gen(): yield value'
            })

        # ── return outside function ───────────────────────────────────────
        if re.match(r'\s*return\b', raw) and not in_func:
            errors.append({
                'type': 'error', 'line': ln, 'language': 'python',
                'message': f'Line {ln}: return statement outside of a function',
                'fix': 'Place return inside a def block'
            })

        # ── break/continue outside loop ───────────────────────────────────
        for kw in ('break', 'continue'):
            if re.match(rf'\s*{kw}\b', raw) and not in_loop:
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'python',
                    'message': f'Line {ln}: {kw} outside loop — can only be used inside for/while',
                    'fix': f'Place {kw} inside a for or while loop'
                })

        # ── finally without try ───────────────────────────────────────────
        context_block = '\n'.join(raw_lines[max(0, i-10):i])
        if re.match(r'\s*finally\s*:', raw):
            if 'try:' not in context_block and 'except' not in context_block:
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'python',
                    'message': f'Line {ln}: finally without a preceding try block',
                    'fix': 'Wrap code in try/except/finally: try: ... except: ... finally: ...'
                })

        # ── assert with tuple (always truthy) ────────────────────────────
        if re.search(r'\bassert\s*\(', clean) and re.search(r'\bassert\s*\([^)]+,', clean):
            errors.append({
                'type': 'warning', 'line': ln, 'language': 'python',
                'message': f'Line {ln}: assert(condition, message) is always True — assert takes no parentheses',
                'fix': 'Use: assert condition, "message" (no outer parens)'
            })

        # ── sys.exit() with too many arguments ───────────────────────────
        m = re.search(r'\bsys\.exit\s*\(([^)]+)\)', clean)
        if m:
            args = [a.strip() for a in m.group(1).split(',') if a.strip()]
            if len(args) > 1:
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'python',
                    'message': f'Line {ln}: sys.exit() takes at most 1 argument, got {len(args)}',
                    'fix': 'Use: sys.exit(0) or sys.exit("error message")'
                })

        # ── Invalid context manager: with ... as f, g ─────────────────────
        if re.search(r'\bwith\b.+\bas\s+\w+\s*,\s*\w+\s*:', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'python',
                'message': f'Line {ln}: Invalid context manager syntax — "as f, g" is not valid; use "as (f, g)" for tuple unpacking',
                'fix': 'Use: with open(f) as (a, b): or two separate with statements'
            })

        # ── global / nonlocal with non-identifier target ──────────────────
        for kw in ('global', 'nonlocal'):
            m = re.search(rf'\b{kw}\s+(.+)', clean)
            if m:
                targets = [t.strip() for t in m.group(1).split(',')]
                for t in targets:
                    if not re.match(r'^[A-Za-z_]\w*$', t):
                        errors.append({
                            'type': 'error', 'line': ln, 'language': 'python',
                            'message': f'Line {ln}: {kw} requires a valid identifier, got "{t}"',
                            'fix': f'Use: {kw} variable_name'
                        })

        # ── Missing colon on def/class/if/for/while/with/else/elif/try/except ──
        block_kws = ('def ', 'class ', 'if ', 'elif ', 'else', 'for ',
                     'while ', 'with ', 'try', 'except', 'finally', 'async def ')
        is_block = any(stripped.startswith(k) for k in block_kws)
        if is_block and stripped and not stripped.endswith(':') and not stripped.endswith('\\') and not stripped.endswith('(') and '#' not in stripped:
            # multi-line definitions are OK
            if not re.search(r'[\(\[{]', stripped) or re.search(r'[\)\]}]\s*$', stripped):
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'python',
                    'message': f'Line {ln}: Missing colon at end of block statement',
                    'fix': f'Add : at end: {stripped}:'
                })

        # ── Mismatched parentheses in this line ───────────────────────────
        opens  = clean.count('(') + clean.count('[') + clean.count('{')
        closes = clean.count(')') + clean.count(']') + clean.count('}')
        if opens != closes:
            # Could be multi-line; only flag if it looks like a complete statement
            if re.search(r'[;:]$', clean.rstrip()) or (opens == 0 and closes > 0):
                errors.append({
                    'type': 'warning', 'line': ln, 'language': 'python',
                    'message': f'Line {ln}: Possibly unbalanced parentheses/brackets on this line',
                    'fix': 'Check opening and closing brackets are balanced'
                })

    return errors


# ════════════════════════════════════════════════════════════════════════════
# R CHECKER
# ════════════════════════════════════════════════════════════════════════════

R_NUMERIC_FUNCS = {'mean', 'sum', 'sd', 'var', 'median', 'min', 'max',
                   'range', 'abs', 'sqrt', 'exp', 'log', 'log2', 'log10',
                   'ceiling', 'floor', 'round', 'cumsum', 'cummax', 'cummin',
                   'prod', 'diff', 'scale', 'cor', 'cov'}

R_MULTI_ARG_WRONG = {
    'mean':   r'mean\s*\(\s*\d+\s*,\s*\d+',
    'sum':    r'sum\s*\(\s*["\']',
    'length': r'length\s*\(\s*\d+\s*\)',
    'print':  r'print\s*\(\s*\)',
    'cat':    r'cat\s*\(\s*\)',
}

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

        # ── Wrong arg count: mean(1, 2, 3) — should be mean(c(1,2,3)) ────
        if re.search(r'\bmean\s*\(\s*\d+\s*,', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'r',
                'message': f'Line {ln}: mean() takes a single vector, not comma-separated numbers',
                'fix': 'Use: mean(c(1, 2, 3)) or mean(my_vector)'
            })

        # ── sum("a", "b") — sum on strings ───────────────────────────────
        if re.search(r'\bsum\s*\(\s*["\']', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'r',
                'message': f'Line {ln}: sum() called on a string — sum() requires a numeric vector',
                'fix': 'Use: sum(c(1, 2, 3)) or sum(numeric_column)'
            })

        # ── length(123) — length of a scalar ─────────────────────────────
        if re.search(r'\blength\s*\(\s*\d+\s*\)', clean):
            errors.append({
                'type': 'warning', 'line': ln, 'language': 'r',
                'message': f'Line {ln}: length(scalar) always returns 1 — did you mean nchar() for string length?',
                'fix': 'Use nchar("string") for string length or length(vector) for vector length'
            })

        # ── Empty calls: mean(), sum(), length(), print() ─────────────────
        for fn in ('mean', 'sum', 'length', 'print', 'cat', 'paste', 'c', 'vector'):
            if re.search(rf'\b{fn}\s*\(\s*\)', clean):
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'r',
                    'message': f'Line {ln}: {fn}() called with no arguments',
                    'fix': f'Provide at least one argument: {fn}(x)'
                })

        # ── Missing parentheses in if/for/while ───────────────────────────
        for kw in ('if', 'for', 'while'):
            if re.match(rf'\b{kw}\b\s+[^(]', clean):
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'r',
                    'message': f'Line {ln}: R {kw} requires parentheses around the condition — {kw}(condition)',
                    'fix': f'Add parens: {kw}(condition) {{ ... }}'
                })

        # ── NA + string: NA + "a" ─────────────────────────────────────────
        if re.search(r'\bNA\s*\+\s*["\']|["\'][^"]*["\'][^+]*\+\s*\bNA\b', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'r',
                'message': f'Line {ln}: NA + string — arithmetic with NA and a string is invalid',
                'fix': 'Use paste() for string concatenation: paste("text", x)'
            })

        # ── TRUE/FALSE + string ───────────────────────────────────────────
        if re.search(r'\b(TRUE|FALSE)\s*\+\s*["\']|["\'][^"]*["\'][^+]*\+\s*(TRUE|FALSE)\b', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'r',
                'message': f'Line {ln}: Cannot add TRUE/FALSE to a string',
                'fix': 'Convert first: as.character(TRUE) or use paste()'
            })

        # ── NULL + 1 ──────────────────────────────────────────────────────
        if re.search(r'\bNULL\s*\+\s*\d|\d\s*\+\s*NULL\b', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'r',
                'message': f'Line {ln}: NULL + numeric returns NULL — check for NULL before arithmetic',
                'fix': 'Use: if (!is.null(x)) x + 1 else 0'
            })

        # ── Double commas / trailing commas in arg lists ──────────────────
        if re.search(r',\s*,', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'r',
                'message': f'Line {ln}: Double commas in argument list — missing argument between commas',
                'fix': 'Remove extra comma or fill in missing argument'
            })
        if re.search(r',\s*\)', clean):
            errors.append({
                'type': 'warning', 'line': ln, 'language': 'r',
                'message': f'Line {ln}: Trailing comma before closing parenthesis',
                'fix': 'Remove the trailing comma'
            })

        # ── stop() / warning() without a message ─────────────────────────
        for fn in ('stop', 'warning'):
            if re.search(rf'\b{fn}\s*\(\s*\)', clean):
                errors.append({
                    'type': 'warning', 'line': ln, 'language': 'r',
                    'message': f'Line {ln}: {fn}() called with no message — always provide an informative message',
                    'fix': f'{fn}("Descriptive error message here")'
                })

        # ── error() — nonexistent R function (should be stop()) ──────────
        if re.search(r'\berror\s*\(', clean) and not re.search(r'tryCatch|on\.error|simpleError', clean):
            errors.append({
                'type': 'error', 'line': ln, 'language': 'r',
                'message': f'Line {ln}: error() is not a base R function — did you mean stop()?',
                'fix': 'Use stop("message") to signal errors in R'
            })

        # ── attr() with wrong number of args ─────────────────────────────
        m = re.search(r'\battr\s*\(([^)]+)\)', clean)
        if m:
            args = [a.strip() for a in m.group(1).split(',')]
            if len(args) < 2:
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'r',
                    'message': f'Line {ln}: attr() requires 2 arguments: attr(object, "name")',
                    'fix': 'Use: attr(x, "names") or attr(df, "class")'
                })

        # ── lm / glm without formula ─────────────────────────────────────
        for fn in ('lm', 'glm'):
            m = re.search(rf'\b{fn}\s*\(\s*data\s*=', clean)
            if m:
                errors.append({
                    'type': 'error', 'line': ln, 'language': 'r',
                    'message': f'Line {ln}: {fn}() requires a formula as first argument — {fn}(y ~ x, data=df)',
                    'fix': f'Use: {fn}(y ~ x1 + x2, data = df)'
                })

        # ── lapply / sapply / tapply misuse: wrong arg order ─────────────
        m = re.search(r'\b(lapply|sapply)\s*\(\s*function\s*\(', clean)
        if m:
            fn = m.group(1)
            errors.append({
                'type': 'error', 'line': ln, 'language': 'r',
                'message': f'Line {ln}: {fn}(function(x)...) — first argument must be the vector/list, not the function',
                'fix': f'Use: {fn}(my_list, function(x) x * 2)'
            })

        # ── rbind / cbind with mismatched types hint ─────────────────────
        if re.search(r'\brbind\s*\(\s*\d+\s*,\s*["\']', clean) or re.search(r'\bcbind\s*\(\s*\d+\s*,\s*["\']', clean):
            errors.append({
                'type': 'warning', 'line': ln, 'language': 'r',
                'message': f'Line {ln}: Mixing numeric and string in rbind/cbind will coerce to character',
                'fix': 'Ensure all arguments are the same type, or use a data.frame'
            })

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
