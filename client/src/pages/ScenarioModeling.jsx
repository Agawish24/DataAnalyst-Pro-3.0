import { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, LineElement, PointElement, Filler
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import toast from 'react-hot-toast';
import {
  Sliders, Plus, Play, Save, Trash2, BarChart3, RefreshCw,
  Sparkles, ShieldCheck, GitBranch, Users, ChevronDown, ChevronUp,
  CheckCircle, Clock, AlertCircle, TrendingUp, TrendingDown, Database, Info
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, LineElement, PointElement, Filler);

// ── Distribution metadata ────────────────────────────────────────────────────
const DIST_META = {
  normal:     { label: 'Normal',     color: '#6366f1', desc: 'Bell curve — symmetric around base value' },
  uniform:    { label: 'Uniform',    color: '#10b981', desc: 'Equal probability within min–max range' },
  triangular: { label: 'Triangular', color: '#f59e0b', desc: 'Most likely at base, tapers to min/max' },
  lognormal:  { label: 'Log-Normal', color: '#ec4899', desc: 'Right-skewed — good for prices, revenue' },
};

const STATUS_META = {
  draft:             { label: 'Draft',      color: '#6b7280', icon: Clock },
  pending_approval:  { label: 'In Review',  color: '#f59e0b', icon: AlertCircle },
  approved:          { label: 'Approved',   color: '#10b981', icon: CheckCircle },
};

const SCORE_COLOR = v => v > 0 ? '#10b981' : v < 0 ? '#ef4444' : '#6b7280';
const inp = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 13 };

