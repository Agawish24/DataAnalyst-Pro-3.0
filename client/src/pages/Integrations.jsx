import { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  GitBranch, Database, BarChart2, Search, Download, Upload, RefreshCw,
  CheckCircle2, XCircle, Plug, ExternalLink, File, FolderOpen,
  ChevronRight, ChevronDown, Loader, Key, User, Globe, Table
} from 'lucide-react';

const TABS = [
  { id: 'kaggle', label: 'Kaggle', icon: '🏆', color: '#20beff', desc: 'Import datasets from Kaggle' },
  { id: 'github', label: 'GitHub', icon: '🐙', color: '#f0f6ff', desc: 'Import files from GitHub repos' },
  { id: 'tableau', label: 'Tableau', icon: '📊', color: '#e8762c', desc: 'Export datasets to Tableau' },
  { id: 'bigquery', label: 'BigQuery', icon: '🔷', color: '#4285f4', desc: 'Google BigQuery connector' },
  { id: 'redshift', label: 'Redshift', icon: '🔴', color: '#8c4fff', desc: 'Amazon Redshift connector' },
];

const card = { background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 };
const input = { width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' };
const btn = (bg = '#6366f1', disabled = false) => ({ padding: '10px 20px', borderRadius: 8, border: 'none', background: disabled ? '#374151' : bg, color: 'white', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 });

function KaggleTab() {
  const [status, setStatus] = useState(null);
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(null);

  useEffect(() => { api.get('/kaggle/status').then(r => setStatus(r.data)).catch(() => {}); }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const r = await api.post('/kaggle/connect', { username, apiKey });
      setStatus({ connected: true, username: r.data.username });
      toast.success(`Connected as ${r.data.username}`);
    } catch (e) { toast.error(e.response?.data?.error || 'Connection failed'); }
    finally { setConnecting(false); }
  };

  const disconnect = async () => {
    await api.delete('/kaggle/disconnect');
    setStatus({ connected: false }); setResults([]);
    toast.success('Disconnected from Kaggle');
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await api.get('/kaggle/search', { params: { q: query } });
      setResults(r.data.datasets || []);
      if (!r.data.datasets?.length) toast('No datasets found', { icon: 'ℹ️' });
    } catch (e) { toast.error(e.response?.data?.error || 'Search failed'); }
    finally { setSearching(false); }
  };

  const importDs = async (ref, title) => {
    setImporting(ref);
    try {
      const r = await api.post('/kaggle/import', { datasetRef: ref });
      toast.success(`Imported "${r.data.name}" — ${r.data.rowCount.toLocaleString()} rows`);
    } catch (e) { toast.error(e.response?.data?.error || 'Import failed'); }
    finally { setImporting(null); }
  };

  const fmtSize = (b) => !b ? '?' : b > 1e9 ? `${(b/1e9).toFixed(1)} GB` : b > 1e6 ? `${(b/1e6).toFixed(1)} MB` : `${(b/1e3).toFixed(0)} KB`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              🏆 Kaggle Connection
              {status?.connected && <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '2px 10px', borderRadius: 20, fontSize: 12 }}>Connected as @{status.username}</span>}
            </div>
            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Connect with your Kaggle API key to search and import datasets</div>
          </div>
          {status?.connected && <button onClick={disconnect} style={{ ...btn('#374151'), fontSize: 12 }}><XCircle size={13} /> Disconnect</button>}
        </div>
        {!status?.connected ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>KAGGLE USERNAME</label>
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="your-username" style={input} />
            </div>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>API KEY</label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="xxxxxxxxxxxx" style={input} />
            </div>
            <button onClick={connect} disabled={connecting || !username || !apiKey} style={btn('#20beff', connecting || !username || !apiKey)}>
              {connecting ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plug size={14} />} Connect
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>SEARCH DATASETS</label>
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="e.g. titanic, iris, sales forecasting..." style={input} />
            </div>
            <button onClick={search} disabled={searching} style={btn('#20beff', searching)}>
              {searching ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />} Search
            </button>
          </div>
        )}
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(32,190,255,0.05)', border: '1px solid rgba(32,190,255,0.15)', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
          Get your API key from <a href="https://www.kaggle.com/settings/account" target="_blank" rel="noopener noreferrer" style={{ color: '#20beff' }}>kaggle.com/settings → API → Create New Token</a>
        </div>
      </div>

      {results.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontWeight: 600 }}>
            {results.length} Results for "{query}"
          </div>
          {results.map(ds => (
            <div key={ds.fullRef} style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{ds.title}</div>
                <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>by {ds.owner} · {fmtSize(ds.size)} · ⬇️ {(ds.downloadCount || 0).toLocaleString()} · ⭐ {(ds.voteCount || 0).toLocaleString()}</div>
                {ds.tags?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {ds.tags.slice(0, 4).map(t => <span key={t} style={{ background: 'rgba(32,190,255,0.1)', color: '#67e8f9', padding: '1px 7px', borderRadius: 8, fontSize: 11 }}>{t}</span>)}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <a href={ds.url} target="_blank" rel="noopener noreferrer" style={{ ...btn('rgba(255,255,255,0.08)'), textDecoration: 'none', fontSize: 12 }}><ExternalLink size={12} /> View</a>
                <button onClick={() => importDs(ds.fullRef, ds.title)} disabled={!!importing} style={btn('#20beff', !!importing)}>
                  {importing === ds.fullRef ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />} Import
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GitHubTab() {
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [query, setQuery] = useState('');
  const [repos, setRepos] = useState([]);
  const [searching, setSearching] = useState(false);
  const [expandedRepo, setExpandedRepo] = useState(null);
  const [repoFiles, setRepoFiles] = useState({});
  const [loadingFiles, setLoadingFiles] = useState(null);
  const [importing, setImporting] = useState(null);

  useEffect(() => { api.get('/github/status').then(r => setStatus(r.data)).catch(() => {}); }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const r = await api.post('/github/connect', { token });
      setStatus({ connected: true, user: r.data.user, name: r.data.name, avatar: r.data.avatar });
      toast.success(`Connected as @${r.data.user}`);
    } catch (e) { toast.error(e.response?.data?.error || 'Connection failed'); }
    finally { setConnecting(false); }
  };

  const disconnect = async () => {
    await api.delete('/github/disconnect');
    setStatus({ connected: false }); setRepos([]);
    toast.success('Disconnected from GitHub');
  };

  const search = async () => {
    setSearching(true);
    try {
      const r = await api.get('/github/search', { params: { q: query || 'datasets csv data' } });
      setRepos(r.data.repos || []);
    } catch (e) { toast.error(e.response?.data?.error || 'Search failed'); }
    finally { setSearching(false); }
  };

  const loadFiles = async (repo) => {
    if (expandedRepo === repo.full_name) { setExpandedRepo(null); return; }
    setExpandedRepo(repo.full_name);
    if (repoFiles[repo.full_name]) return;
    setLoadingFiles(repo.full_name);
    try {
      const r = await api.get(`/github/repos/${repo.owner}/${repo.name}/tree`);
      setRepoFiles(prev => ({ ...prev, [repo.full_name]: r.data.files || [] }));
    } catch (e) { toast.error('Could not load repo files'); }
    finally { setLoadingFiles(null); }
  };

  const importFile = async (repo, file) => {
    setImporting(file.path);
    try {
      const r = await api.post('/github/import', { owner: repo.owner, repo: repo.name, path: file.path });
      toast.success(`Imported "${r.data.name}" — ${r.data.rowCount.toLocaleString()} rows`);
    } catch (e) { toast.error(e.response?.data?.error || 'Import failed'); }
    finally { setImporting(null); }
  };

  const fmtSize = (b) => b > 1e3 ? `${(b/1e3).toFixed(0)} KB` : `${b} B`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              🐙 GitHub Connection
              {status?.connected && (
                <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '2px 10px', borderRadius: 20, fontSize: 12 }}>
                  {status.avatar && <img src={status.avatar} style={{ width: 14, height: 14, borderRadius: '50%', marginRight: 4, verticalAlign: 'middle' }} />}
                  @{status.user}
                </span>
              )}
            </div>
            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
              {status?.connected ? 'Search repos and import CSV/JSON files as datasets' : 'Connect with a Personal Access Token (PAT) to access private repos and higher rate limits'}
            </div>
          </div>
          {status?.connected && <button onClick={disconnect} style={{ ...btn('#374151'), fontSize: 12 }}><XCircle size={13} /> Disconnect</button>}
        </div>
        {!status?.connected ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>PERSONAL ACCESS TOKEN (optional for public repos)</label>
              <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="ghp_xxxxxxxxxxxx (leave blank for public repos)" style={input} />
            </div>
            <button onClick={connect} disabled={connecting} style={btn('#24292f', connecting)}>
              {connecting ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <GitBranch size={14} />} Connect
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>SEARCH REPOSITORIES</label>
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="e.g. datasets, machine-learning, titanic..." style={input} />
            </div>
            <button onClick={search} disabled={searching} style={btn('#24292f', searching)}>
              {searching ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />} Search
            </button>
          </div>
        )}
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
          Create a token at <a href="https://github.com/settings/tokens/new?scopes=repo,read:user" target="_blank" rel="noopener noreferrer" style={{ color: '#a5b4fc' }}>github.com/settings/tokens</a> — select <strong style={{ color: '#d1d5db' }}>repo</strong> scope for private repos
        </div>
      </div>

      {repos.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontWeight: 600 }}>
            {repos.length} Repositories
          </div>
          {repos.map(repo => (
            <div key={repo.full_name}>
              <div onClick={() => loadFiles(repo)} style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {expandedRepo === repo.full_name ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
                  <img src={repo.avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                  <div>
                    <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 13 }}>{repo.full_name}</div>
                    {repo.description && <div style={{ color: '#6b7280', fontSize: 11, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.description}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, color: '#6b7280', fontSize: 12, flexShrink: 0 }}>
                  {repo.language && <span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', padding: '1px 8px', borderRadius: 8 }}>{repo.language}</span>}
                  <span>⭐ {(repo.stars || 0).toLocaleString()}</span>
                </div>
              </div>
              {expandedRepo === repo.full_name && (
                <div style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {loadingFiles === repo.full_name ? (
                    <div style={{ padding: '16px 28px', color: '#6b7280', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Scanning for data files...</div>
                  ) : !repoFiles[repo.full_name]?.length ? (
                    <div style={{ padding: '16px 28px', color: '#6b7280', fontSize: 13 }}>No CSV or JSON files found in this repository</div>
                  ) : (
                    repoFiles[repo.full_name].map(file => (
                      <div key={file.path} style={{ padding: '8px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <File size={12} color="#6b7280" />
                          <span style={{ color: '#d1d5db', fontSize: 13, fontFamily: 'monospace' }}>{file.path}</span>
                          {file.size && <span style={{ color: '#4b5563', fontSize: 11 }}>{fmtSize(file.size)}</span>}
                        </div>
                        <button onClick={() => importFile(repo, file)} disabled={importing === file.path} style={{ ...btn('#10b981', importing === file.path), padding: '5px 12px', fontSize: 12 }}>
                          {importing === file.path ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />} Import
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TableauTab() {
  const [datasets, setDatasets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => { api.get('/tableau/datasets').then(r => setDatasets(r.data)).catch(() => {}); }, []);

  const loadPreview = async (ds) => {
    setSelected(ds);
    setLoadingPreview(true);
    try {
      const r = await api.get(`/tableau/export/${ds.id}/preview`);
      setPreview(r.data);
    } catch (e) { toast.error('Failed to load export info'); }
    finally { setLoadingPreview(false); }
  };

  const doExport = (id, fmt) => {
    const token = localStorage.getItem('token');
    const url = `${window.location.origin}/api/tableau/export/${id}/${fmt}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const ext = fmt === 'csv' ? '.csv' : fmt === 'twb' ? '.twb' : '.tds';
        const name = (selected?.name || 'dataset').replace(/[^a-zA-Z0-9_]/g, '_') + ext;
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = u; a.download = name; a.click();
        URL.revokeObjectURL(u);
        toast.success(`Downloaded ${name}`);
      }).catch(() => toast.error('Export failed'));
  };

  const EXPORT_INFO = {
    csv: { icon: '📄', color: '#10b981', title: 'CSV Data File', desc: 'Connect directly in Tableau Desktop via "Text File" connector', steps: ['Open Tableau Desktop', 'Connect → Text File', 'Select the downloaded .csv'] },
    twb: { icon: '📗', color: '#e8762c', title: 'Tableau Workbook (.twb)', desc: 'Full workbook with data source definition. Open directly in Tableau.', steps: ['Open Tableau Desktop', 'File → Open', 'Select the downloaded .twb', 'Reconnect to the CSV when prompted'] },
    tds: { icon: '🔌', color: '#4285f4', title: 'Tableau Data Source (.tds)', desc: 'Reusable data source — save to your Repository for use in multiple workbooks', steps: ['Download the .csv file first', 'Copy .tds to My Tableau Repository/Datasources', 'Connect to it from any workbook'] },
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, padding: '0 4px' }}>Your Datasets</div>
        {datasets.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: 32 }}>
            <Database size={32} color="#374151" style={{ margin: '0 auto 10px', display: 'block' }} />
            <p style={{ color: '#6b7280', fontSize: 13 }}>No datasets yet. Import data first.</p>
          </div>
        ) : datasets.map(ds => (
          <div key={ds.id} onClick={() => loadPreview(ds)}
            style={{ ...card, cursor: 'pointer', padding: 14, border: `1px solid ${selected?.id === ds.id ? '#e8762c' : 'rgba(255,255,255,0.08)'}`, background: selected?.id === ds.id ? 'rgba(232,118,44,0.08)' : '#13131f' }}>
            <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 13 }}>{ds.name}</div>
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 3 }}>{(ds.row_count || 0).toLocaleString()} rows · {Object.keys(ds.schema || {}).length} cols</div>
          </div>
        ))}
      </div>

      <div>
        {!selected ? (
          <div style={{ ...card, textAlign: 'center', padding: 80 }}>
            <span style={{ fontSize: 60, display: 'block', marginBottom: 16 }}>📊</span>
            <p style={{ color: '#6b7280' }}>Select a dataset to export it to Tableau</p>
          </div>
        ) : loadingPreview ? (
          <div style={{ ...card, textAlign: 'center', padding: 60 }}>
            <Loader size={32} color="#6b7280" style={{ margin: '0 auto 12px', display: 'block', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#6b7280' }}>Loading export options...</p>
          </div>
        ) : preview ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{preview.name}</div>
              <div style={{ color: '#6b7280', fontSize: 13 }}>{(preview.rowCount || 0).toLocaleString()} rows · {preview.columns?.length} columns</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {preview.columns?.slice(0, 8).map(c => (
                  <span key={c.name} style={{ background: c.numeric ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)', color: c.numeric ? '#34d399' : '#818cf8', padding: '2px 9px', borderRadius: 8, fontSize: 11 }}>
                    {c.name} <span style={{ opacity: 0.6 }}>({c.numeric ? 'num' : 'str'})</span>
                  </span>
                ))}
                {preview.columns?.length > 8 && <span style={{ color: '#4b5563', fontSize: 11, padding: '2px 6px' }}>+{preview.columns.length - 8} more</span>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {['csv', 'twb', 'tds'].map(fmt => {
                const info = EXPORT_INFO[fmt];
                return (
                  <div key={fmt} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{info.icon}</div>
                      <div style={{ color: info.color, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{info.title}</div>
                      <div style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.5 }}>{info.desc}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 12 }}>
                      <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>HOW TO USE</div>
                      {info.steps.map((s, i) => (
                        <div key={i} style={{ color: '#9ca3af', fontSize: 11, padding: '3px 0', display: 'flex', gap: 6 }}>
                          <span style={{ color: info.color, fontWeight: 700 }}>{i + 1}.</span> {s}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => doExport(preview.name ? selected.id : null, fmt)} style={{ ...btn(info.color), justifyContent: 'center', marginTop: 'auto' }}>
                      <Download size={14} /> Download {fmt.toUpperCase()}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConnectorGuide({ type }) {
  const guides = {
    bigquery: {
      color: '#4285f4', icon: '🔷', title: 'Google BigQuery',
      steps: [
        { n: 1, title: 'Create a Service Account', detail: 'In Google Cloud Console → IAM & Admin → Service Accounts → Create service account with BigQuery Data Viewer + BigQuery Job User roles' },
        { n: 2, title: 'Download JSON Key File', detail: 'Click your service account → Keys → Add Key → Create new key → JSON. Download the file.' },
        { n: 3, title: 'Add BigQuery Connector', detail: 'Go to DB Connectors → Add Connector → BigQuery. Enter your Project ID and paste the full JSON key file contents.' },
        { n: 4, title: 'Query Your Data', detail: 'Browse tables in the schema browser and run SELECT queries against BigQuery directly from the SQL Editor.' },
      ],
      fields: [
        { label: 'Project ID', example: 'my-gcp-project-123', desc: 'Your GCP project ID (shown in Google Cloud Console header)' },
        { label: 'Key File Content', example: '{ "type": "service_account", "project_id": "...", ... }', desc: 'The entire contents of the downloaded JSON key file' },
        { label: 'Default Dataset (optional)', example: 'my_dataset', desc: 'Default dataset to use in queries (can omit for fully-qualified queries)' },
      ]
    },
    redshift: {
      color: '#8c4fff', icon: '🔴', title: 'Amazon Redshift',
      steps: [
        { n: 1, title: 'Find Your Redshift Endpoint', detail: 'In AWS Console → Redshift → Clusters → Click your cluster → Endpoint (e.g., cluster.xxxx.region.redshift.amazonaws.com)' },
        { n: 2, title: 'Configure Security Group', detail: 'Ensure your Redshift cluster\'s Security Group allows inbound TCP on port 5439 from this application\'s IP' },
        { n: 3, title: 'Add Redshift Connector', detail: 'Go to DB Connectors → Add Connector → Amazon Redshift. Enter host, port (5439), database, username, and password.' },
        { n: 4, title: 'Query Your Data', detail: 'Redshift is PostgreSQL-compatible — all SQL features work. Use the schema browser to explore tables.' },
      ],
      fields: [
        { label: 'Host', example: 'cluster.xxxx.us-east-1.redshift.amazonaws.com', desc: 'Your cluster endpoint (without port)' },
        { label: 'Port', example: '5439', desc: 'Default Redshift port is 5439 (not 5432)' },
        { label: 'Database', example: 'dev', desc: 'Database name (default is "dev")' },
        { label: 'User / Password', example: 'admin / ••••', desc: 'Your Redshift master user credentials' },
      ]
    }
  };

  const g = guides[type];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, borderColor: `${g.color}40` }}>
        <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 18, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>{g.icon}</span> {g.title} Setup Guide
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {g.steps.map(step => (
            <div key={step.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${g.color}22`, border: `2px solid ${g.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: g.color, fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 2 }}>{step.n}</div>
              <div>
                <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{step.title}</div>
                <div style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.5 }}>{step.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 14 }}>Connection Fields Reference</div>
        {g.fields.map(f => (
          <div key={f.label} style={{ marginBottom: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{f.label}</div>
            <code style={{ color: g.color, fontSize: 12, background: `${g.color}10`, padding: '2px 8px', borderRadius: 4 }}>{f.example}</code>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, borderColor: `${g.color}30`, background: `${g.color}08` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 4 }}>Ready to connect?</div>
            <div style={{ color: '#9ca3af', fontSize: 13 }}>Go to DB Connectors and add a {g.title} connector with the details above</div>
          </div>
          <a href="/connectors" style={{ ...btn(g.color), textDecoration: 'none' }}><Plug size={14} /> Open DB Connectors</a>
        </div>
      </div>
    </div>
  );
}

export default function Integrations() {
  const [activeTab, setActiveTab] = useState('kaggle');

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Plug size={26} color="#6366f1" /> Integrations
        </h1>
        <p style={{ color: '#9ca3af', margin: 0 }}>Connect to Kaggle, GitHub, Tableau, BigQuery, Redshift and more</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ flex: 1, padding: '10px 8px', border: 'none', borderRadius: 8, cursor: 'pointer', background: activeTab === tab.id ? `${tab.color}18` : 'transparent', color: activeTab === tab.id ? tab.color : '#6b7280', fontWeight: activeTab === tab.id ? 700 : 400, fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.15s', outline: activeTab === tab.id ? `1px solid ${tab.color}50` : 'none' }}>
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            <span>{tab.label}</span>
            <span style={{ fontSize: 10, color: activeTab === tab.id ? `${tab.color}99` : '#4b5563', fontWeight: 400 }}>{tab.desc}</span>
          </button>
        ))}
      </div>

      {activeTab === 'kaggle' && <KaggleTab />}
      {activeTab === 'github' && <GitHubTab />}
      {activeTab === 'tableau' && <TableauTab />}
      {activeTab === 'bigquery' && <ConnectorGuide type="bigquery" />}
      {activeTab === 'redshift' && <ConnectorGuide type="redshift" />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
