import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Table2, Play, Save, ChevronDown, RefreshCw } from 'lucide-react';

const AGGREGATORS = [
  { id: 'sum', label: 'Sum' }, { id: 'avg', label: 'Average' }, { id: 'count', label: 'Count' },
  { id: 'count_distinct', label: 'Count Distinct' }, { id: 'min', label: 'Min' },
  { id: 'max', label: 'Max' }, { id: 'median', label: 'Median' }, { id: 'stddev', label: 'Std Dev' },
];

const fmt = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v % 1 === 0 ? v.toLocaleString() : v.toFixed(2);
  return String(v);
};

const heatColor = (val, min, max) => {
  if (val === null || max === min) return 'transparent';
  const pct = (val - min) / (max - min);
  return `rgba(99,102,241,${0.05 + pct * 0.45})`;
};

export default function PivotTable() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [columns, setColumns] = useState([]);
  const [numCols, setNumCols] = useState([]);
  const [rowFields, setRowFields] = useState([]);
  const [colFields, setColFields] = useState([]);
  const [valueField, setValueField] = useState('');
  const [aggregator, setAggregator] = useState('sum');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState([]);
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);

  useEffect(() => { fetchDatasets(); loadSaved(); }, []);
  useEffect(() => { if (activeDataset) loadColumns(); }, [activeDataset]);

  const loadColumns = async () => {
    try {
      const r = await api.get(`/datasets/${activeDataset.id}`);
      const schema = r.data.schema || {};
      setColumns(Object.keys(schema));
      setNumCols(Object.keys(schema).filter(k => ['integer','numeric','float','double','decimal','number'].some(t => String(schema[k]).toLowerCase().includes(t))));
    } catch {}
  };

  const loadSaved = async () => { try { const r = await api.get('/pivot/saved'); setSaved(r.data); } catch {} };

  const compute = async () => {
    if (!activeDataset) return toast.error('Select a dataset');
    if (!valueField) return toast.error('Select a value field');
    if (!rowFields.length && !colFields.length) return toast.error('Select at least one row or column field');
    setLoading(true);
    try {
      const r = await api.post(`/pivot/${activeDataset.id}/compute`, { row_fields: rowFields, col_fields: colFields, value_field: valueField, aggregator });
      setResult(r.data);
      toast.success(`Pivot built — ${r.data.rowCount?.toLocaleString()} rows processed`);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  const save = async () => {
    if (!saveName) return;
    try {
      await api.post('/pivot/save', { name: saveName, dataset_id: activeDataset.id, rows_fields: rowFields, cols_fields: colFields, value_field: valueField, aggregator });
      toast.success('Pivot saved'); setShowSave(false); setSaveName(''); loadSaved();
    } catch (e) { toast.error('Save failed'); }
  };

  const loadPivot = (p) => {
    setRowFields(p.rows_fields || []); setColFields(p.cols_fields || []);
    setValueField(p.value_field); setAggregator(p.aggregator || 'sum');
    selectDataset(datasets.find(d => d.id === p.dataset_id));
  };

  const toggleField = (col, list, setList) => {
    setList(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  const allValues = result ? Object.values(result.matrix).flatMap(row => Object.values(row)).filter(v => v !== null) : [];
  const minVal = allValues.length ? Math.min(...allValues) : 0;
  const maxVal = allValues.length ? Math.max(...allValues) : 1;

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}><Table2 size={26} color="#3b82f6" /> Pivot Table</h1>
        <p style={{ color: '#9ca3af', margin: 0 }}>Aggregate and cross-tabulate data across any dimensions with heatmap visualization</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
        {/* Config panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
            <div style={{ color: '#f3f4f6', fontWeight: 700, marginBottom: 14 }}>Configuration</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>DATASET</label>
                <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))}
                  style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 12px', fontSize: 13 }}>
                  <option value="">Select...</option>{datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select></div>

              {columns.length > 0 && <>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>VALUE FIELD (aggregate)</label>
                  <select value={valueField} onChange={e => setValueField(e.target.value)}
                    style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 12px', fontSize: 13 }}>
                    <option value="">Select...</option>{[...columns].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>AGGREGATOR</label>
                  <select value={aggregator} onChange={e => setAggregator(e.target.value)}
                    style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 12px', fontSize: 13 }}>
                    {AGGREGATORS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>

                {[['ROW FIELDS', rowFields, setRowFields], ['COLUMN FIELDS (optional)', colFields, setColFields]].map(([label, list, setList]) => (
                  <div key={label}>
                    <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>{label}</label>
                    <div style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, maxHeight: 140, overflowY: 'auto' }}>
                      {columns.map(c => (
                        <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 4px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={list.includes(c)} onChange={() => toggleField(c, list, setList)} />
                          <span style={{ color: '#e2e8f0', fontSize: 12 }}>{c}</span>
                          {list.includes(c) && <span style={{ color: '#3b82f6', fontSize: 10, fontWeight: 700 }}>✓</span>}
                        </label>
                      ))}
                    </div>
                    {list.length > 0 && <div style={{ color: '#3b82f6', fontSize: 11, marginTop: 3 }}>Selected: {list.join(', ')}</div>}
                  </div>
                ))}

                <button onClick={compute} disabled={loading}
                  style={{ padding: '10px 0', borderRadius: 8, border: 'none', background: loading ? '#374151' : 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {loading ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Computing...</> : <><Play size={14} /> Build Pivot</>}
                </button>
              </>}
            </div>
          </div>

          {/* Saved pivots */}
          {saved.length > 0 && (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>Saved Pivots</div>
              {saved.map(p => (
                <div key={p.id} onClick={() => loadPivot(p)} style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', color: '#9ca3af', fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ color: '#e2e8f0', fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#4b5563' }}>{p.dataset_name} · {p.aggregator}({p.value_field})</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pivot result */}
        <div>
          {result ? (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#f3f4f6', fontWeight: 600 }}>Pivot: {AGGREGATORS.find(a => a.id === result.aggregator)?.label}({result.valueField})</span>
                  <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 10 }}>{result.rowKeys.length} rows × {result.colKeys.length} cols · {result.rowCount?.toLocaleString()} records</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>Grand Total: <strong style={{ color: '#3b82f6' }}>{fmt(result.grandTotal)}</strong></span>
                  {activeDataset && <button onClick={() => setShowSave(true)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Save size={12} /> Save</button>}
                </div>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 550 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: '8px 12px', background: '#0d0d1a', color: '#6b7280', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', minWidth: 120 }}>Row</th>
                      {result.colKeys.map(ck => <th key={ck} style={{ padding: '8px 12px', background: '#0d0d1a', color: '#9ca3af', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', fontWeight: 600 }}>{ck}</th>)}
                      <th style={{ padding: '8px 12px', background: '#0d0d1a', color: '#3b82f6', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>Row Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rowKeys.map(rk => (
                      <tr key={rk}>
                        <td style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0', fontWeight: 500, background: '#13131f', whiteSpace: 'nowrap' }}>{rk}</td>
                        {result.colKeys.map(ck => {
                          const v = result.matrix[rk]?.[ck];
                          return <td key={ck} style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: v !== null ? '#e2e8f0' : '#374151', textAlign: 'right', background: heatColor(v, minVal, maxVal) }}>{fmt(v)}</td>;
                        })}
                        <td style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#3b82f6', textAlign: 'right', fontWeight: 600, background: 'rgba(59,130,246,0.05)' }}>{fmt(result.rowTotals[rk])}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)' }}>
                      <td style={{ padding: '8px 12px', color: '#3b82f6', fontWeight: 700, background: 'rgba(59,130,246,0.05)' }}>Column Total</td>
                      {result.colKeys.map(ck => <td key={ck} style={{ padding: '8px 12px', color: '#3b82f6', textAlign: 'right', fontWeight: 700, background: 'rgba(59,130,246,0.05)' }}>{fmt(result.colTotals[ck])}</td>)}
                      <td style={{ padding: '8px 12px', color: '#f59e0b', textAlign: 'right', fontWeight: 800, background: 'rgba(245,158,11,0.08)' }}>{fmt(result.grandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ background: '#13131f', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 12, padding: 80, textAlign: 'center' }}>
              <Table2 size={60} color="#374151" style={{ margin: '0 auto 16px', display: 'block' }} />
              <p style={{ color: '#6b7280', fontSize: 15 }}>Configure the pivot fields on the left and click Build Pivot</p>
            </div>
          )}
        </div>
      </div>

      {showSave && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSave(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: 380, padding: 24 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#f3f4f6', margin: '0 0 16px' }}>Save Pivot Configuration</h3>
            <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Pivot name..."
              style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSave(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#3b82f6', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