// ── Mini distribution curve preview ─────────────────────────────────────────
const DistCurve = ({ variable, preview }) => {
  if (!preview?.x?.length) {
    // Generate a simple SVG curve without preview data
    const { distribution: dist = 'normal' } = variable;
    const color = DIST_META[dist]?.color || '#6366f1';
    const pts = dist === 'normal'
      ? Array.from({ length: 20 }, (_, i) => { const x = (i / 19) * 4 - 2; return Math.exp(-0.5 * x * x); })
      : dist === 'lognormal'
      ? Array.from({ length: 20 }, (_, i) => { const x = i / 19; return x < 0.05 ? 0 : Math.exp(-0.5 * ((Math.log(x + 0.05) + 0.5) ** 2)) / (x + 0.05); })
      : dist === 'triangular'
      ? Array.from({ length: 20 }, (_, i) => i < 10 ? i / 10 : (20 - i) / 10)
      : Array.from({ length: 20 }, () => 1);
    const maxPt = Math.max(...pts, 0.01);
    const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i / 19) * 60} ${14 - (p / maxPt) * 13}`).join(' ');
    return (
      <svg width={62} height={16} style={{ opacity: 0.7 }}>
        <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const { x, y } = preview;
  const maxY = Math.max(...y, 0.01);
  const pathD = x.map((_, i) => `${i === 0 ? 'M' : 'L'} ${(i / (x.length - 1)) * 60} ${14 - (y[i] / maxY) * 13}`).join(' ');
  const color = DIST_META[variable.distribution]?.color || '#6366f1';
  return (
    <svg width={62} height={16} style={{ opacity: 0.8 }}>
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Histogram chart ──────────────────────────────────────────────────────────
const HistogramChart = ({ histogram, percentiles, mean }) => {
  if (!histogram?.counts?.length) return null;
  const { counts, edges } = histogram;
  const p5  = percentiles?.['5'];
  const p95 = percentiles?.['95'];
  const p25 = percentiles?.['25'];
  const p75 = percentiles?.['75'];
  const colors = counts.map((_, i) => {
    const edgeMid = (edges[i] + edges[i + 1]) / 2;
    if (edgeMid < p5 || edgeMid > p95) return 'rgba(239,68,68,0.55)';
    if (edgeMid < p25 || edgeMid > p75) return 'rgba(99,102,241,0.4)';
    return 'rgba(99,102,241,0.75)';
  });
  const labels = edges.slice(0, -1).map(e => parseFloat(e.toFixed(1)));
  const data = {
    labels,
    datasets: [{
      label: 'Frequency',
      data: counts,
      backgroundColor: colors,
      borderColor: colors.map(c => c.replace('0.55', '0.8').replace('0.4', '0.7').replace('0.75', '1')),
      borderWidth: 0.5,
      borderRadius: 1,
    }],
  };
  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: {
        title: ctx => `Value: ${ctx[0].label}–${edges[ctx[0].dataIndex + 1]?.toFixed(1)}`,
        label: ctx => ` Count: ${ctx.parsed.y.toLocaleString()}`
      }},
    },
    scales: {
      x: { ticks: { color: '#4b5563', font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
      y: { ticks: { color: '#4b5563', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
    },
  };
  return (
    <div>
      <div style={{ height: 160 }}>
        <Bar data={data} options={opts} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
        {[['P5', p5, '#ef4444'], ['P25', p25, '#6366f133'], ['Mean', mean, '#f59e0b'], ['P75', p75, '#6366f133'], ['P95', p95, '#ef4444']].map(([label, val, color]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ color: color === '#f59e0b' ? '#fbbf24' : color === '#ef4444' ? '#f87171' : '#818cf8', fontSize: 11, fontWeight: 700 }}>{label}</div>
            <div style={{ color: '#d1d5db', fontSize: 12 }}>{parseFloat(val || 0).toFixed(2)}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center', marginTop: 6 }}>
        Purple = 50% confidence band · Red tails = 5th/95th percentile risk zones
      </div>
    </div>
  );
};

// ── Tornado chart ────────────────────────────────────────────────────────────
const TornadoChart = ({ tornado, baseline }) => {
  if (!tornado?.length) return null;
  const sorted = [...tornado].sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing)).slice(0, 8);
  const maxSwing = Math.max(...sorted.map(t => Math.abs(t.swing)), 1);
  return (
    <div>
      {sorted.map((t, i) => {
        const lowPct  = ((baseline - t.low) / maxSwing) * 50;
        const highPct = ((t.high - baseline) / maxSwing) * 50;
        const color = DIST_META[t.distribution]?.color || '#6366f1';
        return (
          <div key={t.name} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ color: '#9ca3af', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: '#4b5563', fontSize: 10 }}>#{i + 1}</span> {t.name}
              </span>
              <span style={{ color: '#d1d5db', fontSize: 12, fontWeight: 600 }}>±{t.swing_pct?.toFixed(1)}%</span>
            </div>
            <div style={{ height: 16, display: 'flex', alignItems: 'center', position: 'relative', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
              {/* Centre line */}
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.1)' }} />
              {/* Low bar (left) */}
              <div style={{ position: 'absolute', right: '50%', width: `${Math.min(50, lowPct)}%`, height: '100%', background: '#ef444466', borderRadius: '4px 0 0 4px' }} />
              {/* High bar (right) */}
              <div style={{ position: 'absolute', left: '50%', width: `${Math.min(50, highPct)}%`, height: '100%', background: `${color}66`, borderRadius: '0 4px 4px 0' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ color: '#ef4444', fontSize: 10 }}>{t.low?.toFixed(2)}</span>
              <span style={{ color: '#6b7280', fontSize: 10 }}>{t.base?.toFixed(2)}</span>
              <span style={{ color: color, fontSize: 10 }}>{t.high?.toFixed(2)}</span>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center', marginTop: 4 }}>Sorted by sensitivity (swing magnitude). Red = downside, coloured = upside.</div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Variable Editor Row
// ═══════════════════════════════════════════════════════════════════════════
const VariableRow = ({ v, i, updateVar, removeVar, distPreview }) => {
  const [expanded, setExpanded] = useState(false);
  const distColor = DIST_META[v.distribution]?.color || '#6366f1';

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, borderLeft: `3px solid ${distColor}` }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 100px 120px 36px 28px', gap: 8, alignItems: 'end' }}>
        <div>
          <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>Name</div>
          <input value={v.name} onChange={e => updateVar(i, 'name', e.target.value)}
            style={{ ...inp, width: '100%', padding: '7px 10px' }} />
        </div>
        {[['baseValue', 'Base Value', 'number'], ['uncertainty', 'Uncertainty', 'number'], ['weight', 'Weight', 'number']].map(([key, label]) => (
          <div key={key}>
            <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
            <input type="number" value={v[key]} step={key === 'uncertainty' ? 0.01 : key === 'weight' ? 0.1 : 1}
              onChange={e => updateVar(i, key, e.target.value)}
              style={{ ...inp, width: '100%', padding: '7px 8px' }} />
          </div>
        ))}
        <div>
          <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>Distribution</div>
          <select value={v.distribution} onChange={e => updateVar(i, 'distribution', e.target.value)}
            style={{ ...inp, width: '100%', padding: '7px 8px' }}>
            {Object.entries(DIST_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <DistCurve variable={v} preview={distPreview?.[v.name]} />
          <button onClick={() => setExpanded(!expanded)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: 3, alignSelf: 'flex-end' }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
        <button onClick={() => removeVar(i)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: 3, alignSelf: 'flex-end' }}>
          <Trash2 size={12} />
        </button>
      </div>

      {/* Slider */}
      <div style={{ marginTop: 10 }}>
        <input type="range"
          min={Math.max(0.01, v.baseValue * 0.2)} max={v.baseValue * 2}
          step={(v.baseValue * 0.01) || 1} value={v.baseValue}
          onChange={e => updateVar(i, 'baseValue', e.target.value)}
          style={{ width: '100%', accentColor: distColor }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4b5563', marginTop: 1 }}>
          <span>{(v.baseValue * 0.2).toFixed(0)}</span>
          <span style={{ color: distColor, fontWeight: 700 }}>{v.baseValue}</span>
          <span>{(v.baseValue * 2).toFixed(0)}</span>
        </div>
      </div>

      {/* Expanded distribution params */}
      {expanded && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 4, width: '100%' }}>
            {DIST_META[v.distribution]?.desc}
          </div>
          {['uniform', 'triangular'].includes(v.distribution) && (
            <>
              {[['min', 'Min Value', v.baseValue * 0.5], ['max', 'Max Value', v.baseValue * 1.5]].map(([key, label, def]) => (
                <div key={key}>
                  <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 3 }}>{label}</div>
                  <input type="number" value={v[key] ?? def} onChange={e => updateVar(i, key, e.target.value)}
                    style={{ ...inp, width: 90, padding: '5px 8px' }} />
                </div>
              ))}
            </>
          )}
          {v.distribution === 'lognormal' && (
            <div>
              <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 3 }}>Log-space σ (shape)</div>
              <input type="number" value={v.sigma ?? 0.3} step={0.05} onChange={e => updateVar(i, 'sigma', e.target.value)}
                style={{ ...inp, width: 90, padding: '5px 8px' }} />
            </div>
          )}
          {v.distribution === 'normal' && (
            <div style={{ color: '#6b7280', fontSize: 12 }}>
              σ = base × uncertainty = {(parseFloat(v.baseValue || 0) * parseFloat(v.uncertainty || 0)).toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════
export default function ScenarioModeling() {
  const { selectedDataset, datasets } = useData();
  const [scenarios, setScenarios]       = useState([]);
  const [activeScenario, setActiveScenario] = useState(null);
  const [variables, setVariables]       = useState([]);
  const [simResult, setSimResult]       = useState(null);
  const [mcResult, setMcResult]         = useState(null);
  const [simulating, setSimulating]     = useState(false);
  const [runningMC, setRunningMC]       = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [iterations, setIterations]     = useState(10000);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [shared, setShared]             = useState(false);
  const [datasetId, setDatasetId]       = useState(selectedDataset?.id || null);
  const [baselineValue, setBaselineValue] = useState('');
  const [activeTab, setActiveTab]       = useState('histogram');
  const [showNarrative, setShowNarrative] = useState(true);
  const [distPreviews, setDistPreviews] = useState({});

  const load = async () => {
    try { setScenarios((await api.get('/scenarios')).data); } catch {}
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedDataset) setDatasetId(selectedDataset.id); }, [selectedDataset]);

  const addVariable = () => setVariables(v => [...v, {
    name: `Variable ${v.length + 1}`,
    baseValue: 100,
    uncertainty: 0.1,
    weight: 1,
    distribution: 'normal',
    min: 80, max: 120, sigma: 0.3,
  }]);

  const removeVar  = (i) => setVariables(v => v.filter((_, j) => j !== i));
  const updateVar  = (i, key, val) => setVariables(v => {
    const next = [...v];
    next[i] = { ...next[i], [key]: key === 'name' || key === 'distribution' ? val : parseFloat(val) || 0 };
    return next;
  });

  const runSimulation = async () => {
    if (!variables.length) return toast.error('Add at least one variable');
    setSimulating(true);
    try {
      if (activeScenario) {
        const overrides = Object.fromEntries(variables.map(v => [v.name, v.baseValue]));
        const res = await api.post(`/scenarios/${activeScenario.id}/simulate`, { overrides });
        setSimResult(res.data);
      } else {
        const sensitivity = variables.map(v => ({
          name: v.name, baseValue: v.baseValue, simValue: v.baseValue,
          impactPct: 0, weight: v.weight || 1,
        }));
        setSimResult({ variables, sensitivity, compositeImpact: 0, simulatedAt: new Date().toISOString() });
      }
    } catch { toast.error('Simulation failed'); }
    finally { setSimulating(false); }
  };

  const runMonteCarlo = async () => {
    if (!variables.length) return toast.error('Add at least one variable');
    setRunningMC(true);
    setMcResult(null);
    try {
      const res = await api.post('/scenarios/monte-carlo', {
        variables,
        iterations,
        scenario_id: activeScenario?.id,
        dataset_id: datasetId,
        scenario_name: activeScenario?.name || scenarioName || 'Ad-hoc',
        baseline_value: parseFloat(baselineValue) || 0,
      });
      setMcResult(res.data);
      if (res.data.dist_previews) setDistPreviews(res.data.dist_previews);
      setActiveTab('histogram');
      toast.success(`✓ ${iterations.toLocaleString()} iterations · ${Object.keys(res.data.all_scores || {}).length === 0 ? (res.data.tornado?.length || 0) : ''} variables analysed`);
    } catch (e) { toast.error(e.response?.data?.error || 'Monte Carlo failed'); }
    finally { setRunningMC(false); }
  };

  const saveScenario = async () => {
    if (!scenarioName.trim()) return toast.error('Enter a name');
    try {
      const res = await api.post('/scenarios', { name: scenarioName, variables, dataset_id: datasetId, shared });
      setActiveScenario(res.data);
      setShowSaveForm(false);
      setScenarioName('');
      load();
      toast.success('Scenario saved');
    } catch { toast.error('Failed to save'); }
  };

  const loadScenario = (s) => {
    setActiveScenario(s);
    setVariables(s.variables || []);
    setSimResult(s.last_result || null);
    setMcResult(null);
    setDistPreviews({});
  };

  const submitApproval = async () => {
    if (!activeScenario) return;
    try {
      await api.post(`/scenarios/${activeScenario.id}/submit-approval`);
      toast.success('Submitted for approval');
      load();
    } catch { toast.error('Failed to submit'); }
  };

  const compositeColor = simResult?.compositeImpact > 0 ? '#10b981' : simResult?.compositeImpact < 0 ? '#ef4444' : '#6b7280';
  const p10 = parseFloat(mcResult?.percentiles?.['10'] || 0);
  const p90 = parseFloat(mcResult?.percentiles?.['90'] || 0);
  const p5  = parseFloat(mcResult?.percentiles?.['5']  || 0);
  const p95 = parseFloat(mcResult?.percentiles?.['95'] || 0);

  const tabs = [
    { id: 'histogram', label: 'Histogram' },
    { id: 'tornado',   label: 'Tornado Plot', disabled: !mcResult?.tornado?.length },
    { id: 'bands',     label: 'Confidence Bands', disabled: !mcResult },
    { id: 'governance',label: 'Governance', disabled: !mcResult?.governance },
  ];

  const StatusBadge = ({ status = 'draft' }) => {
    const m = STATUS_META[status] || STATUS_META.draft;
    const Icon = m.icon;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${m.color}18`, color: m.color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
        <Icon size={10} /> {m.label}
      </span>
    );
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sliders size={23} color="#8b5cf6" /> Scenario & Simulation Modeling
        </h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: 13 }}>
          What-if analysis with Monte Carlo simulation · Normal / Uniform / Triangular / Log-Normal distributions · Tornado sensitivity · AI narrative · Governance lineage
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 18 }}>
        {/* ── Left sidebar ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Saved Scenarios */}
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Saved Scenarios</span>
              <button onClick={() => { setActiveScenario(null); setVariables([]); setSimResult(null); setMcResult(null); setDistPreviews({}); }}
                style={{ padding: '3px 9px', background: 'rgba(99,102,241,0.18)', border: 'none', borderRadius: 6, color: '#a5b4fc', cursor: 'pointer', fontSize: 11 }}>New</button>
            </div>
            {scenarios.length === 0
              ? <p style={{ color: '#4b5563', fontSize: 12 }}>No saved scenarios yet</p>
              : scenarios.map(s => (
                  <button key={s.id} onClick={() => loadScenario(s)}
                    style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: activeScenario?.id === s.id ? 'rgba(99,102,241,0.18)' : 'none', border: 'none', borderRadius: 8, cursor: 'pointer', marginBottom: 2 }}>
                    <div style={{ color: activeScenario?.id === s.id ? '#a5b4fc' : '#d1d5db', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {s.shared && <Users size={10} color="#6366f1" />}
                      {s.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ color: '#4b5563', fontSize: 11 }}>{(s.variables || []).length} vars · {s.dataset_name || '—'}</span>
                      {s.status && s.status !== 'draft' && <StatusBadge status={s.status} />}
                    </div>
                  </button>
                ))
            }
          </div>

          {/* MC Settings */}
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 }}>
            <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>Simulation Settings</div>

            <label style={{ color: '#6b7280', fontSize: 12, display: 'block', marginBottom: 3 }}>Dataset (for governance)</label>
            <select value={datasetId || ''} onChange={e => setDatasetId(e.target.value || null)}
              style={{ width: '100%', padding: '7px 10px', ...inp, marginBottom: 10, fontSize: 12 }}>
              <option value="">None</option>
              {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            <label style={{ color: '#6b7280', fontSize: 12, display: 'block', marginBottom: 3 }}>Iterations</label>
            <select value={iterations} onChange={e => setIterations(parseInt(e.target.value))}
              style={{ width: '100%', padding: '7px 10px', ...inp, marginBottom: 10, fontSize: 12 }}>
              {[1000, 5000, 10000, 25000, 50000, 100000].map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
            </select>

            <label style={{ color: '#6b7280', fontSize: 12, display: 'block', marginBottom: 3 }}>
              Baseline (optional) <span style={{ color: '#4b5563' }}>— for % above baseline</span>
            </label>
            <input type="number" value={baselineValue} onChange={e => setBaselineValue(e.target.value)} placeholder="e.g. current revenue"
              style={{ width: '100%', padding: '7px 10px', ...inp, marginBottom: 12, fontSize: 12 }} />

            <button onClick={runMonteCarlo} disabled={runningMC || !variables.length}
              style={{ width: '100%', padding: 10, background: runningMC ? 'rgba(139,92,246,0.3)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: 8, color: '#fff', cursor: variables.length ? 'pointer' : 'not-allowed', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: !variables.length ? 0.5 : 1, fontSize: 13 }}>
              {runningMC ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Running…</> : <><BarChart3 size={13} /> Run Monte Carlo</>}
            </button>
          </div>

          {/* Collaboration */}
          {activeScenario && (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 }}>
              <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={11} /> Collaboration
              </div>
              <div style={{ marginBottom: 10 }}>
                <span style={{ color: '#6b7280', fontSize: 12, marginRight: 8 }}>Status:</span>
                <StatusBadge status={activeScenario.status || 'draft'} />
              </div>
              {(!activeScenario.status || activeScenario.status === 'draft') && (
                <button onClick={submitApproval}
                  style={{ width: '100%', padding: '8px 0', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, color: '#fbbf24', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Submit for Approval
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Main panel ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Variables panel */}
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, margin: 0 }}>
                Variables{activeScenario && <span style={{ color: '#818cf8', fontWeight: 400, fontSize: 13 }}> — {activeScenario.name}</span>}
              </h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowSaveForm(!showSaveForm)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'rgba(16,185,129,0.12)', border: 'none', borderRadius: 8, color: '#34d399', cursor: 'pointer', fontSize: 12 }}>
                  <Save size={11} /> Save Scenario
                </button>
                <button onClick={addVariable}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'rgba(99,102,241,0.18)', border: 'none', borderRadius: 8, color: '#a5b4fc', cursor: 'pointer', fontSize: 12 }}>
                  <Plus size={11} /> Add Variable
                </button>
              </div>
            </div>

            {showSaveForm && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={scenarioName} onChange={e => setScenarioName(e.target.value)} placeholder="Scenario name…"
                  style={{ flex: 1, padding: '8px 12px', ...inp, minWidth: 180 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9ca3af', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />
                  <Users size={12} /> Share with team
                </label>
                <button onClick={saveScenario}
                  style={{ padding: '8px 16px', background: '#10b981', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Save</button>
              </div>
            )}

            {variables.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#4b5563' }}>
                <Sliders size={32} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                <p style={{ fontSize: 14 }}>No variables yet. Add variables to model your scenario.</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                  {Object.entries(DIST_META).map(([k, m]) => (
                    <span key={k} style={{ padding: '4px 10px', background: `${m.color}15`, border: `1px solid ${m.color}30`, borderRadius: 8, color: m.color, fontSize: 12, fontWeight: 600 }}>
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {variables.map((v, i) => (
                  <VariableRow key={i} v={v} i={i} updateVar={updateVar} removeVar={removeVar} distPreview={distPreviews} />
                ))}
              </div>
            )}

            {variables.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={runSimulation} disabled={simulating}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', background: simulating ? 'rgba(99,102,241,0.3)' : '#6366f1', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  {simulating ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Simulating…</> : <><Play size={14} /> Run What-If</>}
                </button>
              </div>
            )}
          </div>

          {/* Quick Simulation Results */}
          {simResult && simResult.sensitivity?.length > 0 && (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
              <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                <TrendingUp size={13} color="#10b981" /> What-If Results
                {simResult.governance && (
                  <span style={{ color: '#4b5563', fontWeight: 400, fontSize: 11 }}>· {simResult.governance.run_at_display}</span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 20 }}>
                <div>
                  {simResult.sensitivity.map((s, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#d1d5db', fontSize: 13 }}>{s.name}</span>
                        <span style={{ color: SCORE_COLOR(s.impactPct), fontWeight: 700, fontSize: 13 }}>
                          {s.impactPct > 0 ? '+' : ''}{s.impactPct?.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.abs(s.impactPct || 0))}%`, height: '100%', background: SCORE_COLOR(s.impactPct), borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ background: `${compositeColor}12`, border: `1px solid ${compositeColor}25`, borderRadius: 10, padding: 14, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>Composite Impact</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: compositeColor }}>
                    {simResult.compositeImpact > 0 ? '+' : ''}{simResult.compositeImpact?.toFixed(1)}%
                  </div>
                  <div style={{ color: '#4b5563', fontSize: 11, marginTop: 4 }}>Weighted average</div>
                </div>
              </div>
            </div>
          )}

          {/* Monte Carlo full results */}
          {mcResult && (
            <div style={{ background: '#13131f', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12, padding: 18 }}>
              {/* KPI strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  ['Mean', mcResult.mean?.toFixed(2), '#a5b4fc'],
                  ['Std Dev', mcResult.std?.toFixed(2), '#6b7280'],
                  ['P10', p10.toFixed(2), '#f87171'],
                  ['P90', p90.toFixed(2), '#34d399'],
                  mcResult.prob_above_baseline != null
                    ? ['P(above baseline)', `${(mcResult.prob_above_baseline * 100).toFixed(1)}%`, '#fbbf24']
                    : ['90% CI width', (p90 - p10).toFixed(2), '#818cf8'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                    <div style={{ color, fontSize: 18, fontWeight: 800 }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* AI Narrative */}
              {mcResult.narrative && (
                <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <button onClick={() => setShowNarrative(!showNarrative)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#a5b4fc', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: showNarrative ? 8 : 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={12} /> AI Narrative — simulation summary</span>
                    {showNarrative ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showNarrative && <div style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.8 }}>{mcResult.narrative}</div>}
                </div>
              )}

              {/* Tab bar */}
              <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                {tabs.map(t => (
                  <button key={t.id} onClick={() => !t.disabled && setActiveTab(t.id)} disabled={t.disabled}
                    style={{ flex: 1, padding: '7px 6px', border: 'none', borderRadius: 6, cursor: t.disabled ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12, opacity: t.disabled ? 0.35 : 1, background: activeTab === t.id ? 'rgba(99,102,241,0.22)' : 'transparent', color: activeTab === t.id ? '#a5b4fc' : '#6b7280' }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab: Histogram */}
              {activeTab === 'histogram' && (
                <div>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BarChart3 size={12} /> Frequency Distribution — {mcResult.iterations?.toLocaleString()} iterations
                  </div>
                  <HistogramChart histogram={mcResult.histogram} percentiles={mcResult.percentiles} mean={mcResult.mean} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
                    {[['P1', '1%', '#ef4444'], ['P5', '5%', '#f97316'], ['P25', '25%', '#818cf8'], ['P75', '75%', '#34d399'], ['P95', '95%', '#f97316'], ['P99', '99%', '#ef4444']].map(([key, label, color]) => (
                      <div key={key} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 7, padding: '7px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: 11 }}>{label} percentile</span>
                        <span style={{ color, fontWeight: 700, fontSize: 13 }}>{parseFloat(mcResult.percentiles?.[key.slice(1)] || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: Tornado */}
              {activeTab === 'tornado' && (
                <div>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Info size={12} /> Sensitivity Analysis — variables ranked by impact on composite outcome
                  </div>
                  <TornadoChart tornado={mcResult.tornado} baseline={mcResult.mean} />
                </div>
              )}

              {/* Tab: Confidence Bands */}
              {activeTab === 'bands' && (
                <div>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TrendingUp size={12} /> Confidence Interval Summary
                  </div>
                  {[
                    { label: '98% Confidence Band', lo: mcResult.percentiles?.['1'], hi: mcResult.percentiles?.['99'], color: '#ef4444' },
                    { label: '90% Confidence Band', lo: p5, hi: p95, color: '#f97316' },
                    { label: '80% Confidence Band', lo: p10, hi: p90, color: '#fbbf24' },
                    { label: '50% Confidence Band (IQR)', lo: mcResult.percentiles?.['25'], hi: mcResult.percentiles?.['75'], color: '#10b981' },
                  ].map(({ label, lo, hi, color }) => {
                    const loV = parseFloat(lo || 0), hiV = parseFloat(hi || 0);
                    return (
                      <div key={label} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ color: '#9ca3af', fontSize: 13 }}>{label}</span>
                          <span style={{ color, fontSize: 13, fontWeight: 700 }}>{loV.toFixed(2)} – {hiV.toFixed(2)}</span>
                        </div>
                        <div style={{ height: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '10%', right: '10%', background: `${color}20`, borderRadius: 6 }} />
                          <div style={{ position: 'absolute', top: 3, bottom: 3, left: '20%', right: '20%', background: `${color}40`, borderRadius: 4 }} />
                          <div style={{ position: 'absolute', top: 3, bottom: 3, left: '49%', right: '49%', background: color, borderRadius: 2 }} />
                        </div>
                        <div style={{ color: '#4b5563', fontSize: 11, marginTop: 3 }}>Width: {(hiV - loV).toFixed(2)} ({(((hiV - loV) / Math.max(Math.abs(parseFloat(mcResult.mean || 1)), 1)) * 100).toFixed(1)}% of mean)</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tab: Governance */}
              {activeTab === 'governance' && mcResult.governance && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    {[
                      ['Scenario', mcResult.governance.scenario_name],
                      ['Dataset', mcResult.governance.dataset_name],
                      ['Version', `v${mcResult.governance.dataset_version}`],
                      ['Iterations', mcResult.governance.iterations?.toLocaleString()],
                      ['Variables', mcResult.governance.variables_count],
                      ['Distributions', (mcResult.governance.distributions_used || []).join(', ')],
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '9px 11px' }}>
                        <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
                        <div style={{ color: '#e2e8f0', fontSize: 13 }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.14)', borderRadius: 9, padding: '11px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                      <GitBranch size={13} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <div style={{ color: '#6ee7b7', fontWeight: 700, fontSize: 12, marginBottom: 3 }}>Lineage Event Recorded</div>
                        <div style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.7 }}>
                          Scenario <strong style={{ color: '#d1d5db' }}>"{mcResult.governance.scenario_name}"</strong> applied to{' '}
                          <strong style={{ color: '#d1d5db' }}>{mcResult.governance.dataset_name} {mcResult.governance.dataset_version}</strong>{' '}
                          at <strong style={{ color: '#d1d5db' }}>{mcResult.governance.run_at_display}</strong>.
                          {' '}{mcResult.governance.iterations?.toLocaleString()} Monte Carlo iterations · mean = <strong style={{ color: '#d1d5db' }}>{mcResult.mean?.toFixed(2)}</strong> · std = {mcResult.std?.toFixed(2)}.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
