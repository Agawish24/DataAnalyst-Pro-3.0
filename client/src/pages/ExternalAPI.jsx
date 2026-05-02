import { useState, useEffect } from 'react';
import api from '../api/client';
import { Key, Plus, Trash2, Copy, CheckCircle, Eye, EyeOff, Globe, Lock, Clock, Activity, Code2, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

const EndpointDoc = ({ method, path, desc, body, example }) => {
  const [open, setOpen] = useState(false);
  const methodColor = { GET: '#10b981', POST: '#6366f1', DELETE: '#ef4444' }[method] || '#6b7280';
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}>
        <span style={{ background: `${methodColor}20`, color: methodColor, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, minWidth: 45, textAlign: 'center' }}>{method}</span>
        <code style={{ color: '#a5b4fc', fontSize: 13 }}>{path}</code>
        <span style={{ color: '#6b7280', fontSize: 13, flex: 1 }}>{desc}</span>
        {open ? <ChevronUp size={13} color="#4b5563" /> : <ChevronDown size={13} color="#4b5563" />}
      </div>
      {open && (
        <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {body && <div style={{ marginBottom: 10 }}>
            <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>REQUEST BODY</div>
            <pre style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, color: '#a5b4fc', fontSize: 12, overflow: 'auto', margin: 0 }}>{body}</pre>
          </div>}
          {example && <div>
            <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>EXAMPLE</div>
            <pre style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, color: '#d1d5db', fontSize: 12, overflow: 'auto', margin: 0 }}>{example}</pre>
          </div>}
        </div>
      )}
    </div>
  );
};

