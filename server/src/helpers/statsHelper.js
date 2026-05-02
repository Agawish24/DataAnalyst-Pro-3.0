const computeStats = (rows, column) => {
  const vals = rows.map(r => parseFloat(r[column])).filter(n => !isNaN(n));
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
  const mode = parseFloat(Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0]);
  return {
    count: n, mean: +mean.toFixed(4), median: sorted[Math.floor(n / 2)],
    mode, min: sorted[0], max: sorted[n - 1], range: sorted[n - 1] - sorted[0],
    variance: +variance.toFixed(4), std: +std.toFixed(4),
    q1, q3, iqr: +(q3 - q1).toFixed(4),
    skewness: +(n * vals.reduce((a,b)=>a+((b-mean)/std)**3,0)/((n-1)*(n-2))).toFixed(4),
    outliers: vals.filter(v => v < q1 - 1.5*(q3-q1) || v > q3 + 1.5*(q3-q1))
  };
};

const computeCorrelation = (rows, col1, col2) => {
  const pairs = rows.map(r => [parseFloat(r[col1]), parseFloat(r[col2])]).filter(([a,b]) => !isNaN(a) && !isNaN(b));
  if (pairs.length < 2) return null;
  const n = pairs.length;
  const [xs, ys] = [pairs.map(p=>p[0]), pairs.map(p=>p[1])];
  const mx = xs.reduce((a,b)=>a+b)/n, my = ys.reduce((a,b)=>a+b)/n;
  const num = pairs.reduce((a,[x,y])=>a+(x-mx)*(y-my),0);
  const den = Math.sqrt(xs.reduce((a,x)=>a+(x-mx)**2,0)*ys.reduce((a,y)=>a+(y-my)**2,0));
  return den === 0 ? 0 : +(num/den).toFixed(4);
};

const computeFullSummary = (rows) => {
  if (!rows.length) return {};
  const cols = Object.keys(rows[0]);
  const summary = {};
  for (const col of cols) {
    const vals = rows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
    const nums = vals.map(Number).filter(n => !isNaN(n));
    if (nums.length > vals.length * 0.5) {
      summary[col] = { type: 'numeric', ...computeStats(rows, col) };
    } else {
      const freq = {};
      vals.forEach(v => freq[v] = (freq[v] || 0) + 1);
      const topValues = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([v,c])=>({value:v,count:c}));
      summary[col] = { type: 'categorical', count: vals.length, unique: Object.keys(freq).length, topValues };
    }
  }
  return summary;
};

const computeCorrelationMatrix = (rows) => {
  if (!rows.length) return {};
  const cols = Object.keys(rows[0]).filter(col => {
    const nums = rows.map(r => parseFloat(r[col])).filter(n => !isNaN(n));
    return nums.length > rows.length * 0.5;
  });
  const matrix = {};
  for (const c1 of cols) {
    matrix[c1] = {};
    for (const c2 of cols) matrix[c1][c2] = computeCorrelation(rows, c1, c2);
  }
  return { columns: cols, matrix };
};

module.exports = { computeStats, computeCorrelation, computeFullSummary, computeCorrelationMatrix };
