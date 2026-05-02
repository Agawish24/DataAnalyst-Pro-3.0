const removeDuplicates = (rows) => {
  const seen = new Set();
  return rows.filter(row => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const fillMissingValues = (rows, strategy = 'none', columns = []) => {
  if (!rows.length) return rows;
  const targetCols = columns.length ? columns : Object.keys(rows[0]);
  const stats = {};
  for (const col of targetCols) {
    const vals = rows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
    const nums = vals.map(Number).filter(n => !isNaN(n));
    if (nums.length) {
      const sorted = [...nums].sort((a, b) => a - b);
      stats[col] = {
        mean: nums.reduce((a, b) => a + b, 0) / nums.length,
        median: sorted[Math.floor(sorted.length / 2)],
        mode: nums.sort((a,b) => nums.filter(v=>v===a).length - nums.filter(v=>v===b).length).pop(),
        isNumeric: true
      };
    } else {
      const freq = {};
      vals.forEach(v => freq[v] = (freq[v] || 0) + 1);
      stats[col] = { mode: Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]?.[0], isNumeric: false };
    }
  }
  return rows.map(row => {
    const newRow = { ...row };
    for (const col of targetCols) {
      const isEmpty = newRow[col] === null || newRow[col] === undefined || newRow[col] === '';
      if (isEmpty && stats[col]) {
        if (strategy === 'mean' && stats[col].isNumeric) newRow[col] = stats[col].mean;
        else if (strategy === 'median' && stats[col].isNumeric) newRow[col] = stats[col].median;
        else if (strategy === 'mode') newRow[col] = stats[col].mode;
        else if (strategy === 'zero') newRow[col] = 0;
        else if (strategy === 'drop') newRow[col] = '__DROP__';
      }
    }
    return newRow;
  }).filter(row => !Object.values(row).includes('__DROP__'));
};

const dropMissingRows = (rows, columns = []) => {
  const targetCols = columns.length ? columns : Object.keys(rows[0] || {});
  return rows.filter(row =>
    targetCols.every(col => row[col] !== null && row[col] !== undefined && row[col] !== '')
  );
};

const normalizeColumn = (rows, column, method = 'minmax') => {
  const vals = rows.map(r => parseFloat(r[column])).filter(n => !isNaN(n));
  if (!vals.length) return rows;
  const min = Math.min(...vals), max = Math.max(...vals);
  const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
  const std = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
  return rows.map(row => {
    const val = parseFloat(row[column]);
    if (isNaN(val)) return row;
    let normalized;
    if (method === 'minmax') normalized = max === min ? 0 : (val - min) / (max - min);
    else if (method === 'zscore') normalized = std === 0 ? 0 : (val - mean) / std;
    else normalized = val;
    return { ...row, [column]: Math.round(normalized * 10000) / 10000 };
  });
};

const trimStrings = (rows) =>
  rows.map(row => Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
  ));

const renameColumns = (rows, mapping) =>
  rows.map(row => Object.fromEntries(
    Object.entries(row).map(([k, v]) => [mapping[k] || k, v])
  ));

const getDataQuality = (rows) => {
  if (!rows.length) return {};
  const cols = Object.keys(rows[0]);
  const report = { totalRows: rows.length, columns: {} };
  for (const col of cols) {
    const vals = rows.map(r => r[col]);
    const missing = vals.filter(v => v === null || v === undefined || v === '').length;
    const unique = new Set(vals.filter(v => v !== null && v !== undefined && v !== '')).size;
    const nums = vals.map(Number).filter(n => !isNaN(n));
    report.columns[col] = {
      missing, missingPct: Math.round(missing / rows.length * 100),
      unique, duplicates: rows.length - missing - unique,
      isNumeric: nums.length > rows.length * 0.8,
      ...(nums.length ? {
        min: Math.min(...nums), max: Math.max(...nums),
        mean: Math.round(nums.reduce((a,b)=>a+b,0)/nums.length * 100) / 100
      } : {})
    };
  }
  return report;
};

module.exports = { removeDuplicates, fillMissingValues, dropMissingRows, normalizeColumn, trimStrings, renameColumns, getDataQuality };
