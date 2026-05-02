import { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { RefreshCw, CheckCircle2, XCircle, Download, Search, Building2, Users, Briefcase, ExternalLink, Loader, Plug } from 'lucide-react';

const card = { background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 };
const input = { width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' };
const btn = (bg = '#6366f1', disabled = false) => ({ padding: '10px 18px', borderRadius: 8, border: 'none', background: disabled ? '#374151' : bg, color: 'white', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 });

const TABS = ['hubspot', 'salesforce'];

function HubSpotTab() {
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [activeObject, setActiveObject] = useState('contacts');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(null);

  useEffect(() => { api.get('/crm/hubspot/status').then(r => setStatus(r.data)).catch(() => {}); }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      await api.post('/crm/hubspot/connect', { token });
      setStatus({ connected: true });
      toast.success('Connected to HubSpot');
    } catch (e) { toast.error(e.response?.data?.error || 'Connection failed'); }
    finally { setConnecting(false); }
  };

  const disconnect = async () => {
    await api.delete('/crm/hubspot/disconnect');
    setStatus({ connected: false }); setRecords([]);
    toast.success('Disconnected');
  };

  const fetch_ = async (obj) => {
    setActiveObject(obj); setLoading(true);
    try {
      const r = await api.get(`/crm/hubspot/${obj}`);
      setRecords(r.data.records || []);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to fetch'); }
    finally { setLoading(false); }
  };

  const import_ = async (obj) => {
    setImporting(obj);
    try {
      const r = await api.post(`/crm/hubspot/import/${obj}`);
      toast.success(`Imported ${r.data.rowCount} ${obj} as dataset "${r.data.name}"`);
    } catch (e) { toast.error(e.response?.data?.error || 'Import failed'); }
    finally { setImporting(null); }
  };

  const OBJ_ICONS = { contacts: <Users size={14} />, deals: <Briefcase size={14} />, companies: <Building2 size={14} /> };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              🟠 HubSpot CRM
              {status?.connected && <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '2px 10px', borderRadius: 20, fontSize: 12 }}>Connected</span>}
            </div>
            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Import contacts, deals, and companies from HubSpot into datasets</div>
          </div>
          {status?.connected && <button onClick={disconnect} style={{ ...btn('#374151'), fontSize: 12 }}><XCircle size={13} /> Disconnect</button>}
        </div>

        {!status?.connected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>PRIVATE APP ACCESS TOKEN</label>
              <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="pat-na1-xxxxxxxxxxxx" style={input} />
            </div>
            <button onClick={connect} disabled={connecting || !token} style={btn('#ff7a59', connecting || !token)}>
              {connecting ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plug size={14} />} Connect to HubSpot
            </button>
            <div style={{ padding: '10px 14px', background: 'rgba(255,122,89,0.07)', border: '1px solid rgba(255,122,89,0.2)', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
              Create a Private App at <a href="https://app.hubspot.com/private-apps" target="_blank" rel="noopener noreferrer" style={{ color: '#ff7a59' }}>HubSpot → Settings → Integrations → Private Apps</a>.
              Grant scopes: <code style={{ color: '#fbbf24' }}>crm.objects.contacts.read</code>, <code style={{ color: '#fbbf24' }}>crm.objects.deals.read</code>, <code style={{ color: '#fbbf24' }}>crm.objects.companies.read</code>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['contacts', 'deals', 'companies'].map(obj => (
                <div key={obj} style={{ flex: 1, display: 'flex', gap: 6 }}>
                  <button onClick={() => fetch_(obj)} style={{ ...btn(activeObject === obj ? '#ff7a59' : '#374151'), flex: 1, justifyContent: 'center', fontSize: 12 }}>
                    {OBJ_ICONS[obj]} {obj.charAt(0).toUpperCase() + obj.slice(1)}
                  </button>
                  <button onClick={() => import_(obj)} disabled={!!importing} title={`Import ${obj} as dataset`}
                    style={{ ...btn('#10b981', !!importing), padding: '10px 12px', fontSize: 12 }}>
                    {importing === obj ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />}
                  </button>
                </div>
              ))}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}><Loader size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto' }} /></div>
            ) : records.length > 0 ? (
              <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: 11, display: 'flex', gap: 8 }}>
                  {Object.keys(records[0]).slice(0, 5).map(k => <span key={k} style={{ flex: 1, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</span>)}
                </div>
                {records.slice(0, 8).map((rec, i) => (
                  <div key={rec.id || i} style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 8 }}>
                    {Object.values(rec).slice(0, 5).map((v, ci) => <span key={ci} style={{ flex: 1, color: '#d1d5db', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '—'}</span>)}
                  </div>
                ))}
                {records.length > 8 && <div style={{ padding: '8px 14px', color: '#4b5563', fontSize: 11 }}>+{records.length - 8} more records</div>}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 32, color: '#6b7280', fontSize: 13 }}>
                Click a button above to fetch and preview your HubSpot data
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SalesforceTab() {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', securityToken: '', sandbox: false });
  const [connecting, setConnecting] = useState(false);
  const [soql, setSoql] = useState('SELECT Id, Name, Email, Phone, Title, Account.Name FROM Contact LIMIT 100');
  const [results, setResults] = useState(null);
  const [querying, setQuerying] = useState(false);

  useEffect(() => { api.get('/crm/salesforce/status').then(r => setStatus(r.data)).catch(() => {}); }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const r = await api.post('/crm/salesforce/connect', form);
      setStatus({ connected: true, instanceUrl: r.data.instanceUrl });
      toast.success(`Connected to Salesforce: ${r.data.instanceUrl}`);
    } catch (e) { toast.error(e.response?.data?.error || 'Salesforce login failed'); }
    finally { setConnecting(false); }
  };

  const disconnect = async () => {
    await api.delete('/crm/salesforce/disconnect');
    setStatus({ connected: false }); setResults(null);
    toast.success('Disconnected');
  };

  const query = async () => {
    setQuerying(true);
    try {
      const r = await api.post('/crm/salesforce/query', { soql });
      setResults(r.data);
    } catch (e) { toast.error(e.response?.data?.error || 'Query failed'); }
    finally { setQuerying(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              ☁️ Salesforce
              {status?.connected && <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '2px 10px', borderRadius: 20, fontSize: 12 }}>Connected · {status.instanceUrl?.replace('https://', '')}</span>}
            </div>
            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Query Salesforce objects with SOQL and import results as datasets</div>
          </div>
          {status?.connected && <button onClick={disconnect} style={{ ...btn('#374151'), fontSize: 12 }}><XCircle size={13} /> Disconnect</button>}
        </div>

        {!status?.connected ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>USERNAME</label>
              <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="user@company.com" style={input} />
            </div>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>PASSWORD</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" style={input} />
            </div>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>SECURITY TOKEN</label>
              <input value={form.securityToken} onChange={e => setForm(f => ({ ...f, securityToken: e.target.value }))} placeholder="Token from Salesforce settings" style={input} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#9ca3af', fontSize: 13 }}>
                <input type="checkbox" checked={form.sandbox} onChange={e => setForm(f => ({ ...f, sandbox: e.target.checked }))} /> Use Sandbox (test.salesforce.com)
              </label>
              <button onClick={connect} disabled={connecting || !form.username || !form.password} style={btn('#1798c1', connecting || !form.username || !form.password)}>
                {connecting ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plug size={14} />} Connect
              </button>
            </div>
            <div style={{ gridColumn: '1/-1', padding: '10px 14px', background: 'rgba(23,152,193,0.07)', border: '1px solid rgba(23,152,193,0.2)', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
              Get your Security Token from <strong style={{ color: '#d1d5db' }}>Salesforce → Settings → Personal → Reset My Security Token</strong>. Append it to your password when logging in from untrusted IPs.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>SOQL QUERY</label>
              <textarea value={soql} onChange={e => setSoql(e.target.value)} rows={3}
                style={{ ...input, fontFamily: 'monospace', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={query} disabled={querying} style={btn('#1798c1', querying)}>
                {querying ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />} Run Query
              </button>
            </div>
            {results && (
              <div>
                <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>{results.totalSize?.toLocaleString()} records</div>
                {results.records?.length > 0 && (
                  <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'auto' }}>
                    <div style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.04)', display: 'flex', gap: 12 }}>
                      {Object.keys(results.records[0]).slice(0, 5).map(k => <span key={k} style={{ flex: 1, color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{k}</span>)}
                    </div>
                    {results.records.slice(0, 8).map((rec, i) => (
                      <div key={i} style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 12 }}>
                        {Object.values(rec).slice(0, 5).map((v, ci) => <span key={ci} style={{ flex: 1, color: '#d1d5db', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(v || '—')}</span>)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ ...card, background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.2)' }}>
        <div style={{ color: '#818cf8', fontWeight: 600, marginBottom: 8 }}>Useful SOQL Queries</div>
        {[
          'SELECT Id, Name, Email, Phone, Title FROM Contact LIMIT 200',
          'SELECT Id, Name, StageName, Amount, CloseDate FROM Opportunity WHERE StageName = \'Closed Won\'',
          'SELECT Id, Name, Industry, AnnualRevenue, NumberOfEmployees FROM Account LIMIT 200',
          'SELECT Id, Subject, Status, Priority, CreatedDate FROM Case ORDER BY CreatedDate DESC LIMIT 100',
        ].map(q => (
          <div key={q} onClick={() => setSoql(q)} style={{ padding: '6px 10px', margin: '3px 0', background: 'rgba(255,255,255,0.03)', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}>
            {q}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CRMIntegration() {
  const [activeTab, setActiveTab] = useState('hubspot');

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Building2 size={24} color="#6366f1" /> CRM Integration
        </h1>
        <p style={{ color: '#6b7280', margin: 0 }}>Connect to HubSpot or Salesforce to pull CRM data directly into your analysis pipeline</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {[{ id: 'hubspot', label: '🟠 HubSpot', color: '#ff7a59' }, { id: 'salesforce', label: '☁️ Salesforce', color: '#1798c1' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: '10px 24px', border: 'none', borderRadius: 8, cursor: 'pointer', background: activeTab === tab.id ? `${tab.color}20` : 'transparent', color: activeTab === tab.id ? tab.color : '#6b7280', fontWeight: activeTab === tab.id ? 700 : 400, fontSize: 14, outline: activeTab === tab.id ? `1px solid ${tab.color}50` : 'none' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'hubspot' && <HubSpotTab />}
      {activeTab === 'salesforce' && <SalesforceTab />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