export default function ExternalAPI() {
  const [keys, setKeys] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [form, setForm] = useState({ name: '', permissions: ['read'], expires_days: '' });
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('keys');
  const [copiedId, setCopiedId] = useState(null);

  const loadKeys = async () => {
    try { setKeys(await api.get('/external-api/keys')); } catch {}
  };
  useEffect(() => { loadKeys(); }, []);

  const createKey = async () => {
    if (!form.name.trim()) return toast.error('Key name required');
    setCreating(true);
    try {
      const res = await api.post('/external-api/keys', { ...form, expires_days: form.expires_days ? parseInt(form.expires_days) : undefined });
      setNewKey(res);
      setShowCreate(false);
      setForm({ name: '', permissions: ['read'], expires_days: '' });
      loadKeys();
    } catch { toast.error('Failed to create key'); }
    finally { setCreating(false); }
  };

  const revokeKey = async (id) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    try { await api.delete(`/external-api/keys/${id}`); toast.success('Key revoked'); loadKeys(); } catch {}
  };

  const copy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const baseUrl = window.location.origin;

  const ENDPOINTS = [
    { method: 'GET', path: '/api/external-api/v1/datasets', desc: 'List all your datasets', example: `curl -H "X-Api-Key: YOUR_KEY" ${baseUrl}/api/external-api/v1/datasets` },
    { method: 'GET', path: '/api/external-api/v1/datasets/:id/data', desc: 'Fetch dataset rows (limit/offset)', example: `curl -H "X-Api-Key: YOUR_KEY" "${baseUrl}/api/external-api/v1/datasets/1/data?limit=100&offset=0"` },
    { method: 'POST', path: '/api/external-api/v1/query', desc: 'Run SQL against a dataset', body: `{\n  "sql": "SELECT * FROM dataset LIMIT 10",\n  "dataset_id": 1\n}`, example: `curl -X POST -H "X-Api-Key: YOUR_KEY" -H "Content-Type: application/json" \\\n  -d '{"sql":"SELECT COUNT(*) FROM dataset","dataset_id":1}' \\\n  ${baseUrl}/api/external-api/v1/query` },
    { method: 'GET', path: '/api/external-api/v1/profile/:datasetId', desc: 'Get cached data profile', example: `curl -H "X-Api-Key: YOUR_KEY" ${baseUrl}/api/external-api/v1/profile/1` },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Globe size={22} color="#06b6d4" /> External API Access
        </h1>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>Generate API keys to query your datasets programmatically from any external application</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4 }}>
        {[['keys', 'API Keys', Key], ['docs', 'Documentation', Code2]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: activeTab === id ? '#6366f1' : 'transparent', color: activeTab === id ? '#fff' : '#9ca3af' }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* New key reveal */}
      {newKey && (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#34d399', fontWeight: 600 }}>
            <CheckCircle size={16} /> API Key Created — Copy it now!
          </div>
          <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>⚠ This key will NOT be shown again. Store it securely.</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, padding: '12px 16px', background: 'rgba(0,0,0,0.4)', borderRadius: 8, color: '#a5b4fc', fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all' }}>{newKey.raw_key}</code>
            <button onClick={() => copy(newKey.raw_key, 'new')} style={{ padding: '12px 16px', background: copiedId === 'new' ? '#10b981' : '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
              {copiedId === 'new' ? <CheckCircle size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} style={{ marginTop: 10, padding: '6px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', fontSize: 13 }}>Dismiss</button>
        </div>
      )}

      {activeTab === 'keys' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowCreate(!showCreate)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
              <Plus size={14} /> Generate API Key
            </button>
          </div>

          {showCreate && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 14 }}>New API Key</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Key Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Production App, Analytics Service"
                    style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Expires In (days, leave empty = never)</label>
                  <input type="number" value={form.expires_days} onChange={e => setForm(f => ({...f, expires_days: e.target.value}))} placeholder="30"
                    style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>Permissions</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['read', 'write', 'query'].map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 12px', background: form.permissions.includes(p) ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
                      <input type="checkbox" checked={form.permissions.includes(p)} onChange={e => setForm(f => ({ ...f, permissions: e.target.checked ? [...f.permissions, p] : f.permissions.filter(x => x !== p) }))} style={{ accentColor: '#6366f1' }} />
                      <span style={{ color: '#d1d5db', fontSize: 13, textTransform: 'capitalize' }}>{p}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowCreate(false)} style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
                <button onClick={createKey} disabled={creating} style={{ padding: '9px 16px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  {creating ? 'Creating...' : 'Generate Key'}
                </button>
              </div>
            </div>
          )}

          {keys.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#4b5563' }}>
              <Key size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p>No API keys yet. Generate one to allow external apps to query your data.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {keys.map(k => (
                <div key={k.id} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${k.is_active ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.15)'}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: k.is_active ? 'rgba(99,102,241,0.2)' : 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {k.is_active ? <Key size={14} color="#a5b4fc" /> : <Lock size={14} color="#f87171" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>{k.name}</div>
                    <div style={{ display: 'flex', gap: 12, color: '#4b5563', fontSize: 12, marginTop: 2 }}>
                      <code style={{ color: '#6b7280', fontSize: 12 }}>{k.key_prefix}</code>
                      <span>{(k.permissions || []).join(', ')}</span>
                      {k.last_used_at && <span><Activity size={10} style={{ display: 'inline', marginRight: 3 }} />Last used {new Date(k.last_used_at).toLocaleDateString()}</span>}
                      <span>{k.request_count} requests</span>
                      {k.expires_at && <span><Clock size={10} style={{ display: 'inline', marginRight: 3 }} />Expires {new Date(k.expires_at).toLocaleDateString()}</span>}
                      {!k.is_active && <span style={{ color: '#f87171' }}>REVOKED</span>}
                    </div>
                  </div>
                  {k.is_active && (
                    <button onClick={() => revokeKey(k.id)} style={{ padding: '7px 12px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontSize: 12 }}>Revoke</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'docs' && (
        <div>
          <div style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ color: '#67e8f9', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={13} /> Authentication</div>
            <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>All API endpoints require an API key. Pass it as a header or query parameter:</p>
            <code style={{ display: 'block', background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 8, color: '#a5b4fc', fontSize: 12 }}>
              X-Api-Key: dap_your_key_here{'\n'}
              — or —{'\n'}
              ?api_key=dap_your_key_here
            </code>
          </div>

          <div style={{ color: '#9ca3af', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Available Endpoints</div>
          {ENDPOINTS.map((e, i) => <EndpointDoc key={i} {...e} />)}

          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: 16, marginTop: 20 }}>
            <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 6 }}>Rate Limits</div>
            <ul style={{ color: '#9ca3af', fontSize: 13, paddingLeft: 20, lineHeight: 1.8 }}>
              <li>1000 requests per 15 minutes per API key</li>
              <li>Maximum 10,000 rows per data request</li>
              <li>SQL queries must be read-only (SELECT only)</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
