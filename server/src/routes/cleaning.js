const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const {
  removeDuplicates, fillMissingValues, dropMissingRows, normalizeColumn,
  trimStrings, renameColumns, removeOutliers, convertType, standardizeCategories,
  labelEncode, cleanText, validateConstraint, getDataQuality,
} = require('../helpers/dataClean');

const router = express.Router();

const getTableRows = async (datasetId) => {
  const data = await pool.query(`SELECT * FROM data_${datasetId} ORDER BY row_index LIMIT 10000`);
  return data.rows.map(r => { const { row_index, ...rest } = r; return rest; });
};

const saveCleanedRows = async (datasetId, rows) => {
  const tableName = `data_${datasetId}`;
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  await pool.query(`TRUNCATE ${tableName}`);
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valStr = batch.map((row, bi) => `(${cols.map((c, ci) => `$${bi * cols.length + ci + 1}`).join(',')})`).join(',');
    const params = batch.flatMap(row => cols.map(c => String(row[c] ?? '')));
    await pool.query(`INSERT INTO ${tableName} (${cols.map(c=>`"${c.replace(/"/g,'')}"`).join(',')}) VALUES ${valStr}`, params);
  }
  await pool.query('UPDATE datasets SET row_count=$1, updated_at=NOW() WHERE id=$2', [rows.length, datasetId]);
};

// Apply a cleaning operation
router.post('/:datasetId/apply', authenticate, async (req, res) => {
  try {
    const { datasetId } = req.params;
    const { operation, parameters = {} } = req.body;
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });

    let rows = await getTableRows(datasetId);
    const before = rows.length;

    switch (operation) {
      case 'remove_duplicates': rows = removeDuplicates(rows); break;
      case 'fill_missing': rows = fillMissingValues(rows, parameters.strategy || 'mean', parameters.columns || []); break;
      case 'drop_missing_rows': rows = dropMissingRows(rows, parameters.columns || []); break;
      case 'normalize': rows = normalizeColumn(rows, parameters.column, parameters.method || 'minmax'); break;
      case 'trim_strings': rows = trimStrings(rows); break;
      case 'rename_columns': rows = renameColumns(rows, parameters.mapping || {}); break;
      case 'remove_outliers': rows = removeOutliers(rows, parameters.column, parseFloat(parameters.threshold) || 3); break;
      case 'convert_type': rows = convertType(rows, parameters.column, parameters.targetType || 'text'); break;
      case 'standardize_categories': rows = standardizeCategories(rows, parameters.column, parameters.caseMode || 'title', parameters.mapping || {}); break;
      case 'label_encode': rows = labelEncode(rows, parameters.column); break;
      case 'clean_text': rows = cleanText(rows, parameters.column, { lowercase: parameters.lowercase !== false, removePunctuation: parameters.removePunctuation !== false }); break;
      case 'validate_constraint': rows = validateConstraint(rows, parameters.column, parameters.operator || '>=', parameters.value, parameters.action || 'remove'); break;
      default: return res.status(400).json({ error: 'Unknown operation' });
    }

    await saveCleanedRows(datasetId, rows);
    await pool.query(
      'INSERT INTO data_cleaning_jobs (dataset_id, operation, parameters, rows_before, rows_after, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [datasetId, operation, JSON.stringify(parameters), before, rows.length, 'success', req.user.id]
    );
    res.json({ message: 'Cleaning applied', before, after: rows.length, removed: before - rows.length, preview: rows.slice(0, 5) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview cleaning without applying
router.post('/:datasetId/preview', authenticate, async (req, res) => {
  try {
    const { operation, parameters = {} } = req.body;
    let rows = await getTableRows(req.params.datasetId);
    const before = rows.length;
    switch (operation) {
      case 'remove_duplicates': rows = removeDuplicates(rows); break;
      case 'fill_missing': rows = fillMissingValues(rows, parameters.strategy || 'mean', parameters.columns || []); break;
      case 'drop_missing_rows': rows = dropMissingRows(rows, parameters.columns || []); break;
      case 'normalize': rows = normalizeColumn(rows, parameters.column, parameters.method || 'minmax'); break;
      case 'trim_strings': rows = trimStrings(rows); break;
      case 'rename_columns': rows = renameColumns(rows, parameters.mapping || {}); break;
      case 'remove_outliers': rows = removeOutliers(rows, parameters.column, parseFloat(parameters.threshold) || 3); break;
      case 'convert_type': rows = convertType(rows, parameters.column, parameters.targetType || 'text'); break;
      case 'standardize_categories': rows = standardizeCategories(rows, parameters.column, parameters.caseMode || 'title', parameters.mapping || {}); break;
      case 'label_encode': rows = labelEncode(rows, parameters.column); break;
      case 'clean_text': rows = cleanText(rows, parameters.column, { lowercase: parameters.lowercase !== false, removePunctuation: parameters.removePunctuation !== false }); break;
      case 'validate_constraint': rows = validateConstraint(rows, parameters.column, parameters.operator || '>=', parameters.value, parameters.action || 'remove'); break;
      default: return res.status(400).json({ error: 'Unknown operation' });
    }
    res.json({ before, after: rows.length, removed: before - rows.length, preview: rows.slice(0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alias: /scan → /quality
router.get('/:datasetId/scan', authenticate, async (req, res) => {
  try {
    const rows = await getTableRows(req.params.datasetId);
    res.json(getDataQuality(rows));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Quality report
router.get('/:datasetId/quality', authenticate, async (req, res) => {
  try {
    const rows = await getTableRows(req.params.datasetId);
    res.json(getDataQuality(rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cleaning history
router.get('/:datasetId/history', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM data_cleaning_jobs WHERE dataset_id=$1 ORDER BY created_at DESC', [req.params.datasetId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
