// Convert any value to a number — handles dates (→ epoch ms), numeric strings, booleans
const toNumeric = (val) => {
  if (val === null || val === undefined || val === '') return NaN;
  const n = Number(val);
  if (!isNaN(n)) return n;
  // ISO date / datetime strings
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.getTime();
  return NaN;
};

const isDateLike = (vals) => {
  const sample = vals.filter(v => v !== null && v !== undefined && v !== '').slice(0, 20);
  if (!sample.length) return false;
  const parseable = sample.filter(v => !isNaN(new Date(v).getTime()) && isNaN(Number(v)));
  return parseable.length > sample.length * 0.7;
};

const computeStats = (rows, column) => {
  const raw = rows.map(r => r[column]);
  const vals = raw.map(toNumeric).filter(n => !isNaN(n));
  if (!vals.length) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const freq = {};
  vals.forEach(v => freq[v] = (freq[v] || 0) + 1);
  const mode = parseFloat(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
  const outliers = vals.filter(v => v < q1 - 1.5 * (q3 - q1) || v > q3 + 1.5 * (q3 - q1));
  return {
    count: n,
    mean: +mean.toFixed(4),
    median: sorted[Math.floor(n / 2)],
    mode,
    min: sorted[0],
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    variance: +variance.toFixed(4),
    std: +std.toFixed(4),
    q1, q3,
    iqr: +(q3 - q1).toFixed(4),
    skewness: std === 0 ? 0 : +(n * vals.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / ((n - 1) * (n - 2) || 1)).toFixed(4),
    outliers,
  };
};

const computeCorrelation = (rows, col1, col2) => {
  const pairs = rows
    .map(r => [toNumeric(r[col1]), toNumeric(r[col2])])
    .filter(([a, b]) => !isNaN(a) && !isNaN(b));
  if (pairs.length < 2) return null;
  const n = pairs.length;
  const xs = pairs.map(p => p[0]);
  const ys = pairs.map(p => p[1]);
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  const num = pairs.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0);
  const den = Math.sqrt(xs.reduce((a, x) => a + (x - mx) ** 2, 0) * ys.reduce((a, y) => a + (y - my) ** 2, 0));
  return den === 0 ? 0 : +(num / den).toFixed(4);
};

const computeFullSummary = (rows) => {
  if (!rows.length) return {};
  const cols = Object.keys(rows[0]);
  const summary = {};
  for (const col of cols) {
    const allVals = rows.map(r => r[col]);
    const vals = allVals.filter(v => v !== null && v !== undefined && v !== '');
    const totalCount = rows.length;
    const nonNullCount = vals.length;
    const missing = totalCount - nonNullCount;
    const missingPct = +((missing / totalCount) * 100).toFixed(1);

    if (!nonNullCount) {
      summary[col] = { type: 'empty', count: 0, unique: 0, missing, missingPct, topValues: [] };
      continue;
    }

    const nums = vals.map(toNumeric).filter(n => !isNaN(n));
    const dateCol = isDateLike(vals);

    if (dateCol) {
      // Date column — show as categorical but with epoch stats too
      const freq = {};
      vals.forEach(v => {
        // Group by date-only portion for top values
        const d = new Date(v);
        const key = isNaN(d.getTime()) ? v : d.toISOString().slice(0, 10);
        freq[key] = (freq[key] || 0) + 1;
      });
      const topValues = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([v, c]) => ({ value: v, count: c }));
      const epochStats = computeStats(rows, col);
      summary[col] = {
        type: 'date',
        count: nonNullCount,
        unique: Object.keys(freq).length,
        missing, missingPct,
        topValues,
        min: epochStats ? new Date(epochStats.min).toISOString().slice(0, 10) : null,
        max: epochStats ? new Date(epochStats.max).toISOString().slice(0, 10) : null,
      };
    } else if (nums.length > vals.length * 0.5) {
      // Numeric column
      summary[col] = { type: 'numeric', missing, missingPct, ...computeStats(rows, col) };
    } else {
      // Categorical column
      const freq = {};
      vals.forEach(v => freq[String(v)] = (freq[String(v)] || 0) + 1);
      const topValues = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([v, c]) => ({ value: v, count: c }));
      summary[col] = { type: 'categorical', count: nonNullCount, unique: Object.keys(freq).length, missing, missingPct, topValues };
    }
  }
  return summary;
};

