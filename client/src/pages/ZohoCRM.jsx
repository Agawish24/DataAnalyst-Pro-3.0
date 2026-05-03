import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  Building2, Users, TrendingUp, Briefcase, RefreshCw,
  CheckCircle2, XCircle, ExternalLink, LogOut, Search,
  ChevronLeft, ChevronRight, Loader2, Globe,
} from 'lucide-react';

const TABS = [
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'leads',    label: 'Leads',    icon: TrendingUp },
  { id: 'deals',    label: 'Deals',    icon: Briefcase },
  { id: 'accounts', label: 'Accounts', icon: Building2 },
];

const DEAL_STAGE_COLORS = {
  'Qualification': '#6366f1', 'Needs Analysis': '#8b5cf6', 'Value Proposition': '#a78bfa',
  'Identify Decision Makers': '#f59e0b', 'Perception Analysis': '#f97316',
  'Proposal/Price Quote': '#3b82f6', 'Negotiation/Review': '#ec4899',
  'Closed Won': '#10b981', 'Closed Lost': '#ef4444',
};

export default function ZohoCRM() {
  const [searchParams] = useSearchParams();
  const [status, setStatus]       = useState(null);
  const [org, setOrg]             = useState(null);
  const [activeTab, setActiveTab] = useState('contacts');
  const [data, setData]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(false);
  const [search, setSearch]       = useState('');
  const [searchInput, setSearchInput] = useState('');

  const checkStatus = useCallback(async () => {
    try {
      const r = await api.get('/zoho/status');
      setStatus(r.data);
      if (r.data.connected) {
        api.get('/zoho/org').then(o => setOrg(o.data)).catch(() => {});
      }
    } catch { setStatus({ connected: false }); }
  }, []);

  useEffect(() => {
    checkStatus();
    if (searchParams.get('connected') === '1') toast.success('Zoho CRM connected successfully!');
    if (searchParams.get('error')) toast.error(`Zoho error: ${searchParams.get('error')}`);
  }, [checkStatus, searchParams]);

  const loadData = useCallback(async (tab, pg, q) => {
    if (!status?.connected) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, per_page: 50 });
      if (q && tab === 'contacts') params.set('search', q);
      const r = await api.get(`/zoho/${tab}?${params}`);
      setData(r.data.data || []);
      setHasMore(r.data.info?.more_records === true);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load data');
      setData([]);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => {
    if (status?.connected) { setPage(1); loadData(activeTab, 1, search); }
  }, [activeTab, status, search]);

  useEffect(() => {
    if (status?.connected) loadData(activeTab, page, search);
  }, [page]);

  const connect = () => {
    setConnecting(true);
    const token = localStorage.getItem('token');
    const url = token ? `/api/zoho/connect?token=${encodeURIComponent(token)}` : '/api/zoho/connect';
    window.location.href = url;
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Zoho CRM?')) return;
    await api.post('/zoho/disconnect');
    setStatus({ connected: false });
    setData([]); setOrg(null);
    toast.success('Disconnected from Zoho');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!status) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
      <Loader2 size={28} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  );

  if (!status.connected) return (
    <div style={{ padding: 32, maxWidth: 560, margin: '60px auto' }}>
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 40, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, background: 'linear-gradient(135deg,#e31e24,#c41a1f)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Globe size={34} color="#fff" />
        </div>
        <h2 style={{ color: '#f3f4f6', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Connect to Zoho CRM</h2>
        <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
          Access your Contacts, Leads, Deals and Accounts directly inside DataAnalyst Pro.
          Uses OAuth 2.0 — your credentials are never stored.
        </p>

        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginBottom: 24, textAlign: 'left' }}>
          <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>What you need to add in Zoho Developer Console</div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#a78bfa', background: 'rgba(99,102,241,0.08)', padding: '10px 14px', borderRadius: 8, wordBreak: 'break-all', userSelect: 'all' }}>
            {window.location.origin}/api/zoho/callback
          </div>
          <div style={{ color: '#4b5563', fontSize: 11, marginTop: 8 }}>
            Add the URL above as an <strong style={{ color: '#6b7280' }}>Authorized Redirect URI</strong> in your Zoho API Console app settings
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {[['Contacts', Users], ['Leads', TrendingUp], ['Deals', Briefcase], ['Accounts', Building2]].map(([label, Icon]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
              <Icon size={14} color="#10b981" />
              <span style={{ color: '#d1d5db', fontSize: 13 }}>{label}</span>
            </div>
          ))}
        </div>

        <button onClick={connect} disabled={connecting}
          style={{ width: '100%', padding: '14px', background: connecting ? 'rgba(227,30,36,0.3)' : '#e31e24', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {connecting ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Connecting…</> : <><ExternalLink size={16} /> Connect Zoho CRM</>}
        </button>
      </div>
    </div>
  );

  // ── Connected — data view ──────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: '#f3f4f6', fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, background: '#e31e24', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={16} color="#fff" />
            </div>
            Zoho CRM
          </h1>
          {org && (
            <div style={{ color: '#9ca3af', fontSize: 13 }}>
              {org.company_name || org.name} · {org.country || ''} ·{' '}
              <span style={{ color: '#10b981' }}>
                <CheckCircle2 size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />Connected
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => loadData(activeTab, page, search)} disabled={loading}
            style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#d1d5db', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
          <button onClick={disconnect}
            style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <LogOut size={13} /> Disconnect
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4 }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: activeTab === id ? '#e31e24' : 'transparent', color: activeTab === id ? '#fff' : '#9ca3af', transition: 'all 0.15s' }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* Search (contacts only for now) */}
      {activeTab === 'contacts' && (
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search contacts by name…"
              style={{ width: '100%', padding: '9px 14px 9px 34px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <button type="submit" style={{ padding: '9px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Search</button>
          {search && <button type="button" onClick={() => { setSearch(''); setSearchInput(''); }} style={{ padding: '9px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', fontSize: 13 }}>Clear</button>}
        </form>
      )}

      {/* Data table */}
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={28} color="#6366f1" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
            <div style={{ color: '#6b7280', fontSize: 14 }}>Loading {activeTab}…</div>
          </div>
        ) : data.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#4b5563' }}>
            {TABS.find(t => t.id === activeTab)?.icon && (() => { const Icon = TABS.find(t => t.id === activeTab).icon; return <Icon size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />; })()}
            <div>No {activeTab} found{search ? ` for "${search}"` : ''}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {activeTab === 'contacts' && ['Name','Email','Phone','Account','Source','Created'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', color: '#6b7280', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                  {activeTab === 'leads' && ['Name','Company','Email','Phone','Status','Revenue','Created'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', color: '#6b7280', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                  {activeTab === 'deals' && ['Deal Name','Account','Amount','Stage','Close Date','Probability','Created'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', color: '#6b7280', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                  {activeTab === 'accounts' && ['Account','Industry','Phone','Website','Revenue','Employees','Created'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', color: '#6b7280', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={row.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>

                    {activeTab === 'contacts' && <>
                      <td style={{ padding: '11px 14px', color: '#f3f4f6', fontWeight: 500 }}>{[row.First_Name, row.Last_Name].filter(Boolean).join(' ') || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#9ca3af' }}>{row.Email || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#9ca3af' }}>{row.Phone || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#d1d5db' }}>{row.Account_Name?.name || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#6b7280' }}>{row.Lead_Source || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#4b5563', fontSize: 12 }}>{row.Created_Time ? new Date(row.Created_Time).toLocaleDateString() : '—'}</td>
                    </>}

                    {activeTab === 'leads' && <>
                      <td style={{ padding: '11px 14px', color: '#f3f4f6', fontWeight: 500 }}>{[row.First_Name, row.Last_Name].filter(Boolean).join(' ') || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#d1d5db' }}>{row.Company || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#9ca3af' }}>{row.Email || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#9ca3af' }}>{row.Phone || '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: row.Lead_Status === 'Converted' ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)', color: row.Lead_Status === 'Converted' ? '#10b981' : '#a78bfa' }}>
                          {row.Lead_Status || 'New'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', color: '#10b981', fontWeight: 500 }}>{row.Annual_Revenue != null ? `$${Number(row.Annual_Revenue).toLocaleString()}` : '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#4b5563', fontSize: 12 }}>{row.Created_Time ? new Date(row.Created_Time).toLocaleDateString() : '—'}</td>
                    </>}

                    {activeTab === 'deals' && <>
                      <td style={{ padding: '11px 14px', color: '#f3f4f6', fontWeight: 500 }}>{row.Deal_Name || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#d1d5db' }}>{row.Account_Name?.name || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#10b981', fontWeight: 600 }}>{row.Amount != null ? `$${Number(row.Amount).toLocaleString()}` : '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${DEAL_STAGE_COLORS[row.Stage] || '#6b7280'}22`, color: DEAL_STAGE_COLORS[row.Stage] || '#9ca3af' }}>
                          {row.Stage || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', color: '#9ca3af' }}>{row.Closing_Date || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#d1d5db' }}>{row.Probability != null ? `${row.Probability}%` : '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#4b5563', fontSize: 12 }}>{row.Created_Time ? new Date(row.Created_Time).toLocaleDateString() : '—'}</td>
                    </>}

                    {activeTab === 'accounts' && <>
                      <td style={{ padding: '11px 14px', color: '#f3f4f6', fontWeight: 500 }}>{row.Account_Name || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#9ca3af' }}>{row.Industry || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#9ca3af' }}>{row.Phone || '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        {row.Website ? <a href={row.Website.startsWith('http') ? row.Website : `https://${row.Website}`} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>{row.Website} <ExternalLink size={10} /></a> : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', color: '#10b981', fontWeight: 500 }}>{row.Annual_Revenue != null ? `$${Number(row.Annual_Revenue).toLocaleString()}` : '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#d1d5db' }}>{row.Employees != null ? Number(row.Employees).toLocaleString() : '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#4b5563', fontSize: 12 }}>{row.Created_Time ? new Date(row.Created_Time).toLocaleDateString() : '—'}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && data.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280', fontSize: 13 }}>Page {page} · {data.length} records</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: page === 1 ? '#4b5563' : '#d1d5db', cursor: page === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                <ChevronLeft size={14} /> Prev
              </button>
              <button onClick={() => setPage(p => p + 1)} disabled={!hasMore}
                style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: !hasMore ? '#4b5563' : '#d1d5db', cursor: !hasMore ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
