import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { MessageCircle, Plus, Trash2, Edit2, Save, X, Tag } from 'lucide-react';

const TARGET_TYPES = [
  { id: 'column', label: 'Column', color: '#6366f1' },
  { id: 'row', label: 'Row', color: '#10b981' },
  { id: 'chart', label: 'Chart', color: '#f59e0b' },
  { id: 'dataset', label: 'Dataset', color: '#8b5cf6' },
  { id: 'metric', label: 'Metric', color: '#ec4899' },
];

export default function Annotations() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [annotations, setAnnotations] = useState([]);
  const [columns, setColumns] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [form, setForm] = useState({ target_type: 'column', target_ref: '', content: '' });

  useEffect(() => { fetchDatasets(); }, []);
  useEffect(() => { if (activeDataset) { loadAnnotations(); loadColumns(); } }, [activeDataset, filterType]);

  const loadAnnotations = async () => {
    try {
      const params = {};
      if (filterType) params.target_type = filterType;
      const r = await api.get(`/annotations/${activeDataset.id}`, { params });
      setAnnotations(r.data);
    } catch {}
  };

  const loadColumns = async () => {
    try {
      const r = await api.get(`/datasets/${activeDataset.id}`);
      const schema = r.data.schema || [];
      setColumns(Array.isArray(schema) ? schema.map(c => c.name) : Object.keys(schema));
    } catch {}
  };

  const add = async () => {
    if (!form.content.trim()) return toast.error('Content required');
    try {
      await api.post(`/annotations/${activeDataset.id}`, form);
      toast.success('Annotation added'); setShowAdd(false); setForm({ target_type: 'column', target_ref: '', content: '' }); loadAnnotations();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const update = async (id) => {
    try { await api.put(`/annotations/${id}`, { content: editContent }); setEditId(null); loadAnnotations(); toast.success('Updated'); }
    catch (e) { toast.error('Failed'); }
  };

  const del = async (id) => {
    try { await api.delete(`/annotations/${id}`); loadAnnotations(); toast.success('Deleted'); }
    catch (e) { toast.error('Not authorized'); }
  };

  const groupedByType = annotations.reduce((acc, a) => {
    if (!acc[a.target_type]) acc[a.target_type] = [];
    acc[a.target_type].push(a);
    return acc;
  }, {});

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}><MessageCircle size={26} color="#6366f1" /> Annotations</h1>
          <p style={{ color: '#9ca3af', margin: 0 }}>Add contextual notes, insights, and flags to columns, rows, and charts</p>
        </div>
        {activeDataset && (
          <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} /> Add Annotation
          </button>
        )}
      </div>

      {/* Dataset + filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))}
          style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
          <option value="">Select a dataset...</option>{datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {activeDataset && (
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
            <option value="">All types</option>{TARGET_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        )}
      </div>

      {!activeDataset ? (
        <div style={{ background: '#13131f', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 12, padding: 80, textAlign: 'center' }}>
          <MessageCircle size={60} color="#374151" style={{ margin: '0 auto 16px', display: 'block' }} />
          <p style={{ color: '#6b7280', fontSize: 15 }}>Select a dataset to view and manage annotations</p>
        </div>
      ) : annotations.length === 0 ? (
        <div style={{ background: '#13131f', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 12, padding: 60, textAlign: 'center' }}>
          <MessageCircle size={48} color="#374151" style={{ margin: '0 auto 12px', display: 'block' }} />
          <p style={{ color: '#6b7280', margin: '0 0 16px' }}>No annotations yet for this dataset</p>
          <button onClick={() => setShowAdd(true)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontWeight: 600 }}>Add First Annotation</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.entries(groupedByType).map(([type, items]) => {
            const typeInfo = TARGET_TYPES.find(t => t.id === type) || { label: type, color: '#6b7280' };
            return (
              <div key={type} style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Tag size={14} color={typeInfo.color} />
                  <span style={{ color: '#f3f4f6', fontWeight: 600 }}>{typeInfo.label} Annotations</span>
                  <span style={{ background: `${typeInfo.color}22`, color: typeInfo.color, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{items.length}</span>
                </div>
                {items.map(ann => (
                  <div key={ann.id} style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {ann.target_ref && <span style={{ background: `${typeInfo.color}22`, color: typeInfo.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{ann.target_ref}</span>}
                        <span style={{ color: '#6b7280', fontSize: 12 }}>by <strong style={{ color: '#9ca3af' }}>{ann.author_name}</strong> · {new Date(ann.created_at).toLocaleDateString()}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditId(ann.id); setEditContent(ann.content); }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}><Edit2 size={13} /></button>
                        <button onClick={() => del(ann.id)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                    {editId === ann.id ? (
                      <div>
                        <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3}
                          style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => update(ann.id)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#6366f1', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}><Save size={12} /> Save</button>
                          <button onClick={() => setEditId(null)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><X size={12} /> Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.6 }}>{ann.content}</div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && activeDataset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowAdd(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 520, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f3f4f6', marginTop: 0, marginBottom: 20 }}>Add Annotation</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>TYPE</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TARGET_TYPES.map(t => (
                    <button key={t.id} onClick={() => setForm(f => ({ ...f, target_type: t.id }))}
                      style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${form.target_type === t.id ? t.color : 'rgba(255,255,255,0.1)'}`, background: form.target_type === t.id ? `${t.color}22` : 'transparent', color: form.target_type === t.id ? t.color : '#9ca3af', cursor: 'pointer', fontSize: 13, fontWeight: form.target_type === t.id ? 600 : 400 }}>{t.label}</button>
                  ))}
                </div></div>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>REFERENCE (column name, row #, chart ID, etc)</label>
                {form.target_type === 'column' ? (
                  <select value={form.target_ref} onChange={e => setForm(f => ({ ...f, target_ref: e.target.value }))}
                    style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                    <option value="">Select column...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input value={form.target_ref} onChange={e => setForm(f => ({ ...f, target_ref: e.target.value }))} placeholder="e.g. row-42, chart-revenue, metric-churn"
                    style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }} />
                )}</div>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>ANNOTATION</label>
                <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={4}
                  placeholder="Add your insight, flag, or note here..."
                  style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={add} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Add Annotation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
