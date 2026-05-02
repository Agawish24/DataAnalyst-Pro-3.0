const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const buildTWB = (dsName, csvFileName, columns) => {
  const colXml = columns.map((c, i) => `
    <column datatype="${c.numeric ? 'real' : 'string'}" name="[${c.name}]" role="${c.numeric ? 'measure' : 'dimension'}" type="${c.numeric ? 'quantitative' : 'nominal'}">
      <caption>${c.name}</caption>
    </column>`).join('');
  return `<?xml version='1.0' encoding='utf-8' ?>
<workbook source-build='2023.1.0' source-platform='win' version='21.1' xmlns:user='http://www.tableausoftware.com/xml/user'>
  <datasources>
    <datasource caption='${dsName}' inline='true' name='${dsName.replace(/\s+/g, '_')}' version='21.1'>
      <connection class='text' dbname='${csvFileName}' filename='${csvFileName}' port='' server='' username=''>
        <relation name='${csvFileName}' table='${csvFileName}' type='text'>
          <columns character-set='UTF-8' header='yes' separator=','>
            ${columns.map(c => `<column name='${c.name}' datatype='${c.numeric ? 'real' : 'string'}' />`).join('\n            ')}
          </columns>
        </relation>
      </connection>
      <aliases enabled='yes' />
      ${colXml}
      <layout bounds='x=0.0,y=0,w=0,h=0' dim-ordering='alphabetic' dim-percentage='0.5' measure-ordering='alphabetic' measure-percentage='0.4' show-structure='true' />
      <semantic-values>
        <semantic-value key='[Country]' value='&quot;United States&quot;' />
      </semantic-values>
    </datasource>
  </datasources>
  <sheets>
    <sheet name='Sheet 1'>
      <title><run>Sheet 1</run></title>
    </sheet>
  </sheets>
  <windows source-sheet='Sheet 1'>
    <window class='worksheet' maximized='true' name='Sheet 1'>
      <cards>
        <edge name='left'>
          <strip size='160'>
            <card type='pages' />
            <card type='filters' />
            <card type='marks' />
          </strip>
        </edge>
        <edge name='top'>
          <strip size='2147483647'>
            <card type='columns' />
          </strip>
        </edge>
        <edge name='right'>
          <strip size='160'>
            <card type='color' />
            <card type='size' />
            <card type='label' />
            <card type='detail' />
            <card type='tooltip' />
          </strip>
        </edge>
      </cards>
      <panes>
        <pane selection-relaxation-option='relaxation-allow-same-encoding'>
          <view>
            <breakdown value='auto' />
          </view>
          <mark class='Automatic' />
        </pane>
      </panes>
      <rows />
      <cols />
    </window>
  </windows>
</workbook>`;
};

const buildTDS = (dsName, csvFileName, columns) => {
  return `<?xml version='1.0' encoding='utf-8' ?>
<datasource caption='${dsName}' name='${dsName.replace(/\s+/g, '_')}' version='21.1' xmlns:user='http://www.tableausoftware.com/xml/user'>
  <connection class='text' dbname='${csvFileName}' filename='${csvFileName}' port='' server='' username=''>
    <relation name='${csvFileName}' table='${csvFileName}' type='text'>
      <columns character-set='UTF-8' header='yes' separator=','>
        ${columns.map(c => `<column name='${c.name}' datatype='${c.numeric ? 'real' : 'string'}' />`).join('\n        ')}
      </columns>
    </relation>
  </connection>
  <aliases enabled='yes' />
  ${columns.map(c => `<column datatype="${c.numeric ? 'real' : 'string'}" name="[${c.name}]" role="${c.numeric ? 'measure' : 'dimension'}" type="${c.numeric ? 'quantitative' : 'nominal'}" />`).join('\n  ')}
</datasource>`;
};

router.get('/datasets', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, row_count, schema, created_at FROM datasets WHERE uploaded_by=$1 ORDER BY created_at DESC', [req.user.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/export/:id/csv', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1 AND uploaded_by=$2', [req.params.id, req.user.id]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const dataset = ds.rows[0];
    const rows = await pool.query(`SELECT * FROM "data_${dataset.id}" ORDER BY row_index LIMIT 100000`);
    if (!rows.rows.length) return res.status(400).json({ error: 'Dataset is empty' });
    const cols = Object.keys(rows.rows[0]).filter(c => c !== 'row_index');
    const header = cols.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
    const body = rows.rows.map(row => cols.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const csvContent = `${header}\n${body}`;
    const fileName = `${dataset.name.replace(/[^a-zA-Z0-9_]/g, '_')}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csvContent);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/export/:id/twb', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1 AND uploaded_by=$2', [req.params.id, req.user.id]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const dataset = ds.rows[0];
    const rawSchema = dataset.schema || [];
    const csvFileName = `${dataset.name.replace(/[^a-zA-Z0-9_]/g, '_')}.csv`;
    const columns = Array.isArray(rawSchema) ? rawSchema.map(s => ({ name: s.name, numeric: s.type === 'numeric' })) : Object.entries(rawSchema).map(([name, type]) => ({ name, numeric: type === 'numeric' }));
    const twb = buildTWB(dataset.name, csvFileName, columns);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${dataset.name.replace(/[^a-zA-Z0-9_]/g, '_')}.twb"`);
    res.send(twb);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/export/:id/tds', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1 AND uploaded_by=$2', [req.params.id, req.user.id]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const dataset = ds.rows[0];
    const rawSchema = dataset.schema || [];
    const csvFileName = `${dataset.name.replace(/[^a-zA-Z0-9_]/g, '_')}.csv`;
    const columns = Array.isArray(rawSchema) ? rawSchema.map(s => ({ name: s.name, numeric: s.type === 'numeric' })) : Object.entries(rawSchema).map(([name, type]) => ({ name, numeric: type === 'numeric' }));
    const tds = buildTDS(dataset.name, csvFileName, columns);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${dataset.name.replace(/[^a-zA-Z0-9_]/g, '_')}.tds"`);
    res.send(tds);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/export/:id/preview', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1 AND uploaded_by=$2', [req.params.id, req.user.id]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const dataset = ds.rows[0];
    const rawSchema = dataset.schema || [];
    const columns = Array.isArray(rawSchema) ? rawSchema.map(s => ({ name: s.name, numeric: s.type === 'numeric' })) : Object.entries(rawSchema).map(([name, type]) => ({ name, numeric: type === 'numeric' }));
    const csvFileName = `${dataset.name.replace(/[^a-zA-Z0-9_]/g, '_')}.csv`;
    res.json({
      name: dataset.name, rowCount: dataset.row_count, columns,
      csvFileName, twbFileName: csvFileName.replace('.csv', '.twb'),
      exportOptions: [
        { id: 'csv', label: 'CSV Data File', desc: 'Raw data Tableau can connect to', ext: '.csv', icon: 'table' },
        { id: 'twb', label: 'Tableau Workbook', desc: 'Workbook with embedded data source connection', ext: '.twb', icon: 'workbook' },
        { id: 'tds', label: 'Tableau Data Source', desc: 'Reusable data source definition', ext: '.tds', icon: 'datasource' },
      ]
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
