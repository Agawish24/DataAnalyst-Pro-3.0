import { useState } from 'react';
import { useData } from '../context/DataContext';
import axios from 'axios';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine } from 'recharts';
import { Brain, ChevronDown, ChevronRight, Sparkles, AlertCircle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const token = () => localStorage.getItem('token');
const ax = () => ({ headers: { Authorization: `Bearer ${token()}` } });

const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 16 };

export default function ExplainableAI() {
  const { datasets, activeDataset, selectDataset } = useData();
  const [target, setTarget] = useState('');
  const [taskType, setTaskType] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [activePdp, setActivePdp] = useState(null);

  const schema = Array.isArray(activeDataset?.schema) ? activeDataset.schema : [];
  const cols = schema.map(c => c.name);

  const run = async () => {
    if (!activeDataset) return toast.error('Select a dataset first');
    if (!target) return toast.error('Select a target column');
    setLoading(true);
    try {
      const featureCols = cols.filter(c => c !== target);
      const r = await axios.post(`${API}/explainable-ai/${activeDataset.id}/explain`,
        { target_col: target, feature_cols: featureCols, task_type: taskType }, ax());
      setResult(r.data);
      setActivePdp(r.data.partial_dependence ? Object.keys(r.data.partial_dependence)[0] : null);
      toast.success('Explainability analysis complete');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Analysis failed');
    } finally { setLoading(false); }
  };

  const verdictColor = { FAIR: '#10b981', POTENTIAL_BIAS: '#f59e0b', BIASED: '#ef4444' };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Brain size={20} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Explainable AI</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>SHAP-style feature attribution, permutation importance & partial dependence</p>
        </div>
      </div>

      {/* Config */}
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Dataset</label>
            <select value={activeDataset?.id || ''} onChange={e => selectDataset(parseInt(e.target.value))}
              style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }}>
              <option value="">Select dataset…</option>
              {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Target Column</label>
            <select value={target} onChange={e => setTarget(e.target.value)}
              style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }}>
              <option value="">Select target…</option>
              {cols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Task Type</label>
            <select value={taskType} onChange={e => setTaskType(e.target.value)}
              style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }}>
              <option value="auto">Auto-detect</option>
              <option value="classification">Classification</option>
              <option value="regression">Regression</option>
            </select>
          </div>
          <button onClick={run} disabled={loading}
            style={{ padding: '9px 20px', background: loading ? '#374151' : 'linear-gradient(135deg,#8b5cf6,#6366f1)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            {loading ? 'Running…' : 'Explain'}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ ...card, textAlign: 'center', padding: 40 }}>
          <Sparkles size={32} color="#8b5cf6" style={{ marginBottom: 12 }} />
          <p style={{ color: '#9ca3af', margin: 0 }}>Training model and computing feature attribution…</p>
        </div>
      )}

      {result && !loading && (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Task Type', val: result.task_type },
              { label: 'Model', val: result.model },
              { label: 'Features', val: result.n_features },
              { label: 'Rows', val: result.n_rows?.toLocaleString() },
            ].map(({ label, val }) => (
              <div key={label} style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#a78bfa' }}>{val}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Global Importance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={card}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>🌐 Global Feature Importance (MDI)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={result.global_importance?.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `${(v * 100).toFixed(1)}%`} />
                  <YAxis type="category" dataKey="feature" tick={{ fill: '#9ca3af', fontSize: 11 }} width={90} />
                  <Tooltip formatter={v => [`${(v * 100).toFixed(2)}%`, 'Importance']} contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="importance" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={card}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>🔀 Permutation Importance</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={result.permutation_importance?.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <YAxis type="category" dataKey="feature" tick={{ fill: '#9ca3af', fontSize: 11 }} width={90} />
                  <Tooltip formatter={(v, n) => [v.toFixed(4), n]} contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="importance" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="std" fill="rgba(99,102,241,0.3)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Partial Dependence */}
          {result.partial_dependence && Object.keys(result.partial_dependence).length > 0 && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>📉 Partial Dependence Plot</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  {Object.keys(result.partial_dependence).map(f => (
                    <button key={f} onClick={() => setActivePdp(f)}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: activePdp === f ? 'rgba(99,102,241,0.3)' : 'transparent', color: activePdp === f ? '#a5b4fc' : '#6b7280', fontSize: 11, cursor: 'pointer' }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              {activePdp && result.partial_dependence[activePdp] && (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={result.partial_dependence[activePdp]}>
                    <XAxis dataKey="x" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => v.toFixed(1)} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => v.toFixed(2)} />
                    <Tooltip formatter={v => [v.toFixed(4), 'Avg prediction']} contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="y" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Local Explanations */}
          <div style={card}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>🔍 Local Explanations (Row-level)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.local_explanations?.map(le => (
                <div key={le.row} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, overflow: 'hidden' }}>
                  <button onClick={() => setExpandedRow(expandedRow === le.row ? null : le.row)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db' }}>
                    <span style={{ fontSize: 13 }}>Row {le.row + 1} — Prediction: <strong style={{ color: '#a78bfa' }}>{typeof le.prediction === 'number' ? le.prediction.toFixed(4) : le.prediction}</strong> | Actual: <strong style={{ color: '#10b981' }}>{le.actual}</strong></span>
                    {expandedRow === le.row ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
                  </button>
                  {expandedRow === le.row && (
                    <div style={{ padding: '0 14px 14px' }}>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={le.contributions} layout="vertical">
                          <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} />
                          <YAxis type="category" dataKey="feature" tick={{ fill: '#9ca3af', fontSize: 10 }} width={80} />
                          <Tooltip formatter={v => [v.toFixed(4), 'Contribution']} contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                          <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" />
                          <Bar dataKey="contribution" fill="#6366f1" radius={[0, 4, 4, 0]}
                            label={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!result && !loading && (
        <div style={{ ...card, textAlign: 'center', padding: 60 }}>
          <Brain size={40} color="#374151" style={{ marginBottom: 12 }} />
          <p style={{ color: '#6b7280', margin: 0 }}>Select a dataset and target column, then click <strong>Explain</strong> to run SHAP-style feature attribution.</p>
        </div>
      )}
    </div>
  );
}
