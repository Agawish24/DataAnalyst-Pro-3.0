import { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Wand2, Plus, Trash2, Download, Save, RefreshCw } from 'lucide-react';
const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 16 };

const COL_TYPES = ['numeric', 'integer', 'float', 'categorical', 'date', 'boolean', 'id'];
const DISTS = ['uniform', 'normal', 'poisson', 'exponential'];

const DEFAULT_SCHEMA = [
  { name: 'id', type: 'id', params: { prefix: 'ROW', start: 1000 } },
  { name: 'date', type: 'date', params: { start: '2024-01-01', end: '2024-12-31' } },
  { name: 'value', type: 'float', params: { distribution: 'normal', mean: 100, std: 20 } },
  { name: 'category', type: 'categorical', params: { categories: 'A,B,C,D' } },
];

export default function SyntheticData() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [schema, setSchema] = useState(DEFAULT_SCHEMA);
  const [nRows, setNRows] = useState(500);
  const [seed, setSeed] = useState(42);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [saveName, setSaveName] = useState('');
  const [activeTab, setActiveTab] = useState('template');

  useEffect(() => {
    api.get('/synthetic/templates').then(r => {
      if (Array.isArray(r.data)) setTemplates(r.data);
    }).catch(() => {});
  }, []);

  const applyTemplate = async (tpl) => {
    setSelectedTemplate(tpl);
    setResult(null);
  };

  const generate = async () => {
    setLoading(true);
    try {
      const payload = selectedTemplate && activeTab === 'template'
        ? { template: selectedTemplate, n_rows: nRows, seed }
        : { schema: schema.map(c => ({
            ...c,
            params: { ...c.params, categories: typeof c.params?.categories === 'string' ? c.params.categories.split(',').map(s => s.trim()).filter(Boolean) : c.params?.categories }
          })), n_rows: nRows, seed };
      const r = await api.post('/synthetic/generate', payload);
      setResult(r.data);
      if (!saveName) setSaveName(`Synthetic-${selectedTemplate || 'Custom'}-${nRows}`);
      toast.success(`Generated ${r.data.n_rows} rows`);
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Generation failed');
    } finally { setLoading(false); }
  };

  const save = async () => {
    if (!result) return toast.error('Generate data first');
    if (!saveName.trim()) return toast.error('Enter a dataset name');
    setSaving(true);
    try {
      const schemaArr = result.schema?.map(s => ({ name: s.name, type: s.type === 'integer' ? 'integer' : s.type === 'float' ? 'float' : 'text' }))
        || Object.keys(result.rows[0] || {}).map(k => ({ name: k, type: 'text' }));
      const r = await api.post('/synthetic/save', { name: saveName, rows: result.rows, schema: schemaArr, description: `Generated via Synthetic Data Generator (${result.n_rows} rows)` });
      toast.success(r.data.message);
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const downloadCSV = () => {
    if (!result?.rows?.length) return;
    const keys = Object.keys(result.rows[0]);
    const csv = [keys.join(','), ...result.rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${saveName || 'synthetic'}.csv`; a.click();
  };

  const addCol = () => setSchema(s => [...s, { name: `col_${s.length + 1}`, type: 'float', params: { distribution: 'uniform', min: 0, max: 100 } }]);
  const removeCol = (i) => setSchema(s => s.filter((_, j) => j !== i));
  const updateCol = (i, key, val) => setSchema(s => s.map((c, j) => j === i ? { ...c, [key]: val } : c));
  const updateParam = (i, key, val) => setSchema(s => s.map((c, j) => j === i ? { ...c, params: { ...c.params, [key]: val } } : c));

  const previewRows = result?.rows?.slice(0, 8) || [];
  const previewCols = previewRows.length ? Object.keys(previewRows[0]) : [];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#10b981,#06b6d4)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Wand2 size={20} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Synthetic Data Generator</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Generate realistic synthetic datasets from templates or custom schemas</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16 }}>
        {/* Left panel */}
        <div>
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 4 }}>
            {['template', 'custom'].map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: activeTab === t ? 'rgba(255,255,255,0.1)' : 'transparent', color: activeTab === t ? '#f3f4f6' : '#6b7280', fontSize: 12, cursor: 'pointer', fontWeight: activeTab === t ? 600 : 400, textTransform: 'capitalize' }}>
                {t}
              </button>
            ))}
          </div>

          {activeTab === 'template' && (
            <div style={card}>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Choose a pre-built schema template:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {templates.map(t => (
                  <button key={t.id} onClick={() => applyTemplate(t.id)}
                    style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 8, border: `1px solid ${selectedTemplate === t.id ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.08)'}`, background: selectedTemplate === t.id ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', color: '#f3f4f6' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{t.description}</div>
                    <div style={{ fontSize: 10, color: '#10b981', marginTop: 4 }}>{t.columns} columns</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'custom' && (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Define custom columns:</p>
                <button onClick={addCol} style={{ padding: '4px 10px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: '#10b981', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Plus size={12} /> Add
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                {schema.map((col, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <input value={col.name} onChange={e => updateCol(i, 'name', e.target.value)}
                        style={{ flex: 1, background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', color: '#f3f4f6', fontSize: 11 }} placeholder="Name" />
                      <select value={col.type} onChange={e => updateCol(i, 'type', e.target.value)}
                        style={{ flex: 1, background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', color: '#f3f4f6', fontSize: 11 }}>
                        {COL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button onClick={() => removeCol(i)} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 6, color: '#ef4444', cursor: 'pointer', padding: '4px 6px' }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                    {['numeric', 'integer', 'float'].includes(col.type) && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select value={col.params?.distribution || 'uniform'} onChange={e => updateParam(i, 'distribution', e.target.value)}
                          style={{ flex: 1, background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 6px', color: '#9ca3af', fontSize: 10 }}>
                          {DISTS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <input type="number" placeholder="min/mean" value={col.params?.min ?? col.params?.mean ?? ''} onChange={e => updateParam(i, col.params?.distribution === 'normal' ? 'mean' : 'min', parseFloat(e.target.value))}
                          style={{ flex: 1, background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 6px', color: '#9ca3af', fontSize: 10 }} />
                        <input type="number" placeholder="max/std" value={col.params?.max ?? col.params?.std ?? ''} onChange={e => updateParam(i, col.params?.distribution === 'normal' ? 'std' : 'max', parseFloat(e.target.value))}
                          style={{ flex: 1, background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 6px', color: '#9ca3af', fontSize: 10 }} />
                      </div>
                    )}
                    {col.type === 'categorical' && (
                      <input value={typeof col.params?.categories === 'string' ? col.params.categories : (col.params?.categories || []).join(',')} onChange={e => updateParam(i, 'categories', e.target.value)}
                        style={{ width: '100%', background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 6px', color: '#9ca3af', fontSize: 10 }} placeholder="A,B,C (comma-separated)" />
                    )}
                    {col.type === 'date' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input type="date" value={col.params?.start || '2024-01-01'} onChange={e => updateParam(i, 'start', e.target.value)}
                          style={{ flex: 1, background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 6px', color: '#9ca3af', fontSize: 10 }} />
                        <input type="date" value={col.params?.end || '2024-12-31'} onChange={e => updateParam(i, 'end', e.target.value)}
                          style={{ flex: 1, background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 6px', color: '#9ca3af', fontSize: 10 }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row count + seed */}
          <div style={card}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>
                <span>Rows</span><strong style={{ color: '#f3f4f6' }}>{nRows.toLocaleString()}</strong>
              </label>
              <input type="range" min={50} max={10000} step={50} value={nRows} onChange={e => setNRows(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#10b981' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4b5563', marginTop: 2 }}>
                <span>50</span><span>10,000</span>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Random Seed</label>
              <input type="number" value={seed} onChange={e => setSeed(parseInt(e.target.value))}
                style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: '#f3f4f6', fontSize: 13 }} />
            </div>
          </div>

          <button onClick={generate} disabled={loading}
            style={{ width: '100%', padding: '11px 0', background: loading ? '#374151' : 'linear-gradient(135deg,#10b981,#06b6d4)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {loading ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : <><Wand2 size={14} /> Generate Data</>}
          </button>
        </div>

        {/* Right panel - preview */}
        <div>
          {result ? (
            <>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
                {[
                  { label: 'Rows Generated', val: result.n_rows?.toLocaleString(), color: '#10b981' },
                  { label: 'Columns', val: result.schema?.length || previewCols.length, color: '#6366f1' },
                  { label: 'Template', val: result.template || 'Custom', color: '#f59e0b' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ ...card, marginBottom: 0, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Save row */}
              <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }}>
                <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Dataset name to save…"
                  style={{ flex: 1, background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }} />
                <button onClick={save} disabled={saving}
                  style={{ padding: '9px 16px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: '#a5b4fc', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <Save size={14} /> {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={downloadCSV}
                  style={{ padding: '9px 16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: '#10b981', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <Download size={14} /> CSV
                </button>
              </div>

              {/* Preview table */}
              <div style={card}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>Preview (first 8 rows)</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {previewCols.map(c => <th key={c} style={{ padding: '6px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11 }}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {previewCols.map(c => <td key={c} style={{ padding: '6px 10px', color: '#9ca3af', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(row[c] ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Column stats */}
              {result.stats && (
                <div style={card}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>Column Statistics</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
                    {Object.entries(result.stats).map(([col, st]) => (
                      <div key={col} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa', marginBottom: 4 }}>{col}</div>
                        {typeof st === 'object' && 'mean' in st ? (
                          <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.7 }}>
                            <div>min: {st.min}</div><div>max: {st.max}</div><div>mean: {st.mean}</div><div>std: {st.std}</div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.7 }}>
                            {Object.entries(st).slice(0, 4).map(([v, cnt]) => <div key={v}>{v}: {cnt}</div>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ ...card, textAlign: 'center', padding: 80 }}>
              <Wand2 size={48} color="#374151" style={{ marginBottom: 16 }} />
              <p style={{ color: '#6b7280', margin: 0 }}>Choose a template or build a custom schema, then click <strong style={{ color: '#10b981' }}>Generate Data</strong> to create a synthetic dataset.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
