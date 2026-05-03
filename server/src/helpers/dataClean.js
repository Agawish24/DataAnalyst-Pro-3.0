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

// Remove rows where column value is beyond N standard deviations from the mean
const removeOutliers = (rows, column, threshold = 3) => {
  const vals = rows.map(r => parseFloat(r[column])).filter(n => !isNaN(n));
  if (vals.length < 4) return rows;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  if (std === 0) return rows;
  return rows.filter(row => {
    const v = parseFloat(row[column]);
    if (isNaN(v)) return true;
    return Math.abs(v - mean) <= threshold * std;
  });
};

// Cast column values to a target type (numeric, text, date)
const convertType = (rows, column, targetType) => {
  return rows.map(row => {
    const val = row[column];
    let converted = val;
    if (targetType === 'numeric') {
      const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
      converted = isNaN(n) ? null : n;
    } else if (targetType === 'integer') {
      const n = parseInt(String(val).replace(/[^0-9\-]/g, ''), 10);
      converted = isNaN(n) ? null : n;
    } else if (targetType === 'text') {
      converted = val === null || val === undefined ? '' : String(val);
    } else if (targetType === 'date') {
      const d = new Date(val);
      converted = isNaN(d.getTime()) ? val : d.toISOString().slice(0, 10);
    } else if (targetType === 'boolean') {
      const s = String(val).toLowerCase().trim();
      converted = ['true', '1', 'yes', 'y'].includes(s) ? true : ['false', '0', 'no', 'n'].includes(s) ? false : null;
    }
    return { ...row, [column]: converted };
  });
};

// Standardize categorical text: case + trim, plus optional value mapping
const standardizeCategories = (rows, column, caseMode = 'title', mapping = {}) => {
  return rows.map(row => {
    let val = row[column];
    if (val === null || val === undefined) return row;
    let s = String(val).trim();
    if (mapping[s]) { s = mapping[s]; }
    else if (mapping[s.toLowerCase()]) { s = mapping[s.toLowerCase()]; }
    if (caseMode === 'lower') s = s.toLowerCase();
    else if (caseMode === 'upper') s = s.toUpperCase();
    else if (caseMode === 'title') s = s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return { ...row, [column]: s };
  });
};

// Label-encode a categorical column: replace unique values with integers (0-based)
const labelEncode = (rows, column) => {
  const unique = [...new Set(rows.map(r => r[column]).filter(v => v !== null && v !== undefined && v !== ''))].sort();
  const map = Object.fromEntries(unique.map((v, i) => [String(v), i]));
  return rows.map(row => {
    const key = String(row[column]);
    return { ...row, [column]: map[key] !== undefined ? map[key] : null };
  });
};

// Clean text column: lowercase, remove punctuation/extra whitespace
const cleanText = (rows, column, options = {}) => {
  return rows.map(row => {
    let val = row[column];
    if (val === null || val === undefined) return row;
    let s = String(val);
    if (options.lowercase !== false) s = s.toLowerCase();
    if (options.removePunctuation !== false) s = s.replace(/[^\w\s]/g, ' ');
    if (options.collapseWhitespace !== false) s = s.replace(/\s+/g, ' ').trim();
    return { ...row, [column]: s };
  });
};

// Validate a constraint rule; rows failing it are flagged or removed
const validateConstraint = (rows, column, operator, value, action = 'remove') => {
  const num = parseFloat(value);
  const test = (rowVal) => {
    const v = parseFloat(rowVal);
    if (operator === '>=' ) return !isNaN(v) && v >= num;
    if (operator === '<=' ) return !isNaN(v) && v <= num;
    if (operator === '>'  ) return !isNaN(v) && v > num;
    if (operator === '<'  ) return !isNaN(v) && v < num;
    if (operator === '==' ) return String(rowVal) === String(value);
    if (operator === '!=' ) return String(rowVal) !== String(value);
    if (operator === 'not_empty') return rowVal !== null && rowVal !== undefined && rowVal !== '';
    return true;
  };
  if (action === 'remove') return rows.filter(row => test(row[column]));
  if (action === 'flag')   return rows.map(row => ({ ...row, _invalid: !test(row[column]) ? '1' : '' }));
  return rows;
};

const getDataQuality = (rows) => {
  if (!rows.length) return {};
  const cols = Object.keys(rows[0]);
  const report = { totalRows: rows.length, columns: {} };
  for (const col of cols) {
    const vals = rows.map(r => r[col]);
    const missing = vals.filter(v => v === null || v === undefined || v === '').length;
    const nonEmpty = vals.filter(v => v !== null && v !== undefined && v !== '');
    const unique = new Set(nonEmpty).size;
    const nums = nonEmpty.map(Number).filter(n => !isNaN(n));
    const mean = nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : null;
    const std = nums.length && mean !== null
      ? Math.sqrt(nums.reduce((a,b)=>a+(b-mean)**2,0)/nums.length) : null;
    report.columns[col] = {
      missing, missingPct: Math.round(missing / rows.length * 100),
      unique, duplicates: Math.max(0, nonEmpty.length - unique),
      isNumeric: nums.length > rows.length * 0.8,
      ...(nums.length ? {
        min: Math.round(Math.min(...nums) * 100) / 100,
        max: Math.round(Math.max(...nums) * 100) / 100,
        mean: Math.round(mean * 100) / 100,
        std: std !== null ? Math.round(std * 100) / 100 : null,
      } : {}),
      sampleValues: nonEmpty.slice(0, 5).map(String),
    };
  }
  return report;
};

module.exports = {
  removeDuplicates, fillMissingValues, dropMissingRows, normalizeColumn,
  trimStrings, renameColumns, removeOutliers, convertType, standardizeCategories,
  labelEncode, cleanText, validateConstraint, getDataQuality,
};
