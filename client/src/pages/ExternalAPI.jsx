import { useState, useEffect } from 'react';
import api from '../api/client';
import {
  Key, Plus, Trash2, Copy, CheckCircle, Globe, Lock, Clock,
  Activity, Code2, ChevronDown, ChevronUp, ShieldCheck, Sparkles,
  BarChart2, AlertTriangle, GitBranch, Zap, BookOpen, Terminal
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Style tokens ──────────────────────────────────────────────────────────────
const card  = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 };
const inp   = { width: '100%', padding: '9px 14px', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 13, boxSizing: 'border-box' };
const label = { color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 };
const pill  = (on, color) => ({ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: on ? `${color}22` : 'rgba(255,255,255,0.05)', color: on ? color : '#4b5563', border: `1px solid ${on ? color + '44' : 'rgba(255,255,255,0.06)'}` });

// ── Role definitions ─────────────────────────────────────────────────────────
const ROLES = {
  viewer:  { label: 'Viewer',  color: '#10b981', perms: ['read'],                 desc: 'List & fetch dataset rows only' },
  analyst: { label: 'Analyst', color: '#6366f1', perms: ['read', 'query'],         desc: 'Read + run SELECT queries' },
  admin:   { label: 'Admin',   color: '#ef4444', perms: ['read', 'write', 'query', 'admin'], desc: 'Full access including write' },
};

// ── Error codes reference ─────────────────────────────────────────────────────
const ERROR_CODES = [
  { code: '401 MISSING_API_KEY',       color: '#ef4444', desc: 'No X-Api-Key header or ?api_key= param provided' },
  { code: '401 INVALID_OR_EXPIRED_KEY',color: '#ef4444', desc: 'Key hash not found or past its expiry date' },
  { code: '403 PERMISSION_DENIED',     color: '#f97316', desc: 'Key role lacks the required permission for this operation' },
  { code: '403 READ_ONLY_VIOLATION',   color: '#f97316', desc: 'Non-SELECT statement blocked — API is read-only' },
  { code: '404 DATASET_NOT_FOUND',     color: '#f59e0b', desc: 'No table data_{id} found for the given dataset ID' },
  { code: '404 PROFILE_NOT_FOUND',     color: '#f59e0b', desc: 'No profiling run found — generate one in the Profiling page' },
  { code: '429 RATE_LIMIT_EXCEEDED',   color: '#a78bfa', desc: 'Exceeded requests per 15-min window. Check X-RateLimit-Reset header' },
  { code: '400 SQL_SYNTAX_ERROR',      color: '#6b7280', desc: 'PostgreSQL rejected the SQL — check syntax and column names' },
  { code: '500 INTERNAL_ERROR',        color: '#6b7280', desc: 'Unexpected server error — retry with exponential back-off' },
];

// ── SDK snippets ──────────────────────────────────────────────────────────────
const SDK_PYTHON = (base) => `import requests

DAP_KEY = "dap_your_key_here"
BASE    = "${base}/api/external-api/v1"
HEADERS = {"X-Api-Key": DAP_KEY}

# List datasets
datasets = requests.get(f"{BASE}/datasets", headers=HEADERS).json()

# Fetch rows with cursor pagination
cursor = None
all_rows = []
while True:
    params = {"limit": 1000, **({"cursor": cursor} if cursor else {})}
    page = requests.get(f"{BASE}/datasets/1/data", headers=HEADERS, params=params).json()
    all_rows.extend(page["data"])
    cursor = page.get("next_cursor")
    if not page.get("has_more"):
        break

# Run a SELECT query
result = requests.post(f"{BASE}/query", headers=HEADERS,
    json={"sql": "SELECT * FROM dataset LIMIT 50", "dataset_id": 1}).json()
`;

const SDK_R = (base) => `library(httr)
library(jsonlite)

DAP_KEY <- "dap_your_key_here"
BASE    <- "${base}/api/external-api/v1"
hdrs    <- add_headers("X-Api-Key" = DAP_KEY)

# List datasets
datasets <- content(GET(paste0(BASE, "/datasets"), hdrs), "parsed")

# Cursor pagination
all_rows <- list(); cursor <- NULL
repeat {
  params <- list(limit = 1000)
  if (!is.null(cursor)) params$cursor <- cursor
  page <- content(GET(paste0(BASE, "/datasets/1/data"), hdrs, query = params), "parsed")
  all_rows <- c(all_rows, page$data)
  cursor <- page$next_cursor
  if (!isTRUE(page$has_more)) break
}

# SQL query
result <- content(POST(paste0(BASE, "/query"), hdrs,
  body = list(sql = "SELECT COUNT(*) FROM dataset", dataset_id = 1),
  encode = "json"), "parsed")
`;

