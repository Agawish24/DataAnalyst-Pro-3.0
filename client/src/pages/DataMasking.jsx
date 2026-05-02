import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Shield, Plus, Trash2, Eye, RefreshCw } from 'lucide-react';

const MASK_COLORS = { email: '#3b82f6', phone: '#10b981', credit_card: '#f59e0b', name: '#8b5cf6', partial: '#06b6d4', hash: '#6366f1', redact: '#ef4444', nullify: '#6b7280', range: '#f97316' };

export default function DataMasking() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [rules, setRules] = useState([]);
  const [maskTypes, setMaskTypes] = useState([]);
  const [preview, setPreview] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ column_name: '', mask_type: 'email', mask_config: {} });
  const [columns, setColumns] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => { fetchDatasets(); loadTypes(); }, []);
  useEffect(() => { if (activeDataset) { loadRules(); loadColumns(); setPreview(null); } }, [activeDataset]);

  const loadRules = async () => { try { const r = await api.get(`/masking/${activeDataset.id}`); setRules(r.data); } catch {} };
  const loadTypes = async () => { try { const r = await api.get('/masking/types'); setMaskTypes(r.data); } catch {} };
  const loadColumns = async () => {
    try {
      const r = await api.get(`/datasets/${activeDataset.id}`);
      const schema = r.data.schema || [];
      const cols = Array.isArray(schema)
        ? schema.map(c => c.name)
        : Object.keys(schema);
      setColumns(cols);
    } catch {}
  };

  const addRule = async () => {
    if (!form.column_name || !activeDataset) return toast.error('Select a column');
    try {
      await api.post(`/masking/${activeDataset.id}`, form);
      toast.success('Masking rule added'); setShowAdd(false); setForm({ column_name: '', mask_type: 'email', mask_config: {} }); loadRules();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const deleteRule = async (id) => {
    await api.delete(`/masking/${activeDataset.id}/${id}`); loadRules(); toast.success('Rule removed');
  };

  const loadPreview = async () => {
    if (!activeDataset) return;
    setLoadingPreview(true);
    try { const r = await api.post(`/masking/${activeDataset.id}/preview`); setPreview(r.data); }
    catch (e) { toast.error(e.response?.data?.error || 'Preview failed'); }
    finally { setLoadingPreview(false); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}><Shield size={26} color="#ef4444" /> Data Masking</h1>
        <p style={{ color: '#9ca3af', margin: 0 }}>Define column-level PII masking rules to protect sensitive data</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* Left: dataset + rules */}
        <div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>DATASET</label>
            <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))}
              style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
              <option value="">Select...</option>
              {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {activeDataset && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600 }}>MASKING RULES ({rules.length})</span>
                <button onClick={() => setShowAdd(true)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#9ca3af', cursor: 'pointer', padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={11} /> Add</button>
              </div>
              {rules.length === 0 ? (
                <div style={{ background: '#13131f', borderRadius: 10, padding: 24, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <Shield size={32} color="#374151" style={{ margin: '0 auto 10px', display: 'block' }} />
                  <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>No masking rules</p>
                </div>
              ) : rules.map(r => (
                <div key={r.id} style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>{r.column_name}</div>
                    <span style={{ background: `${MASK_COLORS[r.mask_type] || '#6b7280'}22`, color: MASK_COLORS[r.mask_type] || '#6b7280', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{r.mask_type}</span>
                  </div>
                  <button onClick={() => deleteRule(r.id)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><Trash2 size={13} /></button>
                </div>
              ))}
              <button onClick={loadPreview} disabled={loadingPreview} style={{ width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 600 }}>
                {loadingPreview ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Eye size={14} />} Preview Masking
              </button>
            </>
          )}
        </div>

        {/* Right: mask type gallery + preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Mask types */}
          <div>
            <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>AVAILABLE MASK TYPES</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {maskTypes.map(mt => (
                <div key={mt.type} style={{ background: '#13131f', border: `1px solid ${MASK_COLORS[mt.type] || '#6b7280'}33`, borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <Shield size={14} color={MASK_COLORS[mt.type] || '#6b7280'} />
                    <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>{mt.label}</span>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: MASK_COLORS[mt.type] || '#6b7280', background: `${MASK_COLORS[mt.type] || '#6b7280'}11`, padding: '3px 8px', borderRadius: 4, marginBottom: 6, display: 'inline-block' }}>{mt.example}</div>
                  <div style={{ color: '#6b7280', fontSize: 11 }}>{mt.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ color: '#f3f4f6', fontWeight: 600 }}>Masking Preview — {preview.rulesApplied} rules applied</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                {['original', 'masked'].map(view => (
                  <div key={view} style={{ borderRight: view === 'original' ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <div style={{ padding: '8px 14px', background: view === 'masked' ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ color: view === 'masked' ? '#ef4444' : '#9ca3af', fontSize: 12, fontWeight: 600 }}>{view === 'original' ? 'ORIGINAL' : '🔒 MASKED'}</span>
                    </div>
                    <div style={{ overflowX: 'auto', maxHeight: 250 }}>
                      {preview[view]?.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr>{Object.keys(preview[view][0]).slice(0, 5).map(k => <th key={k} style={{ padding: '6px 10px', textAlign: 'left', color: '#6b7280', background: '#0d0d1a', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{k}</th>)}</tr></thead>
                          <tbody>{preview[view].slice(0, 8).map((row, i) => <tr key={i}>{Object.values(row).slice(0, 5).map((v, j) => <td key={j} style={{ padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0' }}>{v !== null ? String(v) : <span style={{ color: '#4b5563' }}>null</span>}</td>)}</tr>)}</tbody>
                        </table>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAdd(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: 480, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f3f4f6', marginTop: 0, marginBottom: 20 }}>Add Masking Rule</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>COLUMN</label>
                <select value={form.column_name} onChange={e => setForm(f => ({ ...f, column_name: e.target.value }))}
                  style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                  <option value="">Select column...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>MASK TYPE</label>
                <select value={form.mask_type} onChange={e => setForm(f => ({ ...f, mask_type: e.target.value }))}
                  style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                  {maskTypes.map(mt => <option key={mt.type} value={mt.type}>{mt.label} — {mt.example}</option>)}
                </select></div>
              {form.mask_type === 'partial' && (
                <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>CHARS TO SHOW</label>
                  <input type="number" defaultValue={3} onChange={e => setForm(f => ({ ...f, mask_config: { keepChars: parseInt(e.target.value) } }))}
                    style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }} /></div>
              )}
              {form.mask_type === 'range' && (
                <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>BUCKET SIZE</label>
                  <input type="number" defaultValue={10} onChange={e => setForm(f => ({ ...f, mask_config: { bucketSize: parseInt(e.target.value) } }))}
                    style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }} /></div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={addRule} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Add Rule</button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
