import { useState } from 'react';
import { useData } from '../context/DataContext';
import axios from 'axios';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, Legend } from 'recharts';
import { Scale, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const token = () => localStorage.getItem('token');
const ax = () => ({ headers: { Authorization: `Bearer ${token()}` } });
const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 16 };

const VERDICT_STYLES = {
  FAIR: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', icon: CheckCircle },
  POTENTIAL_BIAS: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: AlertTriangle },
  BIASED: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', icon: XCircle },
};

export default function BiasFairness() {
  const { datasets, activeDataset, selectDataset } = useData();
  const [target, setTarget] = useState('');
  const [protectedCol, setProtectedCol] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const schema = Array.isArray(activeDataset?.schema) ? activeDataset.schema : [];
  const cols = schema.map(c => c.name);

  const run = async () => {
    if (!activeDataset) return toast.error('Select a dataset first');
    if (!target) return toast.error('Select a target column');
    if (!protectedCol) return toast.error('Select a protected attribute column');
    if (target === protectedCol) return toast.error('Target and protected column must differ');
    setLoading(true);
    try {
      const featureCols = cols.filter(c => c !== target && c !== protectedCol);
      const r = await axios.post(`${API}/bias-check/${activeDataset.id}/run`,
        { target_col: target, protected_col: protectedCol, feature_cols: featureCols }, ax());
      setResult(r.data);
      toast.success('Fairness analysis complete');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Analysis failed');
    } finally { setLoading(false); }
  };

  const fs = result?.fairness_summary;
  const verdict = fs?.verdict || 'FAIR';
  const vstyle = VERDICT_STYLES[verdict] || VERDICT_STYLES.FAIR;
  const VIcon = vstyle.icon;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#ec4899,#8b5cf6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Scale size={20} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Bias & Fairness</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Demographic parity, disparate impact, and equalized odds analysis</p>
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
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Target / Label Column</label>
            <select value={target} onChange={e => setTarget(e.target.value)}
              style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }}>
              <option value="">Select target…</option>
              {cols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Protected Attribute</label>
            <select value={protectedCol} onChange={e => setProtectedCol(e.target.value)}
              style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }}>
              <option value="">e.g. gender, region…</option>
              {cols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={run} disabled={loading}
            style={{ padding: '9px 20px', background: loading ? '#374151' : 'linear-gradient(135deg,#ec4899,#8b5cf6)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            {loading ? 'Checking…' : 'Run Check'}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ ...card, textAlign: 'center', padding: 40 }}>
          <Scale size={32} color="#ec4899" style={{ marginBottom: 12 }} />
          <p style={{ color: '#9ca3af', margin: 0 }}>Training model and computing fairness metrics across groups…</p>
        </div>
      )}

      {result && !loading && (
        <>
          {/* Verdict + score */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ gridColumn: '1', background: vstyle.bg, border: `1px solid ${vstyle.border}`, borderRadius: 12, padding: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <VIcon size={28} color={vstyle.color} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: vstyle.color }}>{verdict.replace('_', ' ')}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Fairness verdict</div>
              </div>
            </div>
            {[
              { label: 'Fairness Score', val: `${fs?.fairness_score ?? '--'}/100`, color: '#a78bfa' },
              { label: 'Disparate Impact', val: fs?.disparate_impact?.toFixed(3) ?? '--', color: fs?.disparate_impact >= 0.8 ? '#10b981' : '#ef4444' },
              { label: 'DP Difference', val: fs?.demographic_parity_diff?.toFixed(3) ?? '--', color: fs?.demographic_parity_diff < 0.1 ? '#10b981' : '#f59e0b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Positive rate by group */}
            <div style={card}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>📊 Positive Rate by Group ({result.protected_col})</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={result.group_metrics}>
                  <XAxis dataKey="group" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip formatter={v => [`${(v * 100).toFixed(2)}%`]} contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="positive_rate" name="Positive Rate" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="true_positive_rate" name="True Positive Rate" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Accuracy by group */}
            <div style={card}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>🎯 Accuracy & Group Size</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 240, overflowY: 'auto' }}>
                {result.group_metrics?.map(g => (
                  <div key={g.group} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 80, fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{g.group}</div>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                      <div style={{ width: `${g.accuracy * 100}%`, height: '100%', background: 'linear-gradient(90deg,#10b981,#6366f1)', borderRadius: 4 }} />
                    </div>
                    <div style={{ minWidth: 50, fontSize: 12, color: '#d1d5db', textAlign: 'right' }}>{(g.accuracy * 100).toFixed(1)}%</div>
                    <div style={{ minWidth: 55, fontSize: 11, color: '#6b7280' }}>n={g.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>💡 Recommendations</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.recommendations?.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6 }}>{r}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Group metrics table */}
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>📋 Detailed Group Metrics</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Group', 'Count', 'Positive Rate', 'True Positive Rate', 'Accuracy'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.group_metrics?.map(g => (
                  <tr key={g.group} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px 12px', color: '#d1d5db', fontWeight: 600 }}>{g.group}</td>
                    <td style={{ padding: '8px 12px', color: '#9ca3af' }}>{g.count}</td>
                    <td style={{ padding: '8px 12px', color: '#a78bfa' }}>{(g.positive_rate * 100).toFixed(2)}%</td>
                    <td style={{ padding: '8px 12px', color: '#6366f1' }}>{(g.true_positive_rate * 100).toFixed(2)}%</td>
                    <td style={{ padding: '8px 12px', color: '#10b981' }}>{(g.accuracy * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!result && !loading && (
        <div style={{ ...card, textAlign: 'center', padding: 60 }}>
          <Scale size={40} color="#374151" style={{ marginBottom: 12 }} />
          <p style={{ color: '#6b7280', margin: 0 }}>Select a dataset, target column, and a protected attribute (e.g. gender, region) to detect bias in model predictions.</p>
        </div>
      )}
    </div>
  );
}
