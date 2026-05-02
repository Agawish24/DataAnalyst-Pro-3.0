import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Wand2, CheckCircle2, AlertCircle, RefreshCw, ChevronRight } from 'lucide-react';

const OPERATIONS = [
  { id: 'remove_duplicates', label: 'Remove Duplicates', desc: 'Remove exact duplicate rows', params: [] },
  { id: 'fill_missing', label: 'Fill Missing Values', desc: 'Replace empty cells with a computed value', params: [
    { id: 'strategy', label: 'Strategy', type: 'select', options: ['mean', 'median', 'mode', 'zero', 'drop'] }
  ]},
  { id: 'drop_missing_rows', label: 'Drop Rows with Missing', desc: 'Remove rows that have any empty cells', params: [] },
  { id: 'normalize', label: 'Normalize Column', desc: 'Scale numeric values to a range', params: [
    { id: 'column', label: 'Column', type: 'column_select' },
    { id: 'method', label: 'Method', type: 'select', options: ['minmax', 'zscore'] }
  ]},
  { id: 'trim_strings', label: 'Trim Whitespace', desc: 'Remove leading/trailing spaces from text', params: [] },
];

export default function DataCleaning() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [quality, setQuality] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedOp, setSelectedOp] = useState(null);
  const [params, setParams] = useState({});
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => { fetchDatasets(); }, []);

  useEffect(() => {
    if (activeDataset) {
      loadQuality();
      loadHistory();
    }
  }, [activeDataset]);

  const loadQuality = async () => {
    try {
      const res = await api.get(`/cleaning/${activeDataset.id}/quality`);
      setQuality(res.data);
    } catch {}
  };

  const loadHistory = async () => {
    try {
      const res = await api.get(`/cleaning/${activeDataset.id}/history`);
      setHistory(res.data);
    } catch {}
  };

  const handlePreview = async () => {
    if (!selectedOp || !activeDataset) return;
    setLoading(true);
    try {
      const res = await api.post(`/cleaning/${activeDataset.id}/preview`, { operation: selectedOp, parameters: params });
      setPreview(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Preview failed');
    } finally { setLoading(false); }
  };

  const handleApply = async () => {
    if (!selectedOp || !activeDataset) return;
    setApplying(true);
    try {
      const res = await api.post(`/cleaning/${activeDataset.id}/apply`, { operation: selectedOp, parameters: params });
      toast.success(`Applied: ${res.data.removed} rows affected (${res.data.before} → ${res.data.after})`);
      setPreview(null);
      loadQuality();
      loadHistory();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Apply failed');
    } finally { setApplying(false); }
  };

  const numericCols = activeDataset?.schema?.filter(c => c.type === 'numeric').map(c => c.name) || [];
  const allCols = activeDataset?.schema?.map(c => c.name) || [];
  const selectedOpDef = OPERATIONS.find(o => o.id === selectedOp);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Data Cleaning</h2>
        <p className="text-muted">Fix missing values, duplicates, and normalize your data</p>
      </div>

      {/* Dataset Selector */}
      <div className="card mb-4">
        <label className="form-label">Select Dataset</label>
        <div className="dataset-selector">
          {datasets.map(ds => (
            <button key={ds.id} className={`dataset-chip ${activeDataset?.id === ds.id ? 'active' : ''}`} onClick={() => selectDataset(ds)}>
              {ds.name} <span className="chip-meta">{ds.row_count?.toLocaleString()} rows</span>
            </button>
          ))}
        </div>
      </div>

      {activeDataset ? (
        <div className="cleaning-layout">
          {/* Quality Report */}
          {quality && (
            <div className="card">
              <h3 className="card-title">Data Quality Report</h3>
              <div className="quality-summary">
                <div className="quality-stat">
                  <span className="qs-value">{quality.totalRows?.toLocaleString()}</span>
                  <span className="qs-label">Total Rows</span>
                </div>
                <div className="quality-stat">
                  <span className="qs-value text-warning">{Object.values(quality.columns || {}).filter(c => c.missing > 0).length}</span>
                  <span className="qs-label">Cols with Missing</span>
                </div>
                <div className="quality-stat">
                  <span className="qs-value text-danger">{Object.values(quality.columns || {}).reduce((s, c) => s + c.duplicates, 0)}</span>
                  <span className="qs-label">Duplicates</span>
                </div>
              </div>
              <div className="quality-columns">
                {Object.entries(quality.columns || {}).map(([col, info]) => (
                  <div key={col} className="quality-col-row">
                    <div className="qcr-name">{col}</div>
                    <div className="qcr-bar-wrap">
                      <div className="qcr-bar" style={{ width: `${100 - info.missingPct}%` }}></div>
                    </div>
                    <div className="qcr-pct">{info.missingPct}% missing</div>
                    {info.isNumeric && <div className="qcr-range">min: {info.min} · max: {info.max}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Operations */}
          <div className="card">
            <h3 className="card-title">Cleaning Operations</h3>
            <div className="operations-list">
              {OPERATIONS.map(op => (
                <div key={op.id} className={`operation-item ${selectedOp === op.id ? 'selected' : ''}`} onClick={() => { setSelectedOp(op.id); setParams({}); setPreview(null); }}>
                  <div>
                    <div className="op-label">{op.label}</div>
                    <div className="op-desc">{op.desc}</div>
                  </div>
                  <ChevronRight size={16} />
                </div>
              ))}
            </div>

            {selectedOpDef && (
              <div className="operation-config">
                <h4>{selectedOpDef.label}</h4>
                {selectedOpDef.params.map(p => (
                  <div key={p.id} className="form-group">
                    <label>{p.label}</label>
                    {p.type === 'select' && (
                      <select value={params[p.id] || p.options[0]} onChange={e => setParams({...params, [p.id]: e.target.value})}>
                        {p.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                    {p.type === 'column_select' && (
                      <select value={params[p.id] || ''} onChange={e => setParams({...params, [p.id]: e.target.value})}>
                        <option value="">Select column...</option>
                        {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                <div className="op-actions">
                  <button className="btn btn-secondary" onClick={handlePreview} disabled={loading}>
                    {loading ? 'Loading...' : 'Preview Changes'}
                  </button>
                  <button className="btn btn-primary" onClick={handleApply} disabled={applying}>
                    {applying ? 'Applying...' : 'Apply Operation'}
                  </button>
                </div>
                {preview && (
                  <div className={`preview-result ${preview.removed > 0 ? 'warning' : 'success'}`}>
                    <strong>Preview:</strong> {preview.before} rows → {preview.after} rows ({preview.removed} affected)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="card">
              <h3 className="card-title">Cleaning History</h3>
              <div className="history-list">
                {history.map(h => (
                  <div key={h.id} className="history-item">
                    <CheckCircle2 size={16} className="text-success" />
                    <div>
                      <div className="hi-op">{h.operation.replace(/_/g, ' ')}</div>
                      <div className="hi-meta">{h.result_summary?.before} → {h.result_summary?.after} rows · {new Date(h.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state card">
          <Wand2 size={48} />
          <p>Select a dataset to start cleaning</p>
        </div>
      )}
    </div>
  );
}
