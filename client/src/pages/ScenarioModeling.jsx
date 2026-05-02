import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { Plus, Play, Save, Trash2, BarChart3, TrendingUp, TrendingDown, Sliders, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

const DISTRIBUTIONS = ['normal', 'uniform', 'triangular'];

const GaugeBar = ({ value, min, max, label, color = '#6366f1' }) => {
  const pct = max === min ? 50 : ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: '#9ca3af', fontSize: 12 }}>{label}</span>
        <span style={{ color: '#f3f4f6', fontSize: 12, fontWeight: 600 }}>{typeof value === 'number' ? value.toFixed(2) : value}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
};

const MonteCarloChart = ({ histogram, percentiles, mean }) => {
  if (!histogram?.counts?.length) return null;
  const maxCount = Math.max(...histogram.counts);
  const edges = histogram.edges;
  const p5 = percentiles?.['5'];
  const p95 = percentiles?.['95'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100, padding: '0 4px' }}>
        {histogram.counts.map((count, i) => {
          const edgeVal = edges[i];
          const isLow = edgeVal < p5;
          const isHigh = edgeVal > p95;
          const color = isLow || isHigh ? 'rgba(239,68,68,0.6)' : 'rgba(99,102,241,0.7)';
          return (
            <div key={i} title={`${edges[i]?.toFixed(1)}–${edges[i+1]?.toFixed(1)}: ${count}`}
              style={{ flex: 1, background: color, borderRadius: '2px 2px 0 0', height: `${(count / maxCount) * 100}%`, minHeight: count > 0 ? 2 : 0, transition: 'height 0.3s' }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ color: '#4b5563', fontSize: 11 }}>{edges[0]?.toFixed(1)}</span>
        <span style={{ color: '#6366f1', fontSize: 11 }}>Mean: {mean?.toFixed(2)}</span>
        <span style={{ color: '#4b5563', fontSize: 11 }}>{edges[edges.length - 1]?.toFixed(1)}</span>
      </div>
    </div>
  );
};

export default function ScenarioModeling() {
  const { selectedDataset, datasets } = useData();
  const [scenarios, setScenarios] = useState([]);
  const [activeScenario, setActiveScenario] = useState(null);
  const [variables, setVariables] = useState([]);
  const [simResult, setSimResult] = useState(null);
  const [mcResult, setMcResult] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [runningMC, setRunningMC] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [iterations, setIterations] = useState(5000);
  const [showSaveForm, setShowSaveForm] = useState(false);

  const load = async () => {
    try { setScenarios((await api.get('/scenarios')).data); } catch {}
  };
  useEffect(() => { load(); }, []);

  const addVariable = () => setVariables(v => [...v, { name: `Variable ${v.length + 1}`, baseValue: 100, uncertainty: 0.1, weight: 1, distribution: 'normal', min: 80, max: 120 }]);
  const removeVar = (i) => setVariables(v => v.filter((_, j) => j !== i));
  const updateVar = (i, key, val) => setVariables(v => { const next = [...v]; next[i] = { ...next[i], [key]: key === 'name' || key === 'distribution' ? val : parseFloat(val) || 0 }; return next; });

  const runSimulation = async () => {
    if (!variables.length) return toast.error('Add at least one variable');
    setSimulating(true);
    try {
      // Server-side quick simulation
      const overrides = Object.fromEntries(variables.map(v => [v.name, v.baseValue]));
      if (activeScenario) {
        const res = await api.post(`/scenarios/${activeScenario.id}/simulate`, { overrides });
        setSimResult(res);
      } else {
        // Quick local sim
        const sensitivity = variables.map(v => ({
          name: v.name,
          baseValue: v.baseValue,
          simValue: v.baseValue,
          impactPct: 0,
          weight: v.weight,
        }));
        setSimResult({ variables, sensitivity, compositeImpact: 0, simulatedAt: new Date().toISOString() });
      }
    } catch { toast.error('Simulation failed'); }
    finally { setSimulating(false); }
  };

  const runMonteCarlo = async () => {
    if (!variables.length) return toast.error('Add at least one variable');
    setRunningMC(true);
    try {
      const res = await api.post('/scenarios/monte-carlo', { variables, iterations });
      setMcResult(res);
      toast.success(`Monte Carlo complete: ${iterations.toLocaleString()} iterations`);
    } catch { toast.error('Monte Carlo failed'); }
    finally { setRunningMC(false); }
  };

  const saveScenario = async () => {
    if (!scenarioName.trim()) return toast.error('Enter a name');
    try {
      const res = await api.post('/scenarios', { name: scenarioName, variables, dataset_id: selectedDataset?.id });
      setActiveScenario(res);
      setShowSaveForm(false);
      setScenarioName('');
      load();
      toast.success('Scenario saved');
    } catch { toast.error('Failed to save'); }
  };

  const loadScenario = (s) => {
    setActiveScenario(s);
    setVariables(s.variables || []);
    setSimResult(s.last_result);
    setMcResult(null);
  };

  const compositeColor = simResult?.compositeImpact > 0 ? '#10b981' : simResult?.compositeImpact < 0 ? '#ef4444' : '#6b7280';

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sliders size={22} color="#8b5cf6" /> Scenario & Simulation Modeling
        </h1>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>What-if analysis with interactive variable sliders and Monte Carlo simulation</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* Saved Scenarios */}
        <div>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Saved Scenarios</span>
              <button onClick={() => { setActiveScenario(null); setVariables([]); setSimResult(null); setMcResult(null); }}
                style={{ padding: '4px 10px', background: 'rgba(99,102,241,0.2)', border: 'none', borderRadius: 6, color: '#a5b4fc', cursor: 'pointer', fontSize: 12 }}>New</button>
            </div>
            {scenarios.length === 0 ? <p style={{ color: '#4b5563', fontSize: 13 }}>No saved scenarios yet</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {scenarios.map(s => (
                  <button key={s.id} onClick={() => loadScenario(s)}
                    style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: activeScenario?.id === s.id ? 'rgba(99,102,241,0.2)' : 'none', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                    onMouseEnter={e => { if (activeScenario?.id !== s.id) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { if (activeScenario?.id !== s.id) e.currentTarget.style.background = 'none'; }}>
                    <div style={{ color: activeScenario?.id === s.id ? '#a5b4fc' : '#d1d5db', fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ color: '#4b5563', fontSize: 11 }}>{(s.variables || []).length} variables · {s.dataset_name || '—'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* MC Settings */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
            <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Monte Carlo Settings</div>
            <label style={{ color: '#6b7280', fontSize: 12, display: 'block', marginBottom: 4 }}>Iterations</label>
            <select value={iterations} onChange={e => setIterations(parseInt(e.target.value))}
              style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, marginBottom: 12 }}>
              {[1000, 5000, 10000, 25000, 50000].map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
            </select>
            <button onClick={runMonteCarlo} disabled={runningMC || !variables.length}
              style={{ width: '100%', padding: '10px', background: runningMC ? 'rgba(139,92,246,0.3)' : '#8b5cf6', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: !variables.length ? 0.5 : 1 }}>
              {runningMC ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Running...</> : <><BarChart3 size={13} /> Run Monte Carlo</>}
            </button>
          </div>
        </div>

        {/* Main Builder */}
        <div>
          {/* Variables */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 15 }}>Variables {activeScenario && <span style={{ color: '#6366f1', fontSize: 13 }}>— {activeScenario.name}</span>}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowSaveForm(!showSaveForm)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', background: 'rgba(16,185,129,0.15)', border: 'none', borderRadius: 8, color: '#34d399', cursor: 'pointer', fontSize: 13 }}><Save size={12} /> Save</button>
                <button onClick={addVariable} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', background: 'rgba(99,102,241,0.2)', border: 'none', borderRadius: 8, color: '#a5b4fc', cursor: 'pointer', fontSize: 13 }}><Plus size={12} /> Add Variable</button>
              </div>
            </div>

            {showSaveForm && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input value={scenarioName} onChange={e => setScenarioName(e.target.value)} placeholder="Scenario name..."
                  style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }} />
                <button onClick={saveScenario} style={{ padding: '8px 16px', background: '#10b981', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Save</button>
              </div>
            )}

            {variables.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#4b5563' }}>
                <Sliders size={32} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                <p style={{ fontSize: 14 }}>No variables yet. Add variables to model your scenario.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {variables.map((v, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto auto', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                      <input value={v.name} onChange={e => updateVar(i, 'name', e.target.value)}
                        style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }} />
                      {[['baseValue', 'Base'], ['uncertainty', 'Uncertainty (0-1)'], ['weight', 'Weight']].map(([key, label]) => (
                        <div key={key}>
                          <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 2 }}>{label}</div>
                          <input type="number" value={v[key]} onChange={e => updateVar(i, key, e.target.value)} step={key === 'uncertainty' ? 0.01 : 1}
                            style={{ width: 80, padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 13 }} />
                        </div>
                      ))}
                      <div>
                        <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 2 }}>Distribution</div>
                        <select value={v.distribution} onChange={e => updateVar(i, 'distribution', e.target.value)}
                          style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', fontSize: 12 }}>
                          {DISTRIBUTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <button onClick={() => removeVar(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: 4, marginTop: 14 }}><Trash2 size={13} /></button>
                    </div>
                    {/* Slider */}
                    <div>
                      <input type="range" min={v.baseValue * 0.5} max={v.baseValue * 1.5} step={(v.baseValue * 0.01) || 1} value={v.baseValue}
                        onChange={e => updateVar(i, 'baseValue', e.target.value)}
                        style={{ width: '100%', accentColor: '#6366f1' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {variables.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={runSimulation} disabled={simulating}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: simulating ? 'rgba(99,102,241,0.4)' : '#6366f1', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  {simulating ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Simulating...</> : <><Play size={14} /> Run Simulation</>}
                </button>
              </div>
            )}
          </div>

          {/* Results */}
          {simResult && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Simulation Results</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>Variable Impact</div>
                  {(simResult.sensitivity || []).map((s, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ color: '#d1d5db', fontSize: 13 }}>{s.name}</span>
                        <span style={{ color: s.impactPct > 0 ? '#10b981' : s.impactPct < 0 ? '#ef4444' : '#6b7280', fontWeight: 600, fontSize: 13 }}>
                          {s.impactPct > 0 ? '+' : ''}{s.impactPct?.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.abs(s.impactPct || 0))}%`, height: '100%', background: s.impactPct >= 0 ? '#10b981' : '#ef4444', borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ background: `${compositeColor}15`, border: `1px solid ${compositeColor}30`, borderRadius: 10, padding: 16, textAlign: 'center' }}>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>Composite Impact</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: compositeColor }}>
                      {simResult.compositeImpact > 0 ? '+' : ''}{simResult.compositeImpact?.toFixed(1)}%
                    </div>
                    <div style={{ color: '#4b5563', fontSize: 12 }}>Weighted average change</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Monte Carlo Results */}
          {mcResult && (
            <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 14, padding: 20 }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Monte Carlo Results — {iterations.toLocaleString()} iterations</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
                <div>
                  {[['Mean', mcResult.mean?.toFixed(4)], ['Std Dev', mcResult.std?.toFixed(4)], ['Min', mcResult.min?.toFixed(4)], ['Max', mcResult.max?.toFixed(4)]].map(([label, val]) => (
                    <GaugeBar key={label} label={label} value={parseFloat(val)} min={mcResult.min} max={mcResult.max} color="#8b5cf6" />
                  ))}
                </div>
                <div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>Percentile Distribution</div>
                  {Object.entries(mcResult.percentiles || {}).map(([p, val]) => (
                    <div key={p} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color: '#6b7280', fontSize: 12 }}>P{p}</span>
                      <span style={{ color: '#d1d5db', fontSize: 12, fontWeight: 500 }}>{val?.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>Frequency Distribution</div>
                <MonteCarloChart histogram={mcResult.histogram} percentiles={mcResult.percentiles} mean={mcResult.mean} />
                <div style={{ color: '#4b5563', fontSize: 11, textAlign: 'center', marginTop: 6 }}>Red tails = 5th/95th percentile risk zones</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
