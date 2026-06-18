import { useState } from 'react';
import { useData } from '../context/DataContext';
import axios from 'axios';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { GitMerge, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const token = () => localStorage.getItem('token');
const ax = () => ({ headers: { Authorization: `Bearer ${token()}` } });
const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 16 };

export default function CausalInference() {
  const { datasets, activeDataset, selectDataset } = useData();
  const [treatment, setTreatment] = useState('');
  const [outcome, setOutcome] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const schema = Array.isArray(activeDataset?.schema) ? activeDataset.schema : [];
  const cols = schema.map(c => c.name);

  const run = async () => {
    if (!activeDataset) return toast.error('Select a dataset first');
    if (!treatment) return toast.error('Select a treatment column');
    if (!outcome) return toast.error('Select an outcome column');
    if (treatment === outcome) return toast.error('Treatment and outcome must differ');
    setLoading(true);
    try {
      const controlCols = cols.filter(c => c !== treatment && c !== outcome);
      const r = await axios.post(`${API}/causal/${activeDataset.id}/run`,
        { treatment_col: treatment, outcome_col: outcome, control_cols: controlCols }, ax());
      setResult(r.data);
      toast.success('Causal inference complete');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Analysis failed');
    } finally { setLoading(false); }
  };

  const dirColor = result?.effect_direction === 'positive' ? '#10b981' : result?.effect_direction === 'negative' ? '#ef4444' : '#6b7280';
  const DirIcon = result?.effect_direction === 'positive' ? TrendingUp : result?.effect_direction === 'negative' ? TrendingDown : Minus;

  const ateData = result ? [
    { name: 'Naive ATE', value: result.ate_estimates?.naive_ate, color: '#6366f1' },
    { name: 'IPW ATE', value: result.ate_estimates?.ipw_ate, color: '#8b5cf6' },
    { name: 'Regression ATE', value: result.ate_estimates?.regression_ate, color: '#a78bfa' },
  ] : [];

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', color: '#f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#f59e0b,#8b5cf6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GitMerge size={20} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Causal Inference</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Average treatment effect (ATE) via IPW, regression adjustment & bootstrap CI</p>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Dataset</label>
            <select value={activeDataset?.id || ''} onChange={e => selectDataset(parseInt(e.target.value))}
              style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }}>
              <option value="">Select…</option>
              {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Treatment Column</label>
            <select value={treatment} onChange={e => setTreatment(e.target.value)}
              style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }}>
              <option value="">Select…</option>
              {cols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Outcome Column</label>
            <select value={outcome} onChange={e => setOutcome(e.target.value)}
              style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }}>
              <option value="">Select…</option>
              {cols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={run} disabled={loading}
            style={{ padding: '9px 20px', background: loading ? '#374151' : 'linear-gradient(135deg,#f59e0b,#8b5cf6)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            {loading ? 'Estimating…' : 'Estimate ATE'}
          </button>
        </div>
      </div>

      {loading && <div style={{ ...card, textAlign: 'center', padding: 40 }}><GitMerge size={32} color="#f59e0b" style={{ marginBottom: 12 }} /><p style={{ color: '#9ca3af', margin: 0 }}>Estimating causal effect via IPW and bootstrap confidence intervals…</p></div>}

      {result && !loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Naive ATE', val: result.ate_estimates?.naive_ate?.toFixed(4), color: '#6366f1' },
              { label: 'IPW ATE', val: result.ate_estimates?.ipw_ate?.toFixed(4), color: '#8b5cf6' },
              { label: '95% CI', val: `[${result.confidence_interval?.lower?.toFixed(3)}, ${result.confidence_interval?.upper?.toFixed(3)}]`, color: '#6b7280' },
              { label: 'Direction', val: result.effect_direction, color: dirColor },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={card}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>📊 ATE Estimator Comparison</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ateData}>
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <Tooltip formatter={v => [v?.toFixed(4), 'ATE']} contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {ateData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={card}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>⚖️ Covariate Balance</h3>
              {result.covariate_balance?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                  {result.covariate_balance.map(cb => (
                    <div key={cb.covariate} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ minWidth: 80, fontSize: 11, color: '#9ca3af' }}>{cb.covariate}</span>
                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.abs(cb.std_diff) * 100)}%`, height: '100%', background: cb.balanced ? '#10b981' : '#f59e0b', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 10, color: cb.balanced ? '#10b981' : '#f59e0b', minWidth: 40 }}>|{cb.std_diff?.toFixed(2)}|</span>
                    </div>
                  ))}
                </div>
              ) : <p style={{ color: '#6b7280', fontSize: 12, textAlign: 'center' }}>No control variables found.</p>}
            </div>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>💡 Interpretation</h3>
            <div style={{ display: 'flex', gap: 12, padding: '14px 16px', background: `${dirColor}11`, border: `1px solid ${dirColor}33`, borderRadius: 10 }}>
              <DirIcon size={20} color={dirColor} style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 14, color: '#d1d5db', lineHeight: 1.7 }}>{result.interpretation}</p>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: '#6b7280' }}>
              <span>Treated: <strong style={{ color: '#10b981' }}>{result.n_treated}</strong></span>
              <span>Control: <strong style={{ color: '#6b7280' }}>{result.n_control}</strong></span>
              <span>Dataset: <strong style={{ color: '#a78bfa' }}>{result.dataset}</strong></span>
            </div>
          </div>
        </>
      )}

      {!result && !loading && (
        <div style={{ ...card, textAlign: 'center', padding: 60 }}>
          <GitMerge size={40} color="#374151" style={{ marginBottom: 12 }} />
          <p style={{ color: '#6b7280', margin: 0 }}>Select a <strong>treatment</strong> column (the intervention) and an <strong>outcome</strong> column to estimate the causal effect using IPW and regression adjustment.</p>
        </div>
      )}
    </div>
  );
}
