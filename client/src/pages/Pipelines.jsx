import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { Plus, Play, Trash2, GitMerge, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Pencil, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';

const STEP_TYPES = [
  { id: 'remove_duplicates', label: 'Remove Duplicates', params: [] },
  { id: 'fill_missing', label: 'Fill Missing Values', params: [{ key: 'strategy', label: 'Strategy', options: ['mean','median','mode','zero','empty_string'] }, { key: 'columns', label: 'Columns (comma-sep)', type: 'text' }] },
  { id: 'drop_missing_rows', label: 'Drop Rows with Missing', params: [{ key: 'columns', label: 'Columns (comma-sep)', type: 'text' }] },
  { id: 'normalize', label: 'Normalize Column', params: [{ key: 'column', label: 'Column Name', type: 'text' }, { key: 'method', label: 'Method', options: ['minmax','zscore'] }] },
  { id: 'trim_strings', label: 'Trim Whitespace', params: [] },
];

const StatusIcon = ({ status }) => {
  if (status === 'success') return <CheckCircle size={14} color="#10b981" />;
  if (status === 'failed') return <XCircle size={14} color="#ef4444" />;
  return <Clock size={14} color="#f59e0b" />;
};

export default function Pipelines() {
  const { datasets } = useData();
  const [pipelines, setPipelines] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [runs, setRuns] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', steps: [], source_config: {}, destination_config: {} });
  const [running, setRunning] = useState({});

  const load = async () => {
    try { setPipelines(await api.get('/pipelines')); } catch {}
  };

  useEffect(() => { load(); }, []);

  const loadRuns = async (id) => {
    try { setRuns(r => ({ ...r, [id]: [] })); const data = await api.get(`/pipelines/${id}/runs`); setRuns(r => ({ ...r, [id]: data })); } catch {}
  };

  const toggle = (id) => { setExpanded(e => e === id ? null : id); if (expanded !== id) loadRuns(id); };

  const addStep = () => setForm(f => ({ ...f, steps: [...f.steps, { operation: 'remove_duplicates', parameters: {} }] }));
  const removeStep = (i) => setForm(f => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }));
  const updateStep = (i, key, val) => setForm(f => { const steps = [...f.steps]; steps[i] = { ...steps[i], [key]: val }; return { ...f, steps }; });
  const updateStepParam = (i, key, val) => setForm(f => { const steps = [...f.steps]; steps[i] = { ...steps[i], parameters: { ...steps[i].parameters, [key]: val } }; return { ...f, steps }; });

  const create = async () => {
    if (!form.name.trim()) return toast.error('Name required');
    try { await api.post('/pipelines', form); toast.success('Pipeline created'); setShowCreate(false); setForm({ name: '', description: '', steps: [], source_config: {}, destination_config: {} }); load(); } catch { toast.error('Failed to create'); }
  };

  const run = async (id) => {
    setRunning(r => ({ ...r, [id]: true }));
    try { const res = await api.post(`/pipelines/${id}/run`); toast.success(`Pipeline completed: ${res.rowsProcessed} rows processed`); loadRuns(id); } catch (err) { toast.error('Pipeline failed'); }
    finally { setRunning(r => ({ ...r, [id]: false })); }
  };

  const del = async (id) => {
    if (!confirm('Delete this pipeline?')) return;
    try { await api.delete(`/pipelines/${id}`); toast.success('Deleted'); load(); } catch {}
  };

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4 }}>Data Pipelines</h1>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Build reusable ETL workflows to clean and transform data</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
          <Plus size={14} /> New Pipeline
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <h3 style={{ color: '#f3f4f6', marginBottom: 16, fontWeight: 600 }}>Create Pipeline</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 13, display: 'block', marginBottom: 6 }}>Pipeline Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Sales Data Cleaner"
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 13, display: 'block', marginBottom: 6 }}>Description</label>
              <input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="What does this pipeline do?"
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 13, display: 'block', marginBottom: 6 }}>Source Dataset</label>
              <select value={form.source_config.dataset_id || ''} onChange={e => setForm(f => ({...f, source_config: {...f.source_config, dataset_id: e.target.value}}))}
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', fontSize: 14 }}>
                <option value="">— Source Dataset —</option>
                {(datasets || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 13, display: 'block', marginBottom: 6 }}>Destination Dataset</label>
              <select value={form.destination_config.dataset_id || ''} onChange={e => setForm(f => ({...f, destination_config: {...f.destination_config, dataset_id: e.target.value}}))}
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', fontSize: 14 }}>
                <option value="">— Destination Dataset —</option>
                {(datasets || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          {/* Steps */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ color: '#9ca3af', fontSize: 13 }}>Transformation Steps</label>
              <button onClick={addStep} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, color: '#a5b4fc', cursor: 'pointer', fontSize: 13 }}><Plus size={12} /> Add Step</button>
            </div>
            {form.steps.map((step, i) => {
              const stepDef = STEP_TYPES.find(s => s.id === step.operation) || STEP_TYPES[0];
              return (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: '#6b7280', fontSize: 13, minWidth: 60 }}>Step {i + 1}</span>
                    <select value={step.operation} onChange={e => updateStep(i, 'operation', e.target.value)}
                      style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#f3f4f6', fontSize: 13, flex: 1 }}>
                      {STEP_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    {stepDef.params.map(p => p.options ? (
                      <select key={p.key} value={step.parameters?.[p.key] || p.options[0]} onChange={e => updateStepParam(i, p.key, e.target.value)}
                        style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#9ca3af', fontSize: 13 }}>
                        {p.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input key={p.key} value={step.parameters?.[p.key] || ''} onChange={e => updateStepParam(i, p.key, e.target.value)} placeholder={p.label}
                        style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#f3f4f6', fontSize: 13, width: 140 }} />
                    ))}
                    <button onClick={() => removeStep(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563' }}><X size={14} /></button>
                  </div>
                </div>
              );
            })}
            {form.steps.length === 0 && <div style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: 20 }}>No steps added. Click "Add Step" to build your pipeline.</div>}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(false)} style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
            <button onClick={create} style={{ padding: '10px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Create Pipeline</button>
          </div>
        </div>
      )}

      {/* Pipeline List */}
      {pipelines.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
          <GitMerge size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p>No pipelines yet. Create one to automate your data workflows.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pipelines.map(p => (
            <div key={p.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <GitMerge size={18} color="#6366f1" />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 15 }}>{p.name}</div>
                  {p.description && <div style={{ color: '#6b7280', fontSize: 13 }}>{p.description}</div>}
                  <div style={{ color: '#4b5563', fontSize: 12, marginTop: 2 }}>
                    {(p.steps || []).length} steps · {p.last_run_at ? `Last run ${new Date(p.last_run_at).toLocaleString()}` : 'Never run'} · by {p.creator_name}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => run(p.id)} disabled={running[p.id]}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 14px', background: running[p.id] ? 'rgba(99,102,241,0.2)' : '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                    <Play size={12} /> {running[p.id] ? 'Running...' : 'Run'}
                  </button>
                  <button onClick={() => toggle(p.id)} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#9ca3af' }}>
                    {expanded === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button onClick={() => del(p.id)} style={{ padding: '8px 10px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#f87171' }}><Trash2 size={14} /></button>
                </div>
              </div>
              {expanded === p.id && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div>
                      <div style={{ color: '#9ca3af', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Steps ({(p.steps || []).length})</div>
                      {(p.steps || []).map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 4 }}>
                          <span style={{ color: '#4b5563', fontSize: 12 }}>{i + 1}.</span>
                          <span style={{ color: '#d1d5db', fontSize: 13 }}>{STEP_TYPES.find(t => t.id === s.operation)?.label || s.operation}</span>
                          {Object.keys(s.parameters || {}).length > 0 && <span style={{ color: '#6b7280', fontSize: 11 }}>({JSON.stringify(s.parameters)})</span>}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ color: '#9ca3af', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Recent Runs</div>
                      {(runs[p.id] || []).slice(0, 5).map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 4 }}>
                          <StatusIcon status={r.status} />
                          <span style={{ color: '#d1d5db', fontSize: 13, flex: 1 }}>{r.rows_processed} rows</span>
                          <span style={{ color: '#4b5563', fontSize: 12 }}>{new Date(r.started_at).toLocaleString()}</span>
                        </div>
                      ))}
                      {(!runs[p.id] || runs[p.id].length === 0) && <div style={{ color: '#4b5563', fontSize: 13 }}>No runs yet</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
