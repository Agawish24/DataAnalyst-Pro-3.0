import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import toast from 'react-hot-toast';
import {
  Bot, Play, Trophy, Target, RefreshCw, GitMerge, ShieldCheck,
  Sparkles, ChevronDown, ChevronUp, GitBranch, Database, Info, BarChart2
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const MODEL_META = {
  'Random Forest':       { icon: '🌲', color: '#10b981', desc: 'Ensemble of decision trees; handles non-linearity well' },
  'Gradient Boosting':   { icon: '⚡', color: '#f59e0b', desc: 'Sequential boosting; strong on tabular data' },
  'XGBoost':             { icon: '🚀', color: '#6366f1', desc: 'Optimised gradient boosting; often tops leaderboards' },
  'Neural Network':      { icon: '🧠', color: '#ec4899', desc: 'MLP (64→32 hidden units); learns non-linear patterns' },
  'Logistic Regression': { icon: '📈', color: '#3b82f6', desc: 'Linear classifier; fast, interpretable baseline' },
  'SVM':                 { icon: '🔷', color: '#8b5cf6', desc: 'Support Vector Machine with RBF kernel' },
  'Ridge Regression':    { icon: '📉', color: '#06b6d4', desc: 'L2-regularised linear regression' },
  'Lasso Regression':    { icon: '🧮', color: '#14b8a6', desc: 'L1-regularised; promotes sparse feature sets' },
};

const SCORE_COLOR = s => s >= 0.85 ? '#10b981' : s >= 0.70 ? '#f59e0b' : '#ef4444';
const sel = { width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 };

// ── Model comparison bar chart ────────────────────────────────────────────────
const ModelChart = ({ allScores, bestModel, metric }) => {
  const sorted = Object.entries(allScores || {})
    .filter(([, v]) => v !== null)
    .sort(([, a], [, b]) => b - a);
  if (!sorted.length) return null;

  const data = {
    labels: sorted.map(([n]) => n),
    datasets: [{
      label: metric === 'accuracy' ? 'Accuracy (%)' : 'R² Score (%)',
      data: sorted.map(([, v]) => parseFloat((v * 100).toFixed(2)),),
      backgroundColor: sorted.map(([n]) => n === bestModel ? 'rgba(99,102,241,0.8)' : 'rgba(99,102,241,0.25)'),
      borderColor: sorted.map(([n]) => n === bestModel ? '#6366f1' : 'rgba(99,102,241,0.4)'),
      borderWidth: sorted.map(([n]) => n === bestModel ? 2 : 1),
      borderRadius: 5,
    }],
  };
  const max = Math.max(0, ...sorted.map(([, v]) => v * 100)) + 5;
  const options = {
    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x.toFixed(1)}%` } } },
    scales: {
      x: { min: 0, max: Math.min(100, max), ticks: { color: '#6b7280', font: { size: 11 }, callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { ticks: { color: '#9ca3af', font: { size: 12 } }, grid: { display: false } },
    },
  };
  return (
    <div style={{ height: Math.max(180, sorted.length * 42) }}>
      <Bar data={data} options={options} />
    </div>
  );
};

// ── Feature importance chart ─────────────────────────────────────────────────
const FeatureChart = ({ featureImportance }) => {
  const sorted = Object.entries(featureImportance || {}).sort(([, a], [, b]) => b - a).slice(0, 10);
  if (!sorted.length) return null;
  const max = Math.max(0.001, ...sorted.map(([, v]) => v));
  return (
    <div>
      {sorted.map(([feat, imp], i) => (
        <div key={feat} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ color: '#e2e8f0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#4b5563', fontSize: 11 }}>#{i + 1}</span> {feat}
            </span>
            <span style={{ color: '#10b981', fontWeight: 700, fontSize: 13 }}>{(imp * 100).toFixed(1)}%</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 3, height: 5 }}>
            <div style={{ width: `${(imp / max) * 100}%`, height: '100%', background: i === 0 ? '#6366f1' : '#10b981', borderRadius: 3, transition: 'width 0.6s' }} />
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Per-model CV detail card ──────────────────────────────────────────────────
const ModelDetailCard = ({ name, score, detail, isWinner }) => {
  const [open, setOpen] = useState(false);
  const meta = MODEL_META[name] || { icon: '🤖', color: '#6b7280', desc: '' };
  const pct = score !== null ? score * 100 : 0;
  return (
    <div style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: isWinner ? 'rgba(99,102,241,0.05)' : 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 18 }}>{meta.icon}</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ color: isWinner ? '#f3f4f6' : '#9ca3af', fontWeight: isWinner ? 700 : 400, fontSize: 14 }}>{name}</span>
              {isWinner && <span style={{ background: '#f59e0b22', color: '#f59e0b', padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>BEST</span>}
            </div>
            <div style={{ color: '#4b5563', fontSize: 11 }}>{meta.desc}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: score !== null ? SCORE_COLOR(score) : '#6b7280', fontWeight: 700, fontSize: 16 }}>
            {score !== null ? pct.toFixed(1) + '%' : 'failed'}
          </span>
          {detail?.cv_scores && (
            <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 2 }}>
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6 }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: 4, background: score !== null ? meta.color : '#374151', transition: 'width 0.6s' }} />
      </div>
      {open && detail?.cv_scores && (
        <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 6 }}>{detail.cv_folds}-fold CV scores:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {detail.cv_scores.map((s, i) => (
              <span key={i} style={{ background: `${SCORE_COLOR(s)}18`, color: SCORE_COLOR(s), padding: '2px 9px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                Fold {i + 1}: {(s * 100).toFixed(1)}%
              </span>
            ))}
          </div>
          {detail.std && <div style={{ color: '#4b5563', fontSize: 11, marginTop: 6 }}>Std Dev: ±{(detail.std * 100).toFixed(2)}% — {detail.std < 0.03 ? 'stable' : detail.std < 0.07 ? 'moderate variance' : 'high variance'}</div>}
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════════
export default function AutoML() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [columns, setColumns] = useState([]);
  const [targetCol, setTargetCol] = useState('');
  const [featureCols, setFeatureCols] = useState([]);
  const [taskType, setTaskType] = useState('auto');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState('single'); // 'single' | 'cross'
  const [crossDatasets, setCrossDatasets] = useState([]);
  const [joinKey, setJoinKey] = useState('');
  const [showNarrative, setShowNarrative] = useState(true);
  const [activeTab, setActiveTab] = useState('models');

  useEffect(() => { fetchDatasets(); loadHistory(); }, []);
  useEffect(() => {
    if (activeDataset) { loadColumns(); setResult(null); setTargetCol(''); setFeatureCols([]); }
  }, [activeDataset]);

  const loadColumns = async () => {
    try {
      const r = await api.get(`/datasets/${activeDataset.id}`);
      const schema = r.data.schema || [];
      const cols = Array.isArray(schema) ? schema.map(c => c.name) : Object.keys(schema);
      setColumns(cols);
    } catch {}
  };

  const loadHistory = async () => {
    try { const r = await api.get('/automl/runs'); setHistory(r.data); } catch {}
  };

  const run = async () => {
    if (mode === 'single') {
      if (!activeDataset) return toast.error('Select a dataset');
      if (!targetCol) return toast.error('Select a target column');
    } else {
      if (crossDatasets.length < 2) return toast.error('Select at least 2 datasets for cross-dataset mode');
      if (!targetCol) return toast.error('Select a target column');
    }

    setRunning(true);
    setResult(null);
    setActiveTab('models');
    try {
      let r;
      if (mode === 'cross') {
        r = await api.post('/automl/cross-dataset', {
          dataset_ids: crossDatasets,
          join_key: joinKey || undefined,
          target_col: targetCol,
          feature_cols: featureCols.length ? featureCols : undefined,
          task_type: taskType !== 'auto' ? taskType : undefined,
        });
      } else {
        r = await api.post(`/automl/${activeDataset.id}/run`, {
          target_col: targetCol,
          feature_cols: featureCols.length ? featureCols : undefined,
          task_type: taskType !== 'auto' ? taskType : undefined,
        });
      }
      setResult(r.data);
      loadHistory();
      const n = r.data.models_compared || Object.keys(r.data.all_scores || {}).length;
      toast.success(`Best: ${r.data.best_model} · ${(r.data.best_score * 100).toFixed(1)}% · ${n} models compared`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'AutoML failed — Python service may be unavailable');
    } finally { setRunning(false); }
  };

  const toggleCrossDataset = (id) => {
    setCrossDatasets(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const availableFeatures = columns.filter(c => c !== targetCol);
  const tabs = [
    { id: 'models', label: `Models (${result ? Object.keys(result.all_scores || {}).length : 0})` },
    { id: 'features', label: 'Feature Importance', disabled: !result?.feature_importance || !Object.keys(result.feature_importance).length },
    { id: 'governance', label: 'Governance', disabled: !result?.governance },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bot size={24} color="#8b5cf6" /> AutoML
        </h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: 13 }}>
          8-model tournament: Random Forest · XGBoost · Neural Network (MLP) · Gradient Boosting · Logistic Regression · SVM · Ridge · Lasso · with governance lineage &amp; AI narrative
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: result ? '300px 1fr' : '380px 1fr', gap: 20 }}>
        {/* ── Config panel ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
            <div style={{ color: '#f3f4f6', fontWeight: 700, marginBottom: 14, fontSize: 14 }}>Configuration</div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3, marginBottom: 14, gap: 2 }}>
              {[['single', 'Single Dataset'], ['cross', 'Cross-Dataset']].map(([m, label]) => (
                <button key={m} onClick={() => { setMode(m); setResult(null); }}
                  style={{ flex: 1, padding: '7px 0', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: mode === m ? 'rgba(139,92,246,0.25)' : 'transparent', color: mode === m ? '#c4b5fd' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  {m === 'cross' ? <GitMerge size={12} /> : <Database size={12} />} {label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Single dataset selector */}
              {mode === 'single' && (
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>Dataset</label>
                  <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))} style={sel}>
                    <option value="">Select…</option>
                    {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}

              {/* Cross-dataset multi-select */}
              {mode === 'cross' && (
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>
                    Datasets to merge <span style={{ color: '#4b5563', fontWeight: 400 }}>(select ≥2)</span>
                  </label>
                  <div style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, maxHeight: 140, overflowY: 'auto' }}>
                    {datasets.map(d => (
                      <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', cursor: 'pointer', borderRadius: 4 }}>
                        <input type="checkbox" checked={crossDatasets.includes(d.id)} onChange={() => toggleCrossDataset(d.id)} />
                        <span style={{ color: '#e2e8f0', fontSize: 13 }}>{d.name}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>
                      Join Key <span style={{ color: '#4b5563', fontWeight: 400 }}>(optional — leave blank for union-stack)</span>
                    </label>
                    <input value={joinKey} onChange={e => setJoinKey(e.target.value)} placeholder="e.g. customer_id, campaign_id"
                      style={{ ...sel, padding: '8px 12px', fontSize: 13 }} />
                  </div>
                  {crossDatasets.length >= 2 && (
                    <div style={{ marginTop: 6, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: '#a5b4fc' }}>
                      {datasets.filter(d => crossDatasets.includes(d.id)).map(d => d.name).join(' + ')} → {joinKey ? `join on "${joinKey}"` : 'union-stack'}
                    </div>
                  )}
                </div>
              )}

              {/* Target column — manual input for cross-dataset */}
              <div>
                <label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>Target Column (predict)</label>
                {mode === 'single' && columns.length > 0 ? (
                  <select value={targetCol} onChange={e => setTargetCol(e.target.value)} style={sel}>
                    <option value="">Select target…</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input value={targetCol} onChange={e => setTargetCol(e.target.value)} placeholder="e.g. status, revenue, churn"
                    style={{ ...sel, padding: '8px 12px', fontSize: 13 }} />
                )}
              </div>

              <div>
                <label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>Task Type</label>
                <select value={taskType} onChange={e => setTaskType(e.target.value)} style={sel}>
                  <option value="auto">Auto-detect</option>
                  <option value="classification">Classification</option>
                  <option value="regression">Regression</option>
                </select>
              </div>

              {/* Feature column selector (single mode only) */}
              {mode === 'single' && availableFeatures.length > 0 && (
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>
                    Feature Columns <span style={{ color: '#4b5563', fontWeight: 400 }}>(empty = all)</span>
                  </label>
                  <div style={{ maxHeight: 150, overflowY: 'auto', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8 }}>
                    {availableFeatures.map(c => (
                      <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', borderRadius: 4 }}>
                        <input type="checkbox" checked={featureCols.includes(c)} onChange={e => setFeatureCols(prev => e.target.checked ? [...prev, c] : prev.filter(x => x !== c))} />
                        <span style={{ color: '#e2e8f0', fontSize: 13 }}>{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={run} disabled={running || (!activeDataset && mode === 'single') || !targetCol || (mode === 'cross' && crossDatasets.length < 2)}
                style={{ padding: '12px 0', borderRadius: 9, border: 'none', background: running ? '#374151' : 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 }}>
                {running ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Training 8 models…</> : <><Play size={14} /> Run AutoML</>}
              </button>

              {running && (
                <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center', lineHeight: 1.6 }}>
                  Comparing: Random Forest · XGBoost · Neural Network · Gradient Boosting · Logistic Regression · SVM · Ridge · Lasso
                  <br />Cross-validated · may take 30–90s
                </div>
              )}
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontWeight: 700, fontSize: 13 }}>Recent Runs</div>
              {history.slice(0, 6).map(h => (
                <div key={h.id} style={{ padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#e2e8f0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.dataset_name} → {h.target_col}</div>
                    <div style={{ color: '#4b5563', fontSize: 11 }}>{MODEL_META[h.best_model]?.icon} {h.best_model} · {new Date(h.created_at).toLocaleDateString()}</div>
                  </div>
                  <span style={{ color: SCORE_COLOR(h.best_score), fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{(h.best_score * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Results ────────────────────────────────────────────────── */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Winner banner */}
            <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(99,102,241,0.15))', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 13, padding: '18px 22px', display: 'flex', gap: 16, alignItems: 'center' }}>
              <Trophy size={38} color="#f59e0b" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 22, display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span>{MODEL_META[result.best_model]?.icon || '🤖'}</span> {result.best_model}
                </div>
                <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>
                  Best model · {result.task_type} · {result.metric === 'accuracy' ? 'Accuracy' : 'R² Score'}:{' '}
                  <strong style={{ color: SCORE_COLOR(result.best_score), fontSize: 20 }}>{(result.best_score * 100).toFixed(1)}%</strong>
                  {result.winner_gap != null && (
                    <span style={{ marginLeft: 10, color: '#6b7280', fontSize: 12 }}>+{(result.winner_gap * 100).toFixed(1)}pp ahead of runner-up</span>
                  )}
                </div>
                <div style={{ color: '#4b5563', fontSize: 11, marginTop: 4 }}>
                  {result.cv_folds}-fold cross-validation · {result.sample_size?.toLocaleString()} training rows · {result.models_compared || Object.keys(result.all_scores || {}).length} models compared
                  {result.cross_dataset && <span style={{ marginLeft: 8, color: '#a78bfa' }}>· Cross-dataset: {result.dataset_label}</span>}
                </div>
              </div>
            </div>

            {/* AI Narrative */}
            {result.narrative && (
              <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 11, padding: 16 }}>
                <button onClick={() => setShowNarrative(!showNarrative)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#a5b4fc', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: showNarrative ? 10 : 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> AI Narrative — why {result.best_model} won</span>
                  {showNarrative ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {showNarrative && (
                  <div style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.8 }}>{result.narrative}</div>
                )}
              </div>
            )}

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: 3, border: '1px solid rgba(255,255,255,0.06)' }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => !t.disabled && setActiveTab(t.id)} disabled={t.disabled}
                  style={{ flex: 1, padding: '7px 10px', border: 'none', borderRadius: 7, cursor: t.disabled ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12, opacity: t.disabled ? 0.35 : 1, background: activeTab === t.id ? 'rgba(99,102,241,0.22)' : 'transparent', color: activeTab === t.id ? '#a5b4fc' : '#6b7280' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab: Models */}
            {activeTab === 'models' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Visual bar chart */}
                <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 }}>
                  <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <BarChart2 size={13} color="#6b7280" /> Model Comparison
                  </div>
                  <ModelChart allScores={result.all_scores} bestModel={result.best_model} metric={result.metric} />
                </div>

                {/* Detail cards with CV fold scores */}
                <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Info size={13} color="#6b7280" /> Per-Model Details
                    <span style={{ color: '#4b5563', fontWeight: 400, fontSize: 12 }}>— click to expand CV fold scores</span>
                  </div>
                  {Object.entries(result.all_scores || {})
                    .sort(([, a], [, b]) => (b || 0) - (a || 0))
                    .map(([name, score]) => (
                      <ModelDetailCard key={name} name={name} score={score}
                        detail={result.model_details?.[name]}
                        isWinner={name === result.best_model} />
                    ))}
                </div>
              </div>
            )}

            {/* Tab: Feature Importance */}
            {activeTab === 'features' && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Target size={13} color="#10b981" /> Feature Importance
                  <span style={{ color: '#4b5563', fontWeight: 400, fontSize: 12 }}>— from {result.best_model}</span>
                </div>
                <div style={{ padding: '4px 16px 12px' }}>
                  <FeatureChart featureImportance={result.feature_importance} />
                </div>
              </div>
            )}

            {/* Tab: Governance */}
            {activeTab === 'governance' && result.governance && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
                <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <ShieldCheck size={13} color="#10b981" /> Governance & Lineage
                </div>

                {/* Single dataset governance */}
                {!result.governance.datasets && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    {[
                      ['Dataset', result.governance.dataset_name],
                      ['Version', `v${result.governance.dataset_version || '1.0'}`],
                      ['Target', result.governance.target_col],
                      ['Task Type', result.governance.task_type],
                      ['Training Rows', result.governance.sample_size?.toLocaleString()],
                      ['Models Compared', result.governance.models_compared],
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '9px 11px' }}>
                        <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cross-dataset governance */}
                {result.governance.datasets && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>Datasets merged:</div>
                    {result.governance.datasets.map(d => (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <Database size={12} color="#6b7280" />
                        <span style={{ color: '#e2e8f0', fontSize: 13 }}>{d.name}</span>
                        <span style={{ color: '#4b5563', fontSize: 11 }}>#{d.id}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        ['Merge Strategy', result.governance.merge_strategy],
                        ['Merged Rows', result.governance.merged_rows?.toLocaleString()],
                        ['Target', result.governance.target_col],
                        ['Models Compared', result.governance.models_compared],
                      ].map(([k, v]) => (
                        <div key={k} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
                          <div style={{ color: '#e2e8f0', fontSize: 13 }}>{v || '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lineage event record */}
                <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.14)', borderRadius: 9, padding: '11px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <GitBranch size={13} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div style={{ color: '#6ee7b7', fontWeight: 700, fontSize: 12, marginBottom: 3 }}>Lineage Event Recorded</div>
                      <div style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.6 }}>
                        Run executed on <strong style={{ color: '#d1d5db' }}>{result.governance.dataset_name || result.governance.datasets?.map(d => d.name).join(' + ')}</strong>{result.governance.dataset_version ? ` v${result.governance.dataset_version}` : ''} at <strong style={{ color: '#d1d5db' }}>{result.governance.run_at_display || result.governance.run_at}</strong>.
                        Winner: <strong style={{ color: '#d1d5db' }}>{result.best_model}</strong> · {result.metric} = {(result.best_score * 100).toFixed(1)}%.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