const SDK_JS = (base) => `const DAP_KEY = "dap_your_key_here";
const BASE    = "${base}/api/external-api/v1";

const dap = async (path, opts = {}) => {
  const res = await fetch(\`\${BASE}\${path}\`, {
    ...opts,
    headers: { "X-Api-Key": DAP_KEY, "Content-Type": "application/json", ...opts.headers }
  });
  if (!res.ok) throw await res.json();
  return res.json();
};

// List datasets
const { data: datasets } = await dap("/datasets");

// Cursor-based pagination
const fetchAll = async (datasetId) => {
  const rows = []; let cursor;
  do {
    const url = \`/datasets/\${datasetId}/data?limit=1000\${cursor ? "&cursor=" + cursor : ""}\`;
    const page = await dap(url);
    rows.push(...page.data);
    cursor = page.next_cursor;
  } while (page.has_more);
  return rows;
};

// SQL query
const result = await dap("/query", {
  method: "POST",
  body: JSON.stringify({ sql: "SELECT * FROM dataset LIMIT 10", dataset_id: 1 })
});
`;

// ── Collapsible endpoint doc ──────────────────────────────────────────────────
const EndpointDoc = ({ method, path, desc, body, example, permissions, cursor }) => {
  const [open, setOpen] = useState(false);
  const mc = { GET: '#10b981', POST: '#6366f1', DELETE: '#ef4444' }[method] || '#6b7280';
  return (
    <div style={{ ...card, marginBottom: 8, overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}>
        <span style={{ background: `${mc}20`, color: mc, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, minWidth: 48, textAlign: 'center' }}>{method}</span>
        <code style={{ color: '#a5b4fc', fontSize: 12, flex: 1 }}>{path}</code>
        <span style={{ color: '#6b7280', fontSize: 12 }}>{desc}</span>
        {permissions && <span style={{ ...pill(true, '#6366f1'), fontSize: 10 }}>{permissions}</span>}
        {cursor && <span style={{ ...pill(true, '#10b981'), fontSize: 10 }}>cursor</span>}
        {open ? <ChevronUp size={12} color="#4b5563" /> : <ChevronDown size={12} color="#4b5563" />}
      </div>
      {open && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' }}>
          {body && <>
            <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>Request Body</div>
            <pre style={{ background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 8, color: '#a5b4fc', fontSize: 12, overflow: 'auto', margin: '0 0 12px' }}>{body}</pre>
          </>}
          {example && <>
            <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>Example</div>
            <pre style={{ background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 8, color: '#d1d5db', fontSize: 12, overflow: 'auto', margin: 0 }}>{example}</pre>
          </>}
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════════════════════
export default function ExternalAPI() {
  const [keys, setKeys]           = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey]       = useState(null);   // ← fixed: stores res.data not res
  const [form, setForm]           = useState({ name: '', role: 'analyst', expires_days: '', rate_limit_per_hour: '1000' });
  const [creating, setCreating]   = useState(false);
  const [activeTab, setActiveTab] = useState('keys');
  const [sdkLang, setSdkLang]     = useState('python');
  const [copiedId, setCopiedId]   = useState(null);
  const [usageData, setUsageData] = useState({});
  const [loadingUsage, setLoadingUsage] = useState(null);

  const loadKeys = async () => { try { setKeys((await api.get('/external-api/keys')).data); } catch {} };
  useEffect(() => { loadKeys(); }, []);

  const createKey = async () => {
    if (!form.name.trim()) return toast.error('Key name required');
    setCreating(true);
    try {
      const res = await api.post('/external-api/keys', {
        name: form.name,
        role: form.role,
        expires_days: form.expires_days ? parseInt(form.expires_days) : undefined,
        rate_limit_per_hour: parseInt(form.rate_limit_per_hour) || 1000,
      });
      setNewKey(res.data);   // ← BUG FIX: was res (full axios object), now res.data
      setShowCreate(false);
      setForm({ name: '', role: 'analyst', expires_days: '', rate_limit_per_hour: '1000' });
      loadKeys();
      toast.success('API key generated — copy it now!');
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to create key'); }
    finally { setCreating(false); }
  };

  const revokeKey = async (id) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    try { await api.delete(`/external-api/keys/${id}`); toast.success('Key revoked'); loadKeys(); } catch {}
  };

  const loadUsage = async (id) => {
    setLoadingUsage(id);
    try {
      const r = await api.get(`/external-api/keys/${id}/usage`);
      setUsageData(u => ({ ...u, [id]: r.data }));
    } catch { toast.error('Could not load usage'); }
    finally { setLoadingUsage(null); }
  };

  const copy = (text, id) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id); toast.success('Copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const base = window.location.origin;

  const SDK_CODE = { python: SDK_PYTHON(base), r: SDK_R(base), javascript: SDK_JS(base) };
  const SDK_LABELS = { python: '🐍 Python', r: '📊 R', javascript: '🟡 JavaScript' };

  const ENDPOINTS = [
    { method: 'GET',  path: '/api/external-api/v1/datasets',         desc: 'List your datasets',            permissions: 'read',       example: `curl -H "X-Api-Key: YOUR_KEY" ${base}/api/external-api/v1/datasets` },
    { method: 'GET',  path: '/api/external-api/v1/datasets/:id/data', desc: 'Fetch rows — cursor pagination', permissions: 'read',       cursor: true, example: `curl -H "X-Api-Key: YOUR_KEY" "${base}/api/external-api/v1/datasets/1/data?limit=500&cursor=0"` },
    { method: 'POST', path: '/api/external-api/v1/query',             desc: 'Run read-only SQL',              permissions: 'query',      body: `{ "sql": "SELECT * FROM dataset LIMIT 10", "dataset_id": 1 }`, example: `curl -X POST -H "X-Api-Key: YOUR_KEY" -H "Content-Type: application/json" \\\n  -d '{"sql":"SELECT COUNT(*) FROM dataset","dataset_id":1}' \\\n  ${base}/api/external-api/v1/query` },
    { method: 'GET',  path: '/api/external-api/v1/profile/:datasetId', desc: 'Get cached data profile',       permissions: 'read',       example: `curl -H "X-Api-Key: YOUR_KEY" ${base}/api/external-api/v1/profile/1` },
    { method: 'GET',  path: '/api/external-api/v1/usage',             desc: 'Current key usage stats',        permissions: 'read',       example: `curl -H "X-Api-Key: YOUR_KEY" ${base}/api/external-api/v1/usage` },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Globe size={21} color="#06b6d4" /> External API Access
        </h1>
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          Cursor pagination · RBAC roles · Governance lineage · Rate-limit headers · SDK snippets
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 22, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
        {[['keys', 'API Keys', Key], ['docs', 'Documentation', Code2], ['sdks', 'SDKs', Terminal]].map(([id, lbl, Icon]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: activeTab === id ? '#6366f1' : 'transparent', color: activeTab === id ? '#fff' : '#6b7280' }}>
            <Icon size={13} />{lbl}
          </button>
        ))}
      </div>

      {/* ── New key reveal banner ── */}
      {newKey && (
        <div style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#34d399', fontWeight: 700 }}>
            <CheckCircle size={15} /> API Key Created — Copy it now!
          </div>
          <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>⚠ This key will NOT be shown again. Store it securely.</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <code style={{ flex: 1, padding: '11px 14px', background: 'rgba(0,0,0,0.5)', borderRadius: 8, color: '#a5b4fc', fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {newKey.raw_key}
            </code>
            <button onClick={() => copy(newKey.raw_key, 'new')}
              style={{ padding: '11px 14px', background: copiedId === 'new' ? '#10b981' : '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
              {copiedId === 'new' ? <CheckCircle size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
            <span>Role: <strong style={{ color: ROLES[newKey.role]?.color }}>{ROLES[newKey.role]?.label || newKey.role}</strong></span>
            <span>Permissions: <strong style={{ color: '#a5b4fc' }}>{(Array.isArray(newKey.permissions) ? newKey.permissions : []).join(', ')}</strong></span>
            {newKey.expires_at && <span>Expires: {new Date(newKey.expires_at).toLocaleDateString()}</span>}
          </div>
          <button onClick={() => setNewKey(null)}
            style={{ padding: '5px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
        </div>
      )}

      {/* ════════════════════ TAB: KEYS ════════════════════ */}
      {activeTab === 'keys' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowCreate(!showCreate)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              <Plus size={13} /> Generate API Key
            </button>
          </div>

          {/* Create form */}
          {showCreate && (
            <div style={{ ...card, padding: 20, marginBottom: 16 }}>
              <div style={{ color: '#f3f4f6', fontWeight: 700, marginBottom: 14, fontSize: 14 }}>New API Key</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={label}>Key Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Production App" style={inp} />
                </div>
                <div>
                  <label style={label}>Expires In (days — blank = never)</label>
                  <input type="number" value={form.expires_days} onChange={e => setForm(f => ({ ...f, expires_days: e.target.value }))}
                    placeholder="30, 90, 365..." style={inp} />
                </div>
              </div>

              {/* RBAC role picker */}
              <div style={{ marginBottom: 14 }}>
                <label style={label}>RBAC Role</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.entries(ROLES).map(([roleId, roleInfo]) => (
                    <button key={roleId} onClick={() => setForm(f => ({ ...f, role: roleId }))}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 9, border: `2px solid ${form.role === roleId ? roleInfo.color : 'rgba(255,255,255,0.08)'}`, background: form.role === roleId ? `${roleInfo.color}12` : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ color: form.role === roleId ? roleInfo.color : '#9ca3af', fontWeight: 700, fontSize: 12 }}>{roleInfo.label}</div>
                      <div style={{ color: '#4b5563', fontSize: 11, marginTop: 2 }}>{roleInfo.desc}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                        {roleInfo.perms.map(p => <span key={p} style={{ ...pill(true, roleInfo.color), fontSize: 9 }}>{p}</span>)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={label}>Rate Limit (requests / hour)</label>
                <input type="number" value={form.rate_limit_per_hour}
                  onChange={e => setForm(f => ({ ...f, rate_limit_per_hour: e.target.value }))}
                  placeholder="1000" style={{ ...inp, maxWidth: 160 }} />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowCreate(false)}
                  style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
                <button onClick={createKey} disabled={creating}
                  style={{ padding: '9px 20px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                  {creating ? 'Generating…' : 'Generate Key'}
                </button>
              </div>
            </div>
          )}

          {/* Key list */}
          {keys.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#4b5563' }}>
              <Key size={40} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
              <p style={{ margin: 0 }}>No API keys yet. Generate one to allow external apps to query your data.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {keys.map(k => {
                const roleInfo = ROLES[k.role] || ROLES.analyst;
                const usage = usageData[k.id];
                return (
                  <div key={k.id} style={{ ...card, borderColor: k.is_active ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.15)', overflow: 'hidden', borderLeft: `3px solid ${roleInfo.color}` }}>
                    <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: k.is_active ? `${roleInfo.color}20` : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {k.is_active ? <Key size={14} color={roleInfo.color} /> : <Lock size={14} color="#f87171" />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {k.name}
                          <span style={pill(true, roleInfo.color)}>{roleInfo.label}</span>
                          {!k.is_active && <span style={pill(true, '#ef4444')}>REVOKED</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 12, color: '#4b5563', fontSize: 12, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                          <code style={{ color: '#6b7280', fontSize: 12 }}>{k.key_prefix}</code>
                          <span>{(Array.isArray(k.permissions) ? k.permissions : []).join(', ')}</span>
                          <span><Activity size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />{k.request_count || 0} requests</span>
                          {k.rows_returned > 0 && <span>{(k.rows_returned || 0).toLocaleString()} rows</span>}
                          {k.last_used_at && <span>Last used {new Date(k.last_used_at).toLocaleDateString()}</span>}
                          {k.expires_at && <span><Clock size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />Expires {new Date(k.expires_at).toLocaleDateString()}</span>}
                          {k.rate_limit_per_hour && <span><Zap size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />{k.rate_limit_per_hour}/hr limit</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => loadUsage(k.id)}
                          style={{ padding: '6px 10px', background: 'rgba(99,102,241,0.1)', border: 'none', borderRadius: 7, color: '#818cf8', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <BarChart2 size={12} /> {loadingUsage === k.id ? '…' : 'Usage'}
                        </button>
                        {k.is_active && (
                          <button onClick={() => revokeKey(k.id)}
                            style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 7, color: '#f87171', cursor: 'pointer', fontSize: 12 }}>Revoke</button>
                        )}
                      </div>
                    </div>

                    {/* Usage panel */}
                    {usage && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 18px', background: 'rgba(0,0,0,0.15)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: usage.narrative ? 12 : 0 }}>
                          {[
                            ['Total Requests', (usage.total_requests || 0).toLocaleString(), '#a5b4fc'],
                            ['Total Rows', (usage.total_rows || 0).toLocaleString(), '#34d399'],
                            ['Requests Today', (usage.requests_today || 0).toLocaleString(), '#fbbf24'],
                            ['Rows Today', (usage.rows_today || 0).toLocaleString(), '#f9a8d4'],
                          ].map(([lbl, val, col]) => (
                            <div key={lbl} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
                              <div style={{ color: '#4b5563', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>{lbl}</div>
                              <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        {usage.narrative && (
                          <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: '9px 12px' }}>
                            <div style={{ color: '#818cf8', fontSize: 10, fontWeight: 700, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}><Sparkles size={10} /> AI Summary</div>
                            <div style={{ color: '#d1d5db', fontSize: 12 }}>{usage.narrative}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ TAB: DOCS ════════════════════ */}
      {activeTab === 'docs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Authentication */}
          <div style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.18)', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#67e8f9', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><Globe size={13} /> Authentication</div>
            <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>Pass your key as a header (preferred) or query parameter. All endpoints return <code style={{ color: '#a5b4fc' }}>X-RateLimit-*</code> headers.</p>
            <pre style={{ background: 'rgba(0,0,0,0.35)', padding: 12, borderRadius: 8, color: '#a5b4fc', fontSize: 12, margin: 0 }}>
{`X-Api-Key: dap_your_key_here
— or —
?api_key=dap_your_key_here

Response headers:
  X-RateLimit-Limit: 250
  X-RateLimit-Remaining: 249
  X-RateLimit-Reset: 1746272400`}
            </pre>
          </div>

          {/* RBAC */}
          <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#818cf8', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><ShieldCheck size={13} /> RBAC — Key Roles & Permissions</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {Object.entries(ROLES).map(([roleId, r]) => (
                <div key={roleId} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: '10px 12px', borderLeft: `2px solid ${r.color}` }}>
                  <div style={{ color: r.color, fontWeight: 700, fontSize: 12 }}>{r.label}</div>
                  <div style={{ color: '#6b7280', fontSize: 11, margin: '3px 0 6px' }}>{r.desc}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.perms.map(p => <span key={p} style={{ ...pill(true, r.color), fontSize: 9 }}>{p}</span>)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Cursor pagination */}
          <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#34d399', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><GitBranch size={13} /> Cursor-Based Pagination</div>
            <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>Use <code style={{ color: '#a5b4fc' }}>next_cursor</code> from each response as the <code style={{ color: '#a5b4fc' }}>cursor</code> param in the next request. Scales to billions of rows without offset drift.</p>
            <pre style={{ background: 'rgba(0,0,0,0.35)', padding: 12, borderRadius: 8, color: '#d1d5db', fontSize: 12, margin: 0 }}>
{`GET /v1/datasets/1/data?limit=500
→ { "data": [...], "next_cursor": 500, "has_more": true }

GET /v1/datasets/1/data?limit=500&cursor=500
→ { "data": [...], "next_cursor": 1000, "has_more": true }

GET /v1/datasets/1/data?limit=500&cursor=1000
→ { "data": [...], "next_cursor": null, "has_more": false }`}
            </pre>
          </div>

          {/* Endpoints */}
          <div>
            <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Available Endpoints</div>
            {ENDPOINTS.map((e, i) => <EndpointDoc key={i} {...e} />)}
          </div>

          {/* Error codes */}
          <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#f87171', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><AlertTriangle size={13} /> Error Codes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ERROR_CODES.map(({ code, color, desc }) => (
                <div key={code} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <code style={{ color, fontSize: 11, fontWeight: 700, minWidth: 200, flexShrink: 0 }}>{code}</code>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>{desc}</span>
                </div>
              ))}
            </div>
            <pre style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, color: '#d1d5db', fontSize: 12, margin: '12px 0 0' }}>
{`// All errors follow this shape:
{
  "error": {
    "code":     "RATE_LIMIT_EXCEEDED",
    "message":  "Rate limit exceeded",
    "status":   429,
    "hint":     "Resets at 2026-05-03T14:00:00Z",
    "docs_url": "https://docs.dataanalystpro.com/api/errors"
  }
}`}
            </pre>
          </div>

          {/* Rate limits */}
          <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><Zap size={13} /> Rate Limits</div>
            <ul style={{ color: '#9ca3af', fontSize: 13, paddingLeft: 20, lineHeight: 1.9, margin: 0 }}>
              <li>Default: 1,000 requests/hour per key (configurable per key)</li>
              <li>Maximum 10,000 rows per dataset data request</li>
              <li>SQL queries must be read-only (SELECT / WITH only)</li>
              <li>Rate limit window: rolling 15-minute buckets</li>
              <li>Exceeded limit → <code style={{ color: '#a5b4fc' }}>429</code> with <code style={{ color: '#a5b4fc' }}>X-RateLimit-Reset</code> header</li>
            </ul>
          </div>

          {/* Governance */}
          <div style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#34d399', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><ShieldCheck size={13} /> Governance & Lineage</div>
            <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>
              Every data-access API call automatically writes a lineage event recording which key queried which dataset, how many rows were returned, and the UTC timestamp. These events appear in your Data Lineage page and compliance export.
            </p>
          </div>
        </div>
      )}

      {/* ════════════════════ TAB: SDKs ════════════════════ */}
      {activeTab === 'sdks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: 14 }}>
            <div style={{ color: '#a5b4fc', fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Lightweight client libraries</div>
            <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Copy the snippet below, replace <code style={{ color: '#fbbf24' }}>dap_your_key_here</code> with your actual key, and you're ready. All snippets handle cursor pagination automatically.</p>
          </div>

          {/* Language selector */}
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(SDK_LABELS).map(([lang, lbl]) => (
              <button key={lang} onClick={() => setSdkLang(lang)}
                style={{ padding: '7px 16px', borderRadius: 8, border: `2px solid ${sdkLang === lang ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: sdkLang === lang ? 'rgba(99,102,241,0.15)' : 'transparent', color: sdkLang === lang ? '#a5b4fc' : '#6b7280', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Code block */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{SDK_LABELS[sdkLang]}</span>
              <button onClick={() => copy(SDK_CODE[sdkLang], `sdk-${sdkLang}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: copiedId === `sdk-${sdkLang}` ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 6, color: copiedId === `sdk-${sdkLang}` ? '#34d399' : '#6b7280', cursor: 'pointer', fontSize: 12 }}>
                {copiedId === `sdk-${sdkLang}` ? <CheckCircle size={12} /> : <Copy size={12} />} Copy
              </button>
            </div>
            <pre style={{ padding: 20, margin: 0, color: '#d1d5db', fontSize: 12, fontFamily: 'Monaco, Menlo, monospace', overflowX: 'auto', lineHeight: 1.7, background: '#0d0d1a', maxHeight: 500, overflowY: 'auto' }}>
              {SDK_CODE[sdkLang]}
            </pre>
          </div>

          {/* Installation notes */}
          <div style={{ ...card, padding: 16 }}>
            <div style={{ color: '#f3f4f6', fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Installation</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {[
                { lang: '🐍 Python', cmd: 'pip install requests' },
                { lang: '📊 R',      cmd: 'install.packages(c("httr", "jsonlite"))' },
                { lang: '🟡 JavaScript', cmd: 'No install needed — uses native fetch' },
              ].map(({ lang, cmd }) => (
                <div key={lang} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: '10px 12px' }}>
                  <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, marginBottom: 5 }}>{lang}</div>
                  <code style={{ color: '#a5b4fc', fontSize: 11, fontFamily: 'monospace' }}>{cmd}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
