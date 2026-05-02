import { useState, useEffect } from 'react';
import api from '../api/client';
import { Search, Tag, Database, Shield, GitBranch, Edit2, Save, X, ChevronRight, Filter } from 'lucide-react';
import toast from 'react-hot-toast';

const SENSITIVITY_COLORS = { public: '#10b981', internal: '#6366f1', confidential: '#f59e0b', restricted: '#ef4444' };
const SENSITIVITY_OPTIONS = ['public', 'internal', 'confidential', 'restricted'];

export default function DataCatalog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [filterSensitivity, setFilterSensitivity] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [allDomains, setAllDomains] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (filterDomain) params.append('domain', filterDomain);
      if (filterSensitivity) params.append('sensitivity', filterSensitivity);
      if (filterTag) params.append('tag', filterTag);
      const [data, tags, domains] = await Promise.all([
        api.get(`/catalog?${params}`),
        api.get('/catalog/tags'),
        api.get('/catalog/domains'),
      ]);
      setEntries(data);
      setAllTags(tags);
      setAllDomains(domains);
    } catch { toast.error('Failed to load catalog'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search, filterDomain, filterSensitivity, filterTag]);

  const openEntry = async (entry) => {
    try {
      const detail = await api.get(`/catalog/${entry.dataset_id}`);
      setSelected(detail);
      setEditForm({ tags: detail.tags || [], description: detail.description || '', owner: detail.owner || '', domain: detail.domain || '', sensitivity: detail.sensitivity || 'internal', lineage: detail.lineage || [], custom_metadata: detail.custom_metadata || {} });
      setEditing(false);
    } catch { toast.error('Failed to load entry'); }
  };

  const save = async () => {
    try {
      await api.put(`/catalog/${selected.dataset_id}`, editForm);
      toast.success('Catalog entry updated');
      setEditing(false);
      load();
    } catch { toast.error('Failed to save'); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4 }}>Data Catalog</h1>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>Searchable library of all datasets with schema, tags, and lineage</p>
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search datasets, descriptions, owners..."
            style={{ width: '100%', padding: '10px 10px 10px 38px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', fontSize: 14 }}>
          <option value="">All Domains</option>
          {allDomains.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterSensitivity} onChange={e => setFilterSensitivity(e.target.value)} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', fontSize: 14 }}>
          <option value="">All Sensitivity</option>
          {SENSITIVITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', fontSize: 14 }}>
          <option value="">All Tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 400px' : '1fr', gap: 20 }}>
        {/* Entries List */}
        <div>
          {loading ? <p style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>Loading catalog...</p> : entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
              <Database size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <p>No datasets found. Upload data to populate the catalog.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {entries.map(entry => (
                <div key={entry.id} onClick={() => openEntry(entry)} style={{ background: selected?.dataset_id === entry.dataset_id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selected?.dataset_id === entry.dataset_id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: 18, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Database size={14} color="#6366f1" />
                        <span style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 15 }}>{entry.dataset_name || entry.name}</span>
                      </div>
                      {entry.description && <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>{entry.description}</p>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {entry.sensitivity && <span style={{ background: `${SENSITIVITY_COLORS[entry.sensitivity]}20`, color: SENSITIVITY_COLORS[entry.sensitivity], padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{entry.sensitivity}</span>}
                      <ChevronRight size={16} color="#4b5563" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>{entry.row_count?.toLocaleString() || 0} rows</span>
                    {entry.domain && <span style={{ color: '#8b5cf6', fontSize: 12 }}>• {entry.domain}</span>}
                    {entry.owner_name && <span style={{ color: '#6b7280', fontSize: 12 }}>• {entry.owner_name}</span>}
                    {(entry.tags || []).map(t => <span key={t} style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', padding: '1px 8px', borderRadius: 12, fontSize: 11 }}>{t}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, height: 'fit-content', position: 'sticky', top: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 16 }}>{selected.dataset_name || selected.name}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {editing ? (
                  <>
                    <button onClick={save} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#10b981', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 }}><Save size={12} /> Save</button>
                    <button onClick={() => setEditing(false)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: '#9ca3af', cursor: 'pointer', fontSize: 13 }}><X size={12} /></button>
                  </>
                ) : (
                  <button onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: '#9ca3af', cursor: 'pointer', fontSize: 13 }}><Edit2 size={12} /> Edit</button>
                )}
                <button onClick={() => setSelected(null)} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 6, color: '#6b7280', cursor: 'pointer' }}><X size={14} /></button>
              </div>
            </div>

            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[['Description', 'description', 'textarea'], ['Owner', 'owner', 'text'], ['Domain', 'domain', 'text']].map(([label, field, type]) => (
                  <div key={field}>
                    <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>{label}</label>
                    {type === 'textarea' ? (
                      <textarea value={editForm[field] || ''} onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))} rows={3}
                        style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                    ) : (
                      <input value={editForm[field] || ''} onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
                    )}
                  </div>
                ))}
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Sensitivity</label>
                  <select value={editForm.sensitivity} onChange={e => setEditForm(f => ({ ...f, sensitivity: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
                    {SENSITIVITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Tags (comma separated)</label>
                  <input value={(editForm.tags || []).join(', ')} onChange={e => setEditForm(f => ({ ...f, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[['Source', selected.source || 'upload'], ['Rows', (selected.row_count || 0).toLocaleString()], ['Owner', selected.owner || '—'], ['Domain', selected.domain || '—'], ['Sensitivity', selected.sensitivity || 'internal']].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: '#6b7280', fontSize: 13 }}>{label}</span>
                    <span style={{ color: label === 'Sensitivity' ? SENSITIVITY_COLORS[value] : '#d1d5db', fontSize: 13, fontWeight: label === 'Sensitivity' ? 600 : 400 }}>{value}</span>
                  </div>
                ))}
                {selected.description && <p style={{ color: '#9ca3af', fontSize: 13 }}>{selected.description}</p>}
                {(selected.tags || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selected.tags.map(t => <span key={t} style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', padding: '3px 10px', borderRadius: 12, fontSize: 12 }}>{t}</span>)}
                  </div>
                )}
                {(selected.lineage || []).length > 0 && (
                  <div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><GitBranch size={12} /> Lineage</div>
                    {selected.lineage.map((item, i) => <div key={i} style={{ color: '#9ca3af', fontSize: 12, padding: '4px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, marginBottom: 4 }}>{JSON.stringify(item)}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