// Generate natural-language narrative for a correlation matrix
const generateCorrelationNarratives = (matrix, columns) => {
  const narratives = [];
  const STRONG = 0.6, MODERATE = 0.3;

  // Find all notable pairs (avoid duplicates)
  const seen = new Set();
  const notable = [];
  for (const r of columns) {
    for (const c of columns) {
      if (r === c) continue;
      const key = [r, c].sort().join('|||');
      if (seen.has(key)) continue;
      seen.add(key);
      const val = matrix[r]?.[c];
      if (val !== null && val !== undefined) notable.push({ r, c, val });
    }
  }
  notable.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));

  // Top strong positive correlations
  const strongPos = notable.filter(x => x.val >= STRONG);
  if (strongPos.length) {
    const top3 = strongPos.slice(0, 3);
    narratives.push(`Strong positive relationships: ${top3.map(x => `${x.r} ↔ ${x.c} (+${x.val.toFixed(2)})`).join(', ')}.`);
  }

  // Top strong negative correlations
  const strongNeg = notable.filter(x => x.val <= -MODERATE);
  if (strongNeg.length) {
    const top2 = strongNeg.slice(0, 2);
    narratives.push(`Negative relationships: ${top2.map(x => `${x.r} ↔ ${x.c} (${x.val.toFixed(2)})`).join(', ')}.`);
  }

  // Per-column narrative for top correlated column
  for (const col of columns) {
    const partners = columns
      .filter(c => c !== col && matrix[col]?.[c] !== null)
      .map(c => ({ col: c, val: matrix[col][c] }))
      .filter(x => Math.abs(x.val) >= STRONG)
      .sort((a, b) => Math.abs(b.val) - Math.abs(a.val))
      .slice(0, 3);

    if (partners.length) {
      const parts = partners.map(p => {
        const dir = p.val > 0 ? 'positively' : 'negatively';
        return `${p.col} (${p.val > 0 ? '+' : ''}${p.val.toFixed(2)}, ${dir})`;
      });
      narratives.push(`${col} is strongly correlated with: ${parts.join(', ')}.`);
    }
  }

  // Date column warning
  const dateCols = columns.filter(c => {
    const row = matrix[c];
    return row && Object.values(row).every(v => v === 0 || v === 1 || v === null);
  });
  if (dateCols.length) {
    narratives.push(`Note: Temporal columns (${dateCols.join(', ')}) are converted to epoch time for correlation — interpret with care.`);
  }

  if (!narratives.length) narratives.push('No strong correlations detected. The variables in this dataset appear largely independent.');
  return narratives;
};

const computeCorrelationMatrix = (rows) => {
  if (!rows.length) return { columns: [], matrix: {}, narratives: [] };
  const cols = Object.keys(rows[0]).filter(col => {
    const vals = rows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
    const nums = vals.map(toNumeric).filter(n => !isNaN(n));
    return nums.length > rows.length * 0.4; // include date cols (epoch-converted)
  });
  const matrix = {};
  for (const c1 of cols) {
    matrix[c1] = {};
    for (const c2 of cols) matrix[c1][c2] = computeCorrelation(rows, c1, c2);
  }
  const narratives = generateCorrelationNarratives(matrix, cols);
  return { columns: cols, matrix, narratives };
};

module.exports = { computeStats, computeCorrelation, computeFullSummary, computeCorrelationMatrix, generateCorrelationNarratives };
