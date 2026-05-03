import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Table2, Play, Save, RefreshCw, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const MAX_ROW_FIELDS = 3;
const MAX_COL_FIELDS = 2;

const AGGREGATORS = [
  { id: 'sum', label: 'Sum' }, { id: 'avg', label: 'Average' },
  { id: 'count', label: 'Count' }, { id: 'count_distinct', label: 'Count Distinct' },
  { id: 'min', label: 'Min' }, { id: 'max', label: 'Max' },
  { id: 'median', label: 'Median' }, { id: 'stddev', label: 'Std Dev' },
];

const fmt = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v % 1 === 0 ? v.toLocaleString() : v.toFixed(2);
  return String(v);
};

const heatColor = (val, min, max) => {
  if (val === null || max === min) return 'transparent';
  const pct = (val - min) / (max - min);
  return `rgba(99,102,241,${0.06 + pct * 0.44})`;
};

const sel = {
  width: '100%', background: '#0d0d1a',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
  color: '#e2e8f0', padding: '8px 12px', fontSize: 13,
};

export default function PivotTable() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [columns, setColumns] = useState([]);
  const [numCols, setNumCols] = useState([]);
  const [rowFields, setRowFields] = useState([]);
  const [colFields, setColFields] = useState([]);
  const [valueField, setValueField] = useState('');
  const [aggregator, setAggregator] = useState('count');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState([]);
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [cardinalityWarn, setCardinalityWarn] = useState(null);

  useEffect(() => { fetchDatasets(); loadSaved(); }, []);
  useEffect(() => {
    if (activeDataset) {
      loadColumns();
      setRowFields([]);
      setColFields([]);
      setResult(null);
      setCardinalityWarn(null);
    }
  }, [activeDataset]);

  const loadColumns = async () => {
    try {
      const r = await api.get(`/datasets/${activeDataset.id}`);
      const raw = r.data.schema || [];
      const entries = Array.isArray(raw)
        ? raw.map(c => [c.name, c.type])
        : Object.entries(raw);
      const allCols = entries.map(([n]) => n);
      const nums = entries
        .filter(([, t]) => ['integer', 'numeric', 'float', 'double', 'decimal', 'number'].some(k => String(t).toLowerCase().includes(k)))
        .map(([n]) => n);
      setColumns(allCols);
      setNumCols(nums);
      // Auto-select sensible defaults: first non-numeric as row, first numeric as value
      const firstCat = allCols.find(c => !nums.includes(c));
      const firstNum = nums[0] || allCols[0];
      setRowFields(firstCat ? [firstCat] : []);
      setValueField(firstNum || '');
      setAggregator(firstNum ? 'sum' : 'count');
    } catch {}
  };

  const loadSaved = async () => {
    try { const r = await api.get('/pivot/saved'); setSaved(r.data); } catch {}
  };

  const compute = async () => {
    if (!activeDataset) return toast.error('Select a dataset');
    if (!rowFields.length) return toast.error('Select at least one Row Field');
    if (!valueField) return toast.error('Select a Value Field');
    setLoading(true);
    setCardinalityWarn(null);
    try {
      const r = await api.post(`/pivot/${activeDataset.id}/compute`, {
        row_fields: rowFields, col_fields: colFields,
        value_field: valueField, aggregator,
      });
      setResult(r.data);
      toast.success(`Pivot built — ${r.data.nRowKeys} rows × ${r.data.nColKeys === 1 && !colFields.length ? 0 : r.data.nColKeys} cols`);
    } catch (e) {
      const errData = e.response?.data;
      if (errData?.rowKeys || errData?.colKeys) {
        setCardinalityWarn(errData);
      }
      toast.error(errData?.error || 'Pivot failed');
    } finally { setLoading(false); }
  };

  const save = async () => {
    if (!saveName.trim()) return toast.error('Enter a name');
    try {
      await api.post('/pivot/save', {
        name: saveName, dataset_id: activeDataset.id,
        rows_fields: rowFields, cols_fields: colFields,
        value_field: valueField, aggregator,
      });
      toast.success('Pivot saved');
      setShowSave(false); setSaveName(''); loadSaved();
    } catch { toast.error('Save failed'); }
  };

  const loadPivot = (p) => {
    const ds = datasets.find(d => d.id === p.dataset_id);
    if (ds) selectDataset(ds);
    setRowFields(p.rows_fields || []);
    setColFields(p.cols_fields || []);
    setValueField(p.value_field || '');
    setAggregator(p.aggregator || 'sum');
  };

  const toggleField = (col, list, setList, max) => {
    if (list.includes(col)) {
      setList(prev => prev.filter(c => c !== col));
    } else if (list.length < max) {
      setList(prev => [...prev, col]);
    } else {
      toast.error(`Maximum ${max} field${max > 1 ? 's' : ''} allowed`);
    }
  };

  const allValues = result
    ? Object.values(result.matrix).flatMap(row => Object.values(row)).filter(v => v !== null)
    : [];
  const minVal = allValues.length ? Math.min(...allValues) : 0;
  const maxVal = allValues.length ? Math.max(...allValues) : 1;

  const complexityEstimate = () => {
    if (!cardinalityWarn) return null;
    return cardinalityWarn;
  };

  const FieldPicker = ({ label, list, setList, max, accent = '#6366f1', tip }) => {
    const atMax = list.length >= max;
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <label style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
            background: atMax ? `${accent}33` : 'rgba(255,255,255,0.06)',
            color: atMax ? accent : '#4b5563',
          }}>{list.length}/{max}</span>
        </div>
        {tip && <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 5 }}>{tip}</div>}
        <div style={{ background: '#0d0d1a', border: `1px solid ${atMax ? accent + '44' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '6px 4px', maxHeight: 150, overflowY: 'auto' }}>
          {columns.map(c => {
            const checked = list.includes(c);
            const disabled = !checked && atMax;
            return (
              <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, borderRadius: 5, background: checked ? `${accent}18` : 'transparent' }}>
                <input type="checkbox" checked={checked} disabled={disabled}
                  onChange={() => toggleField(c, list, setList, max)}
                  style={{ accentColor: accent }} />
                <span style={{ color: checked ? '#f3f4f6' : '#9ca3af', fontSize: 12, flex: 1 }}>{c}</span>
                {checked && <span style={{ color: accent, fontSize: 10, fontWeight: 700 }}>✓</span>}
              </label>
            );
          })}
        </div>
        {list.length > 0 && (
          <div style={{ color: accent, fontSize: 10, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {list.join(' › ')}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Table2 size={24} color="#3b82f6" /> Pivot Table
        </h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: 13 }}>
          SQL-powered cross-tabulation · max {MAX_ROW_FIELDS} row fields · max {MAX_COL_FIELDS} col fields · up to 2,000 cells
        </p>
      </div>

      {/* Cardinality error */}
      {cardinalityWarn && (
        <div style={{ marginBottom: 16, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ color: '#fca5a5', fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Pivot too large to compute</div>
            <div style={{ color: '#f87171', fontSize: 12 }}>{cardinalityWarn.error}</div>
            {cardinalityWarn.rowKeys && (
              <div style={{ color: '#6b7280', fontSize: 11, marginTop: 6 }}>
                Detected: <span style={{ color: '#f87171' }}>{cardinalityWarn.rowKeys} row groups</span> × <span style={{ color: '#f87171' }}>{cardinalityWarn.colKeys} col groups</span> = {(cardinalityWarn.rowKeys * cardinalityWarn.colKeys).toLocaleString()} cells
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* ── Config panel ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Configuration</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>

              {/* Dataset */}
              <div>
                <label style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Dataset</label>
                <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))} style={sel}>
                  <option value="">Select dataset…</option>
                  {datasets.map(d => <option key={d.id} value={d.id}>{d.name} ({(d.row_count || 0).toLocaleString()} rows)</option>)}
                </select>
              </div>

              {columns.length > 0 && <>
                {/* Value field */}
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Value Field</label>
                  <select value={valueField} onChange={e => setValueField(e.target.value)} style={sel}>
                    <option value="">Select column…</option>
                    {columns.map(c => <option key={c} value={c}>{c}{numCols.includes(c) ? ' (numeric)' : ''}</option>)}
                  </select>
                </div>

                {/* Aggregator */}
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Aggregation</label>
                  <select value={aggregator} onChange={e => setAggregator(e.target.value)} style={sel}>
                    {AGGREGATORS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>

                {/* Row fields */}
                <FieldPicker
                  label="Row Fields" list={rowFields} setList={setRowFields}
                  max={MAX_ROW_FIELDS} accent="#6366f1"
                  tip={`Up to ${MAX_ROW_FIELDS} fields. Choose low-cardinality columns (e.g. status, category).`}
                />

                {/* Col fields */}
                <FieldPicker
                  label="Column Fields (optional)" list={colFields} setList={setColFields}
                  max={MAX_COL_FIELDS} accent="#10b981"
                  tip={`Up to ${MAX_COL_FIELDS} fields. Max 50 distinct values across col fields.`}
                />

                {/* Tip */}
                <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                  <Info size={12} color="#818cf8" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ color: '#818cf8', fontSize: 11 }}>Use low-cardinality columns (status, region, category) — not IDs, emails or dates.</span>
                </div>

                {/* Build button */}
                <button onClick={compute} disabled={loading || !rowFields.length || !valueField}
                  style={{
                    padding: '10px 0', borderRadius: 8, border: 'none',
                    background: (loading || !rowFields.length || !valueField) ? '#374151' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                    color: 'white', fontWeight: 700, cursor: (loading || !rowFields.length || !valueField) ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13,
                  }}>
                  {loading
                    ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Computing…</>
                    : <><Play size={14} /> Build Pivot</>}
                </button>
              </>}
            </div>
          </div>

          {/* Saved pivots */}
          {saved.length > 0 && (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#f3f4f6', fontWeight: 600, fontSize: 13 }}>Saved Pivots</div>
              {saved.map(p => (
                <div key={p.id} onClick={() => loadPivot(p)} style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', color: '#9ca3af' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ color: '#e2e8f0', fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#4b5563' }}>{p.dataset_name} · {p.aggregator}({p.value_field})</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Pivot result ────────────────────────────────────────────── */}
        <div>
          {result ? (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14 }}>
                    {AGGREGATORS.find(a => a.id === result.aggregator)?.label}({result.valueField})
                  </span>
                  <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 10 }}>
                    {result.nRowKeys} rows × {colFields.length ? result.nColKeys : 0} cols · {(result.rowCount || 0).toLocaleString()} records
                  </span>
                  <span style={{ marginLeft: 10 }}>
                    <span style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                      {result.cells || result.nRowKeys} cells
                    </span>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>
                    Grand Total: <strong style={{ color: '#3b82f6', fontSize: 13 }}>{fmt(result.grandTotal)}</strong>
                  </span>
                  <button onClick={() => setShowSave(true)}
                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Save size={12} /> Save
                  </button>
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto', maxHeight: 560 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: '9px 14px', background: '#0d0d1a', color: '#6b7280', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', minWidth: 140, fontWeight: 700 }}>
                        {rowFields.join(' › ')}
                      </th>
                      {result.colKeys.map(ck => (
                        <th key={ck} style={{ padding: '9px 14px', background: '#0d0d1a', color: '#34d399', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', fontWeight: 700 }}>
                          {ck}
                        </th>
                      ))}
                      <th style={{ padding: '9px 14px', background: '#0d0d1a', color: '#3b82f6', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', fontWeight: 700 }}>
                        Row Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rowKeys.map((rk, ri) => (
                      <tr key={rk} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0', fontWeight: 600, background: '#13131f', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1 }}>
                          {rk}
                        </td>
                        {result.colKeys.map(ck => {
                          const v = result.matrix[rk]?.[ck];
                          return (
                            <td key={ck} style={{ padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: v !== null ? '#e2e8f0' : '#374151', textAlign: 'right', background: heatColor(v, minVal, maxVal), transition: 'background 0.15s' }}>
                              {fmt(v)}
                            </td>
                          );
                        })}
                        <td style={{ padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#60a5fa', textAlign: 'right', fontWeight: 700, background: 'rgba(59,130,246,0.06)' }}>
                          {fmt(result.rowTotals[rk])}
                        </td>
                      </tr>
                    ))}
                    {/* Column totals row */}
                    <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)' }}>
                      <td style={{ padding: '9px 14px', color: '#3b82f6', fontWeight: 700, background: 'rgba(59,130,246,0.06)', position: 'sticky', left: 0 }}>
                        Col Total
                      </td>
                      {result.colKeys.map(ck => (
                        <td key={ck} style={{ padding: '9px 14px', color: '#60a5fa', textAlign: 'right', fontWeight: 700, background: 'rgba(59,130,246,0.06)' }}>
                          {fmt(result.colTotals[ck])}
                        </td>
                      ))}
                      <td style={{ padding: '9px 14px', color: '#f59e0b', textAlign: 'right', fontWeight: 800, background: 'rgba(245,158,11,0.08)' }}>
                        {fmt(result.grandTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#4b5563', fontSize: 11 }}>Heatmap:</span>
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  {[0, 0.15, 0.35, 0.6, 0.85].map(p => (
                    <div key={p} style={{ width: 18, height: 12, borderRadius: 3, background: `rgba(99,102,241,${0.06 + p * 0.44})` }} />
                  ))}
                </div>
                <span style={{ color: '#4b5563', fontSize: 11 }}>low → high</span>
                <span style={{ marginLeft: 'auto', color: '#4b5563', fontSize: 11 }}>
                  min: <strong style={{ color: '#9ca3af' }}>{fmt(minVal)}</strong> · max: <strong style={{ color: '#9ca3af' }}>{fmt(maxVal)}</strong>
                </span>
              </div>
            </div>
          ) : (
            <div style={{ background: '#13131f', border: '2px dashed rgba(255,255,255,0.08)', borderRadius: 12, padding: 60, textAlign: 'center' }}>
              <Table2 size={52} color="#1f2937" style={{ margin: '0 auto 16px', display: 'block' }} />
              <p style={{ color: '#6b7280', fontSize: 15, margin: '0 0 8px' }}>Configure fields and click Build Pivot</p>
              <p style={{ color: '#374151', fontSize: 12, margin: 0 }}>
                Tip: use low-cardinality columns like status, region, or category — not IDs or continuous numbers
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Save modal */}
      {showSave && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowSave(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: 380, padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#f3f4f6', margin: '0 0 16px', fontSize: 16 }}>Save Pivot Configuration</h3>
            <input value={saveName} onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="e.g. Revenue by Region and Channel…"
              style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSave(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#3b82f6', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
