import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Bot, Play, Trophy, BarChart2, Target, RefreshCw, ChevronRight } from 'lucide-react';

const MODEL_ICONS = { 'Random Forest': '🌲', 'Gradient Boosting': '⚡', 'Logistic Regression': '📈', 'SVM': '🔷', 'Ridge Regression': '📉', 'Lasso Regression': '🧮' };
const SCORE_COLOR = (s) => s >= 0.85 ? '#10b981' : s >= 0.70 ? '#f59e0b' : '#ef4444';

export default function AutoML() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [columns, setColumns] = useState([]);
  const [targetCol, setTargetCol] = useState('');
  const [featureCols, setFeatureCols] = useState([]);
  const [taskType, setTaskType] = useState('auto');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => { fetchDatasets(); loadHistory(); }, []);
  useEffect(() => { if (activeDataset) { loadColumns(); setResult(null); setTargetCol(''); setFeatureCols([]); } }, [activeDataset]);

  const loadColumns = async () => {
    try { const r = await api.get(`/datasets/${activeDataset.id}`); setColumns(Object.keys(r.data.schema || {})); }
    catch {}
  };
  const loadHistory = async () => { try { const r = await api.get('/automl/runs'); setHistory(r.data); } catch {} };

  const run = async () => {
    if (!activeDataset) return toast.error('Select a dataset');
    if (!targetCol) return toast.error('Select a target column');
    setRunning(true);
    try {
      const payload = { target_col: targetCol, feature_cols: featureCols.length ? featureCols : undefined };
      if (taskType !== 'auto') payload.task_type = taskType;
      const r = await api.post(`/automl/${activeDataset.id}/run`, payload);
      setResult(r.data); loadHistory();
      toast.success(`Best model: ${r.data.best_model}`);
    } catch (e) { toast.error(e.response?.data?.error || 'AutoML failed — Python service may be unavailable'); }
    finally { setRunning(false); }
  };

  const availableFeatures = columns.filter(c => c !== targetCol);

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}><Bot size={26} color="#8b5cf6" /> AutoML</h1>
        <p style={{ color: '#9ca3af', margin: 0 }}>Automatically compare multiple ML models and find the best performer for your data</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: result ? '320px 1fr' : '480px 1fr', gap: 20 }}>
        {/* Config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 }}>
            <div style={{ color: '#f3f4f6', fontWeight: 700, marginBottom: 16 }}>Configuration</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>DATASET</label>
                <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))}
                  style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                  <option value="">Select...</option>{datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select></div>
              {activeDataset && <>
                <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>TARGET COLUMN (what to predict)</label>
                  <select value={targetCol} onChange={e => setTargetCol(e.target.value)}
                    style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                    <option value="">Select target...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>TASK TYPE</label>
                  <select value={taskType} onChange={e => setTaskType(e.target.value)}
                    style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                    <option value="auto">Auto-detect</option><option value="classification">Classification</option><option value="regression">Regression</option>
                  </select></div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>FEATURE COLUMNS (leave empty = use all)</label>
                  <div style={{ maxHeight: 160, overflowY: 'auto', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8 }}>
                    {availableFeatures.map(c => (
                      <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', borderRadius: 4 }}>
                        <input type="checkbox" checked={featureCols.includes(c)} onChange={e => setFeatureCols(prev => e.target.checked ? [...prev, c] : prev.filter(x => x !== c))} />
                        <span style={{ color: '#e2e8f0', fontSize: 13 }}>{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>}
              <button onClick={run} disabled={running || !activeDataset || !targetCol}
                style={{ padding: '12px 0', borderRadius: 8, border: 'none', background: running ? '#374151' : 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15 }}>
                {running ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Training models...</> : <><Play size={16} /> Run AutoML</>}
              </button>
              {running && <div style={{ color: '#6b7280', fontSize: 12, textAlign: 'center' }}>Comparing Random Forest, Gradient Boosting, Logistic Regression, SVM... this may take 30-60s</div>}
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontWeight: 600 }}>Recent Runs</div>
              {history.slice(0, 5).map(h => (
                <div key={h.id} style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontSize: 13 }}>{h.dataset_name} → {h.target_col}</div>
                    <div style={{ color: '#6b7280', fontSize: 11 }}>{h.best_model} · {new Date(h.created_at).toLocaleDateString()}</div>
                  </div>
                  <span style={{ color: SCORE_COLOR(h.best_score), fontWeight: 700, fontSize: 14 }}>{(h.best_score * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Winner banner */}
            <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 12, padding: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
              <Trophy size={36} color="#f59e0b" />
              <div>
                <div style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 22 }}>{MODEL_ICONS[result.best_model]} {result.best_model}</div>
                <div style={{ color: '#9ca3af', fontSize: 14 }}>Best model · {result.task_type} · {result.metric}: <strong style={{ color: SCORE_COLOR(result.best_score), fontSize: 20 }}>{(result.best_score * 100).toFixed(1)}%</strong></div>
                <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{result.recommendation}</div>
              </div>
            </div>

            {/* All models */}
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontWeight: 600 }}>Model Comparison</div>
              {Object.entries(result.all_scores).sort(([,a],[,b]) => (b||0)-(a||0)).map(([model, score]) => {
                const pct = score !== null ? score * 100 : 0;
                const isWinner = model === result.best_model;
                return (
                  <div key={model} style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: isWinner ? 'rgba(139,92,246,0.05)' : 'transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{MODEL_ICONS[model]}</span>
                        <span style={{ color: isWinner ? '#f3f4f6' : '#9ca3af', fontWeight: isWinner ? 700 : 400 }}>{model}</span>
                        {isWinner && <span style={{ background: '#f59e0b22', color: '#f59e0b', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>BEST</span>}
                      </div>
                      <span style={{ color: score !== null ? SCORE_COLOR(score) : '#6b7280', fontWeight: 700, fontSize: 16 }}>{score !== null ? pct.toFixed(1) + '%' : 'failed'}</span>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6 }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: 4, background: score !== null ? SCORE_COLOR(score) : '#374151', transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Feature importance */}
            {result.feature_importance && Object.keys(result.feature_importance).length > 0 && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Target size={16} color="#10b981" /> Feature Importance
                </div>
                {Object.entries(result.feature_importance).sort(([,a],[,b]) => b-a).slice(0, 10).map(([feat, imp]) => (
                  <div key={feat} style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ color: '#e2e8f0', fontSize: 13 }}>{feat}</span>
                      <span style={{ color: '#10b981', fontWeight: 600, fontSize: 13 }}>{(imp * 100).toFixed(1)}%</span>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 3, height: 5 }}>
                      <div style={{ width: `${imp * 100}%`, height: '100%', background: '#10b981', borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ color: '#6b7280', fontSize: 12, textAlign: 'center' }}>
              Trained on {result.sample_size?.toLocaleString()} samples · {result.features_used?.length} features · 5-fold cross-validation
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
