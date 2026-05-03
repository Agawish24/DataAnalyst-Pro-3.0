import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Wand2, CheckCircle2, ChevronRight, BarChart2, Layers, AlertTriangle } from 'lucide-react';

const OPERATIONS = [
  {
    id: 'remove_duplicates', label: 'Remove Duplicates', category: 'Core',
    desc: 'Remove exact duplicate rows from the dataset', params: [],
  },
  {
    id: 'fill_missing', label: 'Fill Missing Values', category: 'Core',
    desc: 'Replace empty cells with a computed or fixed value',
    params: [
      { id: 'strategy', label: 'Strategy', type: 'select', options: ['mean', 'median', 'mode', 'zero', 'drop'] },
    ],
  },
  {
    id: 'drop_missing_rows', label: 'Drop Rows with Missing', category: 'Core',
    desc: 'Remove any row that contains at least one empty cell', params: [],
  },
  {
    id: 'normalize', label: 'Normalize Column', category: 'Core',
    desc: 'Scale a numeric column to a standard range',
    params: [
      { id: 'column', label: 'Column', type: 'numeric_col' },
      { id: 'method', label: 'Method', type: 'select', options: ['minmax', 'zscore'] },
    ],
  },
  {
    id: 'trim_strings', label: 'Trim Whitespace', category: 'Core',
    desc: 'Remove leading and trailing spaces from all text columns', params: [],
  },
  {
    id: 'remove_outliers', label: 'Remove Outliers', category: 'Essential',
    desc: 'Drop rows where a numeric value is beyond N standard deviations',
    params: [
      { id: 'column', label: 'Column', type: 'numeric_col' },
      { id: 'threshold', label: 'Std-Dev Threshold', type: 'number', default: '3' },
    ],
  },
  {
    id: 'convert_type', label: 'Type Conversion', category: 'Essential',
    desc: 'Cast a column to numeric, integer, text, date, or boolean',
    params: [
      { id: 'column', label: 'Column', type: 'any_col' },
      { id: 'targetType', label: 'Target Type', type: 'select', options: ['numeric', 'integer', 'text', 'date', 'boolean'] },
    ],
  },
  {
    id: 'standardize_categories', label: 'Standardize Categories', category: 'Essential',
    desc: 'Unify casing and optionally remap values (e.g. "NY" → "New York")',
    params: [
      { id: 'column', label: 'Column', type: 'any_col' },
      { id: 'caseMode', label: 'Case', type: 'select', options: ['title', 'lower', 'upper'] },
    ],
  },
  {
    id: 'label_encode', label: 'Label Encoding', category: 'Essential',
    desc: 'Replace categorical values with integer codes (0, 1, 2, …)',
    params: [
      { id: 'column', label: 'Column', type: 'any_col' },
    ],
  },
  {
    id: 'clean_text', label: 'Text Cleaning', category: 'Essential',
    desc: 'Lowercase, remove punctuation, collapse extra whitespace',
    params: [
      { id: 'column', label: 'Column', type: 'any_col' },
      { id: 'lowercase', label: 'Lowercase', type: 'select', options: ['true', 'false'] },
      { id: 'removePunctuation', label: 'Remove Punctuation', type: 'select', options: ['true', 'false'] },
    ],
  },
  {
    id: 'validate_constraint', label: 'Validate Constraint', category: 'Essential',
    desc: 'Remove rows that violate a rule (e.g. age ≥ 0, status != empty)',
    params: [
      { id: 'column', label: 'Column', type: 'any_col' },
      { id: 'operator', label: 'Operator', type: 'select', options: ['>=', '<=', '>', '<', '==', '!=', 'not_empty'] },
      { id: 'value', label: 'Value', type: 'text', placeholder: 'e.g. 0' },
      { id: 'action', label: 'Action', type: 'select', options: ['remove', 'flag'] },
    ],
  },
];

const CATEGORY_COLORS = { Core: '#3b82f6', Essential: '#10b981', Enterprise: '#8b5cf6' };

