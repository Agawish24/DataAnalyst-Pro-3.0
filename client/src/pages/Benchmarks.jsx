import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Gauge, Play, Clock, Zap, TrendingUp, Database } from 'lucide-react';
const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 16 };

const COLORS = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

export default function Benchmarks() {
  const { datasets, activeDataset, selectDataset, fetchDatasets } = useData();
  const [target, setTarget] = useState('');
  const [taskType, setTaskType] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [systemStats, setSystemStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('benchmark');

  const schema = Array.isArray(activeDataset?.schema) ? activeDataset.schema : [];
  const cols = schema.map(c => c.name);

  useEffect(() => {
    fetchDatasets();
    api.get('/benchmarks/system-stats').then(r => setSystemStats(r.data)).catch(() => {});
    api.get('/benchmarks/history').then(r => setHistory(r.data)).catch(() => {});
  }, []);

  const runBenchmark = async () => {
    if (!activeDataset) return toast.error('Select a dataset first');
    if (!target) return toast.error('Select a target column');
    setLoading(true);
    try {
      const featureCols = cols.filter(c => c !== target);
      const r = await api.post(`/benchmarks/${activeDataset.id}/run`,
        { target_col: target, feature_cols: featureCols, task_type: taskType });
      setResult(r.data);
      setHistory(h => [r.data, ...h].slice(0, 20));
      toast.success(`Benchmark complete — best: ${r.data.best_model}`);
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Benchmark failed');
    } finally { setLoading(false); }
  };

  const fitData = result?.results?.map(r => ({ name: r.model.replace(' Regression', '').replace(' Forest', ' RF'), fit: r.fit_time_s * 1000, predict: r.predict_time_s * 1000, score: r.cv_score * 100 })) || [];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#f59e0b,#ef4444)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Gauge size={20} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Performance Benchmarks</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Model training time, inference speed, CV scores, and query latency</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {['benchmark', 'system', 'history'].map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: activeTab === t ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeTab === t ? '#f3f4f6' : '#6b7280', fontSize: 12, cursor: 'pointer', fontWeight: activeTab === t ? 600 : 400, textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'benchmark' && (
        <>
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Dataset</label>
                <select value={activeDataset?.id || ''} onChange={e => selectDataset(parseInt(e.target.value))}
                  style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }}>
                  <option value="">Select…</option>
                  {datasets.map(d => <option key={d.id} value={d.id}>{d.name} ({d.row_count?.toLocaleString()} rows)</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Target Column</label>
                <select value={target} onChange={e => setTarget(e.target.value)}
                  style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }}>
                  <option value="">Select…</option>
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
              <button onClick={runBenchmark} disabled={loading}
                style={{ padding: '9px 20px', background: loading ? '#374151' : 'linear-gradient(135deg,#f59e0b,#ef4444)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                <Play size={13} /> {loading ? 'Running…' : 'Run'}
              </button>
            </div>
          </div>

          {loading && <div style={{ ...card, textAlign: 'center', padding: 40 }}><Gauge size={32} color="#f59e0b" style={{ marginBottom: 12 }} /><p style={{ color: '#9ca3af', margin: 0 }}>Training 4 models and measuring performance…</p></div>}

          {result && !loading && (
            <>
              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { icon: TrendingUp, label: 'Best Model', val: result.best_model?.replace(' Regression', '').replace(' Forest', ' RF'), color: '#10b981' },
                  { icon: Gauge, label: 'Best CV Score', val: `${((result.results?.[0]?.cv_score || 0) * 100).toFixed(1)}%`, color: '#6366f1' },
                  { icon: Clock, label: 'Query Latency', val: `${result.query_latency_ms}ms`, color: '#f59e0b' },
                  { icon: Database, label: 'Rows Tested', val: result.n_rows?.toLocaleString(), color: '#8b5cf6' },
                ].map(({ icon: Icon, label, val, color }) => (
                  <div key={label} style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, background: `${color}22`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={16} color={color} />
                    </div>
                    <div><div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div><div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div></div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={card}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>📊 CV Score by Model ({result.metric})</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={fitData}>
                      <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                      <Tooltip formatter={v => [`${v.toFixed(2)}%`, 'CV Score']} contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                        {fitData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div style={card}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>⏱ Training & Inference Time (ms)</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={fitData}>
                      <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `${v}ms`} />
                      <Tooltip formatter={v => [`${v.toFixed(1)}ms`]} contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="fit" name="Train" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="predict" name="Predict" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Detailed table */}
              <div style={card}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>📋 Detailed Results</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['Model', 'CV Score', 'CV Std', 'Fit Time', 'Predict Time', 'Rows/sec'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.results?.map((r, i) => (
                      <tr key={r.model} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i === 0 ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                        <td style={{ padding: '8px 12px', color: '#d1d5db', fontWeight: i === 0 ? 700 : 400 }}>{r.model} {i === 0 ? '🏆' : ''}</td>
                        <td style={{ padding: '8px 12px', color: '#10b981' }}>{(r.cv_score * 100).toFixed(2)}%</td>
                        <td style={{ padding: '8px 12px', color: '#6b7280' }}>±{(r.cv_std * 100).toFixed(2)}%</td>
                        <td style={{ padding: '8px 12px', color: '#f59e0b' }}>{(r.fit_time_s * 1000).toFixed(0)}ms</td>
                        <td style={{ padding: '8px 12px', color: '#a78bfa' }}>{(r.predict_time_s * 1000).toFixed(1)}ms</td>
                        <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.rows_per_second?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!result && !loading && <div style={{ ...card, textAlign: 'center', padding: 60 }}><Gauge size={40} color="#374151" style={{ marginBottom: 12 }} /><p style={{ color: '#6b7280', margin: 0 }}>Select a dataset and target column to benchmark 4 ML models head-to-head.</p></div>}
        </>
      )}

      {activeTab === 'system' && (
        <div style={card}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>🖥 System Query Benchmarks</h3>
          {systemStats ? (
            <>
              <div style={{ marginBottom: 12, fontSize: 12, color: '#6b7280' }}>Measured at {new Date(systemStats.timestamp).toLocaleTimeString()}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Dataset', 'Declared Rows', 'Actual Rows', 'COUNT(*) Latency', 'Status'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {systemStats.query_benchmarks?.map(s => (
                    <tr key={s.dataset_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 12px', color: '#d1d5db', fontWeight: 600 }}>{s.name}</td>
                      <td style={{ padding: '8px 12px', color: '#9ca3af' }}>{s.declared_rows?.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', color: '#10b981' }}>{s.actual_rows?.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: s.query_ms < 50 ? 'rgba(16,185,129,0.15)' : s.query_ms < 200 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: s.query_ms < 50 ? '#10b981' : s.query_ms < 200 ? '#f59e0b' : '#ef4444' }}>
                          {s.query_ms}ms
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <Zap size={12} color={s.query_ms < 100 ? '#10b981' : '#f59e0b'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : <p style={{ color: '#6b7280', textAlign: 'center' }}>Loading system stats…</p>}
        </div>
      )}

      {activeTab === 'history' && (
        <div style={card}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>📜 Benchmark History</h3>
          {history.length === 0 ? <p style={{ color: '#6b7280', textAlign: 'center' }}>No benchmarks run yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db' }}>{h.dataset_name || `Dataset ${h.dataset_id}`}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Target: {h.target_col} · {h.task_type}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>{h.best_model}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{h.total_benchmark_ms ? `${h.total_benchmark_ms}ms` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
