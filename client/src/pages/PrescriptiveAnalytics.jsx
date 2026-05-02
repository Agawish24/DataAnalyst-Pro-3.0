import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { Target, TrendingUp, TrendingDown, Zap, RefreshCw, ArrowUpRight, ArrowDownRight, Lightbulb, BarChart3, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

const PYTHON = '/api/analytics';

export default function PrescriptiveAnalytics() {
  const { selectedDataset } = useData();
  const [columns, setColumns] = useState([]);
  const [targetCol, setTargetCol] = useState('');
  const [featureCols, setFeatureCols] = useState([]);
  const [optimizeFor, setOptimizeFor] = useState('maximize');
  const [result, setResult] = useState(null);
  const [prophetResult, setProphetResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [prophetLoading, setProphetLoading] = useState(false);
  const [dateCol, setDateCol] = useState('');
  const [forecastPeriods, setForecastPeriods] = useState(30);
  const [activeTab, setActiveTab] = useState('prescriptive');

  useEffect(() => {
    if (!selectedDataset) return;
    api.get(`/datasets/${selectedDataset.id}`).then(d => {
      const cols = Object.keys(d.data.schema || d.data.preview?.[0] || {});
      setColumns(cols);
      const numCols = cols.filter(c => d.data.schema?.[c] === 'numeric' || c.match(/price|sales|revenue|profit|amount|count|value|score|rating|age|size/i));
      if (numCols[0]) setTargetCol(numCols[0]);
      setFeatureCols(numCols.slice(1, 6));
    }).catch(() => {});
  }, [selectedDataset]);

  const runPrescriptive = async () => {
    if (!targetCol || !selectedDataset) return toast.error('Select target column');
    setLoading(true);
    try {
      const dataRes = await api.get(`/datasets/${selectedDataset.id}/summary`);
      const rows = dataRes.data.preview || [];
      if (!rows.length) {
        const raw = await api.get(`/datasets/${selectedDataset.id}`);
        const limit = 2000;
        const dataRows = raw.data.preview || [];
        const res = await fetch(`${PYTHON.replace('/api/analytics', '')}/api/analytics/${selectedDataset.id}/prescriptive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ target_col: targetCol, feature_cols: featureCols, optimize_for: optimizeFor }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setResult(data);
      } else {
        const res = await fetch(`/api/analytics/${selectedDataset.id}/prescriptive-direct`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ target_col: targetCol, feature_cols: featureCols, optimize_for: optimizeFor }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setResult(data);
      }
    } catch (err) {
      // Fallback to direct Python call through analytics route
      try {
        const res = await fetch(`/api/analytics/${selectedDataset.id}/prescriptive`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ target_col: targetCol, feature_cols: featureCols, optimize_for: optimizeFor }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setResult(data);
      } catch (e2) { toast.error(e2.message || 'Analysis failed'); }
    }
    finally { setLoading(false); }
  };

  const runProphet = async () => {
    if (!dateCol || !targetCol || !selectedDataset) return toast.error('Select date and value columns');
    setProphetLoading(true);
    try {
      const res = await fetch(`/api/analytics/${selectedDataset.id}/prophet`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ date_col: dateCol, value_col: targetCol, periods: forecastPeriods }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProphetResult(data);
      toast.success('Prophet forecast complete');
    } catch (err) { toast.error(err.message || 'Forecast failed'); }
    finally { setProphetLoading(false); }
  };

  const improvementColor = result?.improvement_pct > 0 ? '#10b981' : '#ef4444';

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Target size={22} color="#10b981" /> Prescriptive Analytics
        </h1>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>AI-driven optimization recommendations + Prophet time-series forecasting</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4 }}>
        {[['prescriptive', 'Optimization', Target], ['prophet', 'Prophet Forecast', Calendar]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: activeTab === id ? '#6366f1' : 'transparent', color: activeTab === id ? '#fff' : '#9ca3af' }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {!selectedDataset ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#4b5563' }}>
          <Target size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <p>Select a dataset to run prescriptive analytics</p>
        </div>
      ) : (
        <>
          {/* Prescriptive Optimization */}
          {activeTab === 'prescriptive' && (
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
              <div>
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
                  <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 16 }}>Configure</h3>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>Target Metric to Optimize</label>
                    <select value={targetCol} onChange={e => setTargetCol(e.target.value)}
                      style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
                      <option value="">— Select column —</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>Optimization Goal</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['maximize', 'minimize'].map(opt => (
                        <button key={opt} onClick={() => setOptimizeFor(opt)}
                          style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: optimizeFor === opt ? (opt === 'maximize' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)') : 'rgba(255,255,255,0.05)', color: optimizeFor === opt ? (opt === 'maximize' ? '#34d399' : '#f87171') : '#6b7280' }}>
                          {opt === 'maximize' ? <TrendingUp size={12} style={{ display: 'inline', marginRight: 4 }} /> : <TrendingDown size={12} style={{ display: 'inline', marginRight: 4 }} />}
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>Feature Variables (multi-select)</label>
                    <div style={{ maxHeight: 160, overflowY: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
                      {columns.filter(c => c !== targetCol).map(c => (
                        <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', borderRadius: 6 }}>
                          <input type="checkbox" checked={featureCols.includes(c)} onChange={e => setFeatureCols(prev => e.target.checked ? [...prev, c] : prev.filter(x => x !== c))} style={{ accentColor: '#6366f1' }} />
                          <span style={{ color: '#d1d5db', fontSize: 13 }}>{c}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button onClick={runPrescriptive} disabled={loading || !targetCol}
                    style={{ width: '100%', padding: '12px', background: loading ? 'rgba(16,185,129,0.3)' : '#10b981', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !targetCol ? 0.5 : 1 }}>
                    {loading ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Zap size={14} /> Run Optimization</>}
                  </button>
                </div>
              </div>

              <div>
                {!result ? (
                  <div style={{ textAlign: 'center', padding: 80, color: '#4b5563' }}>
                    <Target size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                    <p>Configure the target metric and run optimization to get AI recommendations</p>
                  </div>
                ) : (
                  <>
                    {/* KPI Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
                      {[
                        { label: 'Current Mean', value: result.current_mean, color: '#6b7280' },
                        { label: 'Predicted Optimal', value: result.predicted_optimal, color: '#10b981' },
                        { label: 'Potential Improvement', value: `${result.improvement_pct > 0 ? '+' : ''}${result.improvement_pct?.toFixed(1)}%`, color: improvementColor },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18, textAlign: 'center' }}>
                          <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>{label}</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color }}>{typeof value === 'number' ? value.toFixed(4) : value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Recommendations */}
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
                      <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 14, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Lightbulb size={14} color="#fbbf24" /> Prescriptive Recommendations
                      </h3>
                      {(result.recommendations || []).map((rec, i) => (
                        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14, marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center' }}>
                          <div>
                            <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{rec.action}</div>
                            <div style={{ color: '#6b7280', fontSize: 12 }}>Feature importance: {(rec.importance * 100).toFixed(1)}%</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ color: '#9ca3af', fontSize: 11 }}>Current avg</div>
                            <div style={{ color: '#d1d5db', fontSize: 13, fontWeight: 600 }}>{rec.current_avg}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ color: '#9ca3af', fontSize: 11 }}>Optimal</div>
                            <div style={{ color: '#10b981', fontSize: 13, fontWeight: 600 }}>{rec.optimal_value}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Feature Importance */}
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
                      <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Feature Importance</h3>
                      {Object.entries(result.feature_importance || {}).sort(([,a],[,b]) => b - a).map(([feat, imp]) => (
                        <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{ color: '#d1d5db', fontSize: 13, width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feat}</span>
                          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${(imp * 100).toFixed(1)}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 4 }} />
                          </div>
                          <span style={{ color: '#9ca3af', fontSize: 12, width: 50, textAlign: 'right' }}>{(imp * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Prophet Forecast */}
          {activeTab === 'prophet' && (
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
                <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 16 }}>Prophet Configuration</h3>
                {[['Date Column', dateCol, setDateCol], ['Value Column', targetCol, setTargetCol]].map(([label, val, setter]) => (
                  <div key={label} style={{ marginBottom: 14 }}>
                    <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>{label}</label>
                    <select value={val} onChange={e => setter(e.target.value)}
                      style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
                      <option value="">— Select —</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>Forecast Periods</label>
                  <input type="number" value={forecastPeriods} onChange={e => setForecastPeriods(parseInt(e.target.value))} min={7} max={365}
                    style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <button onClick={runProphet} disabled={prophetLoading || !dateCol || !targetCol}
                  style={{ width: '100%', padding: '12px', background: prophetLoading ? 'rgba(99,102,241,0.3)' : '#6366f1', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (!dateCol || !targetCol) ? 0.5 : 1 }}>
                  {prophetLoading ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Forecasting...</> : <><BarChart3 size={14} /> Run Prophet</>}
                </button>
                <div style={{ marginTop: 12, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ color: '#4b5563', fontSize: 11, lineHeight: 1.5 }}>Prophet requires a date column and at least 10 data points. It handles seasonality, holidays, and trend changes automatically.</div>
                </div>
              </div>

              <div>
                {!prophetResult ? (
                  <div style={{ textAlign: 'center', padding: 80, color: '#4b5563' }}>
                    <Calendar size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                    <p>Configure date and value columns, then run Prophet to generate a forecast</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
                      {[['Model', prophetResult.model], ['Historical Points', prophetResult.historical?.length], ['Forecast Periods', prophetResult.periods]].map(([l, v]) => (
                        <div key={l} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                          <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 4 }}>{l}</div>
                          <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 18 }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Forecast table */}
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, overflowX: 'auto' }}>
                      <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Forecast — Next {prophetResult.periods} periods</h3>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>{['Date', 'Forecast', 'Lower Bound', 'Upper Bound'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', color: '#9ca3af', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {prophetResult.forecast?.slice(-prophetResult.periods).map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '8px 12px', color: '#9ca3af' }}>{row.ds}</td>
                              <td style={{ padding: '8px 12px', color: '#f3f4f6', fontWeight: 600 }}>{row.yhat?.toFixed(4)}</td>
                              <td style={{ padding: '8px 12px', color: '#6b7280' }}>{row.yhat_lower?.toFixed(4)}</td>
                              <td style={{ padding: '8px 12px', color: '#6b7280' }}>{row.yhat_upper?.toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