export default function DataCleaning() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [quality, setQuality] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedOp, setSelectedOp] = useState(null);
  const [params, setParams] = useState({});
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => { fetchDatasets(); }, []);

  useEffect(() => {
    if (activeDataset) { loadQuality(); loadHistory(); }
  }, [activeDataset]);

  const loadQuality = async () => {
    try { const res = await api.get(`/cleaning/${activeDataset.id}/quality`); setQuality(res.data); } catch {}
  };

  const loadHistory = async () => {
    try { const res = await api.get(`/cleaning/${activeDataset.id}/history`); setHistory(res.data); } catch {}
  };

  const handlePreview = async () => {
    if (!selectedOp || !activeDataset) return;
    setLoading(true);
    try {
      const res = await api.post(`/cleaning/${activeDataset.id}/preview`, { operation: selectedOp, parameters: coerceParams() });
      setPreview(res.data);
    } catch (err) { toast.error(err.response?.data?.error || 'Preview failed'); }
    finally { setLoading(false); }
  };

  const handleApply = async () => {
    if (!selectedOp || !activeDataset) return;
    setApplying(true);
    try {
      const res = await api.post(`/cleaning/${activeDataset.id}/apply`, { operation: selectedOp, parameters: coerceParams() });
      toast.success(`Applied — ${res.data.before} → ${res.data.after} rows (${res.data.removed} affected)`);
      setPreview(null); loadQuality(); loadHistory();
    } catch (err) { toast.error(err.response?.data?.error || 'Apply failed'); }
    finally { setApplying(false); }
  };

  const coerceParams = () => {
    const p = { ...params };
    if (p.threshold) p.threshold = parseFloat(p.threshold);
    if (p.lowercase !== undefined) p.lowercase = p.lowercase === 'true';
    if (p.removePunctuation !== undefined) p.removePunctuation = p.removePunctuation === 'true';
    return p;
  };

  const schemaArr = activeDataset?.schema
    ? (Array.isArray(activeDataset.schema) ? activeDataset.schema : Object.entries(activeDataset.schema).map(([name, type]) => ({ name, type })))
    : [];
  const numericCols = schemaArr.filter(c => ['numeric', 'integer', 'float', 'double', 'number', 'int', 'bigint'].includes(c.type?.toLowerCase())).map(c => c.name);
  const allCols = schemaArr.map(c => c.name);
  const selectedOpDef = OPERATIONS.find(o => o.id === selectedOp);

  const categories = ['All', ...new Set(OPERATIONS.map(o => o.category))];
  const visibleOps = activeCategory === 'All' ? OPERATIONS : OPERATIONS.filter(o => o.category === activeCategory);

  const qualityScore = quality
    ? Math.round(100 - (Object.values(quality.columns || {}).reduce((s, c) => s + c.missingPct, 0) / Math.max(1, Object.keys(quality.columns || {}).length)))
    : null;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Wand2 size={24} color="#10b981" /> Data Cleaning
        </h1>
        <p style={{ color: '#6b7280', margin: 0 }}>Fix quality issues, transform types, and prepare data for analysis</p>
      </div>

      {/* Dataset Selector */}
      <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>SELECT DATASET</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {datasets.map(ds => (
            <button key={ds.id} onClick={() => selectDataset(ds)}
              style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${activeDataset?.id === ds.id ? '#10b981' : 'rgba(255,255,255,0.1)'}`, background: activeDataset?.id === ds.id ? 'rgba(16,185,129,0.15)' : 'transparent', color: activeDataset?.id === ds.id ? '#10b981' : '#9ca3af', fontSize: 13, cursor: 'pointer', fontWeight: activeDataset?.id === ds.id ? 600 : 400 }}>
              {ds.name} <span style={{ opacity: 0.6 }}>{ds.row_count?.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      {activeDataset ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>

          {/* Left: Operations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Category filter */}
            <div style={{ display: 'flex', gap: 6 }}>
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${activeCategory === cat ? (CATEGORY_COLORS[cat] || '#6366f1') : 'rgba(255,255,255,0.08)'}`, background: activeCategory === cat ? `${(CATEGORY_COLORS[cat] || '#6366f1')}20` : 'transparent', color: activeCategory === cat ? (CATEGORY_COLORS[cat] || '#6366f1') : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Operations grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {visibleOps.map(op => (
                <div key={op.id} onClick={() => { setSelectedOp(op.id); setParams({}); setPreview(null); }}
                  style={{ background: selectedOp === op.id ? 'rgba(16,185,129,0.1)' : '#13131f', border: `1px solid ${selectedOp === op.id ? '#10b981' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: 14, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <span style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 13 }}>{op.label}</span>
                    <span style={{ background: `${CATEGORY_COLORS[op.category] || '#6366f1'}20`, color: CATEGORY_COLORS[op.category] || '#6366f1', fontSize: 10, padding: '2px 6px', borderRadius: 8, fontWeight: 600, whiteSpace: 'nowrap' }}>{op.category}</span>
                  </div>
                  <p style={{ color: '#6b7280', fontSize: 11, margin: 0, lineHeight: 1.4 }}>{op.desc}</p>
                </div>
              ))}
            </div>

            {/* Config panel for selected op */}
            {selectedOpDef && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 20 }}>
                <h3 style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Layers size={16} color="#10b981" /> Configure: {selectedOpDef.label}
                </h3>
                {selectedOpDef.params.length === 0 && (
                  <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 16px' }}>No configuration needed — this operation applies to all columns automatically.</p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {selectedOpDef.params.map(p => (
                    <div key={p.id}>
                      <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>{p.label}</label>
                      {p.type === 'select' && (
                        <select value={params[p.id] !== undefined ? params[p.id] : (p.options?.[0] || '')}
                          onChange={e => setParams({ ...params, [p.id]: e.target.value })}
                          style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 13 }}>
                          {p.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                      {(p.type === 'numeric_col' || p.type === 'any_col') && (
                        <select value={params[p.id] || ''}
                          onChange={e => setParams({ ...params, [p.id]: e.target.value })}
                          style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 13 }}>
                          <option value="">Select column…</option>
                          {(p.type === 'numeric_col' ? numericCols : allCols).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                      {p.type === 'number' && (
                        <input type="number" value={params[p.id] !== undefined ? params[p.id] : (p.default || '')}
                          onChange={e => setParams({ ...params, [p.id]: e.target.value })}
                          style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                      )}
                      {p.type === 'text' && (
                        <input type="text" placeholder={p.placeholder || ''} value={params[p.id] || ''}
                          onChange={e => setParams({ ...params, [p.id]: e.target.value })}
                          style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                      )}
                    </div>
                  ))}
                </div>

                {preview && (
                  <div style={{ background: preview.removed > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${preview.removed > 0 ? '#f59e0b' : '#10b981'}`, borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle size={16} color={preview.removed > 0 ? '#f59e0b' : '#10b981'} />
                    <span style={{ color: '#e2e8f0', fontSize: 13 }}>
                      <strong>{preview.before}</strong> → <strong>{preview.after}</strong> rows &nbsp;·&nbsp; <strong>{preview.removed}</strong> rows affected
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handlePreview} disabled={loading}
                    style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {loading ? 'Loading…' : 'Preview Changes'}
                  </button>
                  <button onClick={handleApply} disabled={applying}
                    style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {applying ? 'Applying…' : 'Apply Operation'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Quality + History */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Quality score card */}
            {quality && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 }}>
                <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Data Quality Report</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <div style={{ position: 'relative', width: 60, height: 60 }}>
                    <svg width="60" height="60" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                      <circle cx="30" cy="30" r="24" fill="none"
                        stroke={qualityScore >= 80 ? '#10b981' : qualityScore >= 60 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="6" strokeDasharray={`${qualityScore * 1.508} 150.8`} strokeLinecap="round" />
                    </svg>
                    <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#f3f4f6', fontSize: 13, fontWeight: 700 }}>{qualityScore}%</span>
                  </div>
                  <div>
                    <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15 }}>Quality Score</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{quality.totalRows?.toLocaleString()} rows · {Object.keys(quality.columns || {}).length} columns</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>
                      {Object.values(quality.columns || {}).filter(c => c.missing > 0).length} cols with missing values
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(quality.columns || {}).map(([col, info]) => (
                    <div key={col}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 500 }}>{col}</span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {info.isNumeric && <span style={{ color: '#6b7280', fontSize: 10 }}>min {info.min} · max {info.max}</span>}
                          <span style={{ color: info.missingPct > 0 ? '#f59e0b' : '#6b7280', fontSize: 11, fontWeight: 600 }}>{info.missingPct}% missing</span>
                        </div>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${100 - info.missingPct}%`, background: info.missingPct > 20 ? '#ef4444' : info.missingPct > 5 ? '#f59e0b' : '#10b981', borderRadius: 4, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cleaning history */}
            {history.length > 0 && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 }}>
                <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Cleaning History</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {history.slice(0, 10).map(h => {
                    const summary = typeof h.result_summary === 'string' ? JSON.parse(h.result_summary) : h.result_summary;
                    return (
                      <div key={h.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <CheckCircle2 size={14} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                        <div>
                          <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{h.operation.replace(/_/g, ' ')}</div>
                          <div style={{ color: '#6b7280', fontSize: 11 }}>
                            {summary?.before} → {summary?.after} rows · {new Date(h.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 60, textAlign: 'center' }}>
          <BarChart2 size={48} color="#374151" style={{ margin: '0 auto 12px', display: 'block' }} />
          <p style={{ color: '#6b7280', fontSize: 15, margin: 0 }}>Select a dataset above to start cleaning</p>
        </div>
      )}
    </div>
  );
}
