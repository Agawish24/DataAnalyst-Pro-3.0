import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { Plus, ChefHat, Play, Trash2, Globe, Lock, Star, X, Save } from 'lucide-react';
import toast from 'react-hot-toast';

const STEP_TYPES = [
  { id: 'remove_duplicates', label: 'Remove Duplicates', params: [] },
  { id: 'fill_missing', label: 'Fill Missing Values', params: ['strategy', 'columns'] },
  { id: 'drop_missing_rows', label: 'Drop Rows with Missing', params: ['columns'] },
  { id: 'normalize', label: 'Normalize Column', params: ['column', 'method'] },
  { id: 'trim_strings', label: 'Trim Whitespace', params: [] },
];

export default function Recipes() {
  const { selectedDataset, datasets } = useData();
  const [recipes, setRecipes] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [applying, setApplying] = useState({});
  const [form, setForm] = useState({ name: '', description: '', steps: [], tags: [], is_public: false });
  const [applyTarget, setApplyTarget] = useState('');

  const load = async () => {
    try { setRecipes((await api.get('/recipes')).data); } catch {}
  };

  useEffect(() => { load(); }, []);

  const addStep = () => setForm(f => ({ ...f, steps: [...f.steps, { operation: 'remove_duplicates', parameters: {} }] }));
  const removeStep = (i) => setForm(f => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }));
  const updateStep = (i, op) => setForm(f => { const steps = [...f.steps]; steps[i] = { operation: op, parameters: {} }; return { ...f, steps }; });
  const updateParam = (i, key, val) => setForm(f => { const steps = [...f.steps]; steps[i] = { ...steps[i], parameters: { ...steps[i].parameters, [key]: val } }; return { ...f, steps }; });

  const create = async () => {
    if (!form.name.trim()) return toast.error('Name required');
    try { await api.post('/recipes', form); toast.success('Recipe saved'); setShowCreate(false); setForm({ name: '', description: '', steps: [], tags: [], is_public: false }); load(); }
    catch { toast.error('Failed to save'); }
  };

  const apply = async (id) => {
    const target = applyTarget || selectedDataset?.id;
    if (!target) return toast.error('Select a dataset to apply to');
    setApplying(a => ({ ...a, [id]: true }));
    try {
      const res = await api.post(`/recipes/${id}/apply/${target}`);
      toast.success(`Recipe applied: ${res.data.before} → ${res.data.after} rows`);
    } catch { toast.error('Failed to apply recipe'); }
    finally { setApplying(a => ({ ...a, [id]: false })); }
  };

  const del = async (id) => {
    if (!confirm('Delete this recipe?')) return;
    try { await api.delete(`/recipes/${id}`); toast.success('Deleted'); load(); } catch {}
  };

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4 }}>Transformation Recipes</h1>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Saved preprocessing templates you can apply across any dataset</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
          <Plus size={14} /> New Recipe
        </button>
      </div>

      {/* Apply target selector */}
      {datasets?.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#9ca3af', fontSize: 13 }}>Apply recipes to:</span>
          <select value={applyTarget || selectedDataset?.id || ''} onChange={e => setApplyTarget(e.target.value)}
            style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
            {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <h3 style={{ color: '#f3f4f6', marginBottom: 16, fontWeight: 600 }}>New Recipe</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 13, display: 'block', marginBottom: 6 }}>Recipe Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Standard Data Cleanup"
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 13, display: 'block', marginBottom: 6 }}>Tags (comma-sep)</label>
              <input value={(form.tags || []).join(', ')} onChange={e => setForm(f => ({...f, tags: e.target.value.split(',').map(t=>t.trim()).filter(Boolean)}))} placeholder="sales, preprocessing, cleaning"
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: '#9ca3af', fontSize: 13, display: 'block', marginBottom: 6 }}>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="What does this recipe do?"
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ color: '#9ca3af', fontSize: 13 }}>Steps</label>
              <button onClick={addStep} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'rgba(99,102,241,0.2)', border: 'none', borderRadius: 6, color: '#a5b4fc', cursor: 'pointer', fontSize: 13 }}><Plus size={12} /> Add</button>
            </div>
            {form.steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ color: '#4b5563', fontSize: 12, width: 50 }}>Step {i+1}</span>
                <select value={step.operation} onChange={e => updateStep(i, e.target.value)}
                  style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#f3f4f6', fontSize: 13, flex: 1 }}>
                  {STEP_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {(STEP_TYPES.find(t => t.id === step.operation)?.params || []).map(p => (
                  <input key={p} value={step.parameters?.[p] || ''} onChange={e => updateParam(i, p, e.target.value)} placeholder={p}
                    style={{ width: 120, padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#f3f4f6', fontSize: 12 }} />
                ))}
                <button onClick={() => removeStep(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: 4 }}><X size={13} /></button>
              </div>
            ))}
            {form.steps.length === 0 && <div style={{ color: '#4b5563', fontSize: 13, padding: '12px 0' }}>No steps — click Add</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#9ca3af', fontSize: 14 }}>
              <input type="checkbox" checked={form.is_public} onChange={e => setForm(f => ({...f, is_public: e.target.checked}))} />
              Make public (visible to all users)
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={create} style={{ padding: '10px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                <Save size={13} style={{ marginRight: 6 }} />Save Recipe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recipes Grid */}
      {recipes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
          <ChefHat size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p>No recipes saved yet. Create reusable transformation templates.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {recipes.map(r => (
            <div key={r.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ChefHat size={16} color="#6366f1" />
                  <span style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 15 }}>{r.name}</span>
                </div>
                {r.is_public ? <Globe size={14} color="#10b981" /> : <Lock size={14} color="#6b7280" />}
              </div>
              {r.description && <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>{r.description}</p>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ color: '#6b7280', fontSize: 12 }}>{(r.steps || []).length} steps</span>
                <span style={{ color: '#4b5563', fontSize: 12 }}>·</span>
                <span style={{ color: '#6b7280', fontSize: 12 }}>Used {r.usage_count}×</span>
                {(r.tags || []).map(t => <span key={t} style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', padding: '1px 8px', borderRadius: 12, fontSize: 11 }}>{t}</span>)}
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, display: 'flex', gap: 8 }}>
                <button onClick={() => apply(r.id)} disabled={applying[r.id]}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', background: applying[r.id] ? 'rgba(99,102,241,0.2)' : '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  <Play size={12} /> {applying[r.id] ? 'Applying...' : 'Apply'}
                </button>
                <button onClick={() => del(r.id)} style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#f87171' }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
