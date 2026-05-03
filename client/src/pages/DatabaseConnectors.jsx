import { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  Database, Plus, Play, Trash2, CheckCircle2, XCircle, RefreshCw,
  Globe, Code2, FlaskConical, ToggleLeft, ToggleRight, ChevronRight, Info
} from 'lucide-react';

const COLORS = {
  postgresql: '#336791', mysql: '#f29111', snowflake: '#29b5e8',
  bigquery: '#4285f4', redshift: '#8c4fff', csv_url: '#10b981',
};

const DEMO_SQL = {
  mysql:      'SELECT * FROM orders LIMIT 10',
  postgresql: 'SELECT * FROM users LIMIT 10',
  bigquery:   'SELECT * FROM analytics.pageviews LIMIT 10',
  redshift:   'SELECT * FROM public.fact_sales LIMIT 10',
  snowflake:  'SELECT * FROM SALES.TRANSACTIONS LIMIT 10',
  csv_url:    'SELECT * FROM csv_data LIMIT 10',
};

const inp = {
  width: '100%', background: '#13131f',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
  color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box',
};

export default function DatabaseConnectors() {
  const [connectors, setConnectors] = useState([]);
  const [types, setTypes] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [querySQL, setQuerySQL] = useState('SELECT * FROM orders LIMIT 10');
  const [queryResult, setQueryResult] = useState(null);
  const [schema, setSchema] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'mysql', config: {}, demo: false });
  const [testing, setTesting] = useState(null);
  const [running, setRunning] = useState(false);
  const [togglingDemo, setTogglingDemo] = useState(null);

  useEffect(() => { load(); loadTypes(); }, []);

  const load = async () => {
    try { const r = await api.get('/connectors'); setConnectors(r.data); } catch {}
  };
  const loadTypes = async () => {
    try { const r = await api.get('/connectors/types'); setTypes(r.data); } catch {}
  };

  const create = async () => {
    if (!form.name || !form.type) return toast.error('Name and type required');
    try {
      const payload = { name: form.name, type: form.type, config: { ...form.config, ...(form.demo ? { demo: true } : {}) } };
      const r = await api.post('/connectors', payload);
      const ok = r.data.testResult?.ok;
      if (ok) toast.success(r.data.demo_mode ? `"${form.name}" created in demo mode` : `"${form.name}" connected successfully`);
      else toast.error(`Created but connection failed: ${r.data.testResult?.error}`);
      setShowAdd(false);
      setForm({ name: '', type: 'mysql', config: {}, demo: false });
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const testConn = async (id) => {
    setTesting(id);
    try {
      const r = await api.post(`/connectors/${id}/test`);
      toast[r.data.ok ? 'success' : 'error'](r.data.ok ? `✓ ${r.data.version?.slice(0, 60)}` : `Failed: ${r.data.error}`);
      load();
    } catch { toast.error('Test failed'); }
    finally { setTesting(null); }
  };

  const toggleDemo = async (id, enable) => {
    setTogglingDemo(id);
    try {
      await api.patch(`/connectors/${id}/demo`, { enable });
      toast.success(enable ? 'Demo mode enabled — sample data active' : 'Demo mode disabled');
      load();
      if (selected?.id === id) {
        const updated = connectors.find(c => c.id === id);
        if (updated) {
          const newSelected = { ...updated, demo_mode: enable };
          setSelected(newSelected);
          loadSchema(id);
          setQuerySQL(DEMO_SQL[updated.type] || 'SELECT * FROM orders LIMIT 10');
          setQueryResult(null);
        }
      }
    } catch { toast.error('Failed to toggle demo mode'); }
    finally { setTogglingDemo(null); }
  };

  const selectConnector = async (c) => {
    setSelected(c);
    setQueryResult(null);
    setQuerySQL(c.demo_mode ? (DEMO_SQL[c.type] || 'SELECT * FROM orders LIMIT 10') : 'SELECT * FROM table_name LIMIT 10');
    loadSchema(c.id);
  };

  const loadSchema = async (id) => {
    setSchemaLoading(true);
    setSchema(null);
    try {
      const r = await api.get(`/connectors/${id}/schema`);
      setSchema(r.data);
    } catch {
      setSchema({ tables: [], error: 'Could not fetch schema' });
    } finally { setSchemaLoading(false); }
  };

  const runQuery = async () => {
    if (!selected) return;
    setRunning(true);
    try {
      const r = await api.post(`/connectors/${selected.id}/query`, { sql: querySQL });
      setQueryResult(r.data);
      toast.success(`${r.data.rowCount} row${r.data.rowCount !== 1 ? 's' : ''} returned${r.data.demo ? ' (demo data)' : ''}`);
    } catch (e) { toast.error(e.response?.data?.error || 'Query failed'); }
    finally { setRunning(false); }
  };

  const del = async (id) => {
    if (!confirm('Delete this connector?')) return;
    await api.delete(`/connectors/${id}`);
    load();
    if (selected?.id === id) { setSelected(null); setSchema(null); }
  };

  const typeInfo = types.find(t => t.type === form.type);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={22} color="#6366f1" /> Database Connectors
          </h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: 13 }}>Connect to PostgreSQL, MySQL, BigQuery, Redshift, Snowflake · Demo mode for testing without credentials</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
          <Plus size={14} /> Add Connector
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '300px 1fr' : '1fr', gap: 20 }}>
        {/* ── Connector list ─────────────────────────────────────────── */}
        <div>
          {connectors.length === 0 ? (
            <div style={{ background: '#13131f', border: '2px dashed rgba(255,255,255,0.08)', borderRadius: 12, padding: 48, textAlign: 'center' }}>
              <Database size={44} color="#1f2937" style={{ margin: '0 auto 14px', display: 'block' }} />
              <p style={{ color: '#6b7280', margin: '0 0 16px', fontSize: 14 }}>No connectors yet</p>
              <p style={{ color: '#374151', margin: '0 0 20px', fontSize: 12 }}>Use Demo Mode to explore sample data without real credentials</p>
              <button onClick={() => setShowAdd(true)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontWeight: 600 }}>
                Add First Connector
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {connectors.map(c => (
                <div key={c.id}
                  onClick={() => selectConnector(c)}
                  style={{
                    background: '#13131f',
                    border: `1px solid ${selected?.id === c.id ? '#6366f1' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: 11, padding: 14, cursor: 'pointer',
                    boxShadow: selected?.id === c.id ? '0 0 0 1px #6366f144' : 'none',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 8, background: `${COLORS[c.type] || '#6366f1'}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Database size={16} color={COLORS[c.type] || '#6366f1'} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.type}</span>
                          {c.demo_mode && (
                            <span style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)', padding: '0 5px', borderRadius: 5, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>DEMO</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      {c.status === 'active'
                        ? <CheckCircle2 size={14} color="#10b981" />
                        : <XCircle size={14} color="#ef4444" />}
                      <button onClick={e => { e.stopPropagation(); testConn(c.id); }} disabled={testing === c.id}
                        style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 3 }} title="Re-test connection">
                        <RefreshCw size={12} style={testing === c.id ? { animation: 'spin 1s linear infinite' } : {}} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); del(c.id); }}
                        style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 3 }} title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Demo mode toggle — shown on selected card */}
                  {selected?.id === c.id && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FlaskConical size={12} color="#f59e0b" />
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>Demo Mode</span>
                        <span style={{ color: '#4b5563', fontSize: 11 }}>— sample data</span>
                      </div>
                      <button
                        onClick={() => toggleDemo(c.id, !c.demo_mode)}
                        disabled={togglingDemo === c.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.demo_mode ? '#f59e0b' : '#4b5563', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
                        {togglingDemo === c.id
                          ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                          : c.demo_mode
                            ? <ToggleRight size={22} color="#f59e0b" />
                            : <ToggleLeft size={22} color="#4b5563" />}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Detail panel ───────────────────────────────────────────── */}
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Demo mode banner */}
            {selected.demo_mode && (
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 9, alignItems: 'center' }}>
                <FlaskConical size={15} color="#f59e0b" />
                <div>
                  <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13 }}>Demo Mode active</span>
                  <span style={{ color: '#92400e', fontSize: 12, marginLeft: 8 }}>Queries return realistic sample data — no real credentials needed</span>
                </div>
              </div>
            )}

            {/* Connection error banner (non-demo, failed) */}
            {!selected.demo_mode && connectors.find(c => c.id === selected.id)?.status === 'error' && (
              <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 9, alignItems: 'center' }}>
                <XCircle size={15} color="#ef4444" />
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#fca5a5', fontWeight: 600, fontSize: 13 }}>Connection failed</span>
                  <span style={{ color: '#7f1d1d', fontSize: 12, marginLeft: 8 }}>Enable Demo Mode to explore sample data without real credentials</span>
                </div>
                <button onClick={() => toggleDemo(selected.id, true)}
                  style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: 'rgba(245,158,11,0.2)', color: '#fbbf24', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  <FlaskConical size={12} /> Enable Demo
                </button>
              </div>
            )}

            {/* Schema browser */}
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Globe size={13} color="#6b7280" />
                  Schema Browser
                  {schema && <span style={{ color: '#4b5563', fontWeight: 400, fontSize: 12 }}>— {schema.tables?.length || 0} tables</span>}
                </span>
                {schemaLoading && <RefreshCw size={13} color="#6b7280" style={{ animation: 'spin 1s linear infinite' }} />}
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', padding: 12 }}>
                {schema?.tables?.length > 0
                  ? schema.tables.map(t => (
                    <div key={t.table} style={{ marginBottom: 12 }}>
                      <div style={{ color: '#8b5cf6', fontWeight: 700, fontSize: 12, fontFamily: 'monospace', marginBottom: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                        onClick={() => { setQuerySQL(`SELECT * FROM ${t.table} LIMIT 20`); }}>
                        <ChevronRight size={12} /> {t.table}
                        <span style={{ color: '#4b5563', fontWeight: 400, fontSize: 10 }}>({t.columns.length} cols)</span>
                      </div>
                      <div style={{ paddingLeft: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '2px 16px' }}>
                        {t.columns.map(col => (
                          <div key={col.name} style={{ display: 'flex', gap: 8, fontSize: 11, fontFamily: 'monospace', padding: '1px 0' }}>
                            <span style={{ color: '#9ca3af' }}>{col.name}</span>
                            <span style={{ color: '#374151', fontSize: 10 }}>{col.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                  : <div style={{ color: '#374151', fontSize: 13, padding: '16px 4px' }}>
                    {schemaLoading ? 'Loading schema…' : schema?.error || (selected.demo_mode ? 'Loading…' : 'No schema available — check connection or enable Demo Mode')}
                  </div>}
              </div>
            </div>

            {/* Query editor */}
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Code2 size={13} color="#6b7280" />
                  Query {selected.name}
                  {selected.demo_mode && <span style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', padding: '1px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700 }}>DEMO</span>}
                </span>
                <button onClick={runQuery} disabled={running}
                  style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: running ? '#374151' : '#10b981', color: 'white', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Play size={12} /> {running ? 'Running…' : 'Run'}
                </button>
              </div>
              <textarea
                value={querySQL}
                onChange={e => setQuerySQL(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runQuery(); }}
                rows={5}
                spellCheck={false}
                style={{ width: '100%', background: '#0d0d1a', border: 'none', color: '#86efac', fontFamily: 'Monaco, Consolas, monospace', fontSize: 13, padding: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box', minHeight: 100 }}
              />
              <div style={{ padding: '5px 14px', background: '#0d0d1a', borderTop: '1px solid rgba(255,255,255,0.04)', color: '#374151', fontSize: 10 }}>Ctrl+Enter to run · SELECT queries only</div>
            </div>

            {/* Query results */}
            {queryResult && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13 }}>
                    Results — <span style={{ color: '#10b981' }}>{queryResult.rowCount} rows</span>
                  </span>
                  {queryResult.demo && (
                    <span style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>SAMPLE DATA</span>
                  )}
                </div>
                <div style={{ overflowX: 'auto', maxHeight: 320 }}>
                  {queryResult.rows?.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {Object.keys(queryResult.rows[0]).map(k => (
                            <th key={k} style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', background: '#0d0d1a', borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResult.rows.slice(0, 100).map((row, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                            {Object.values(row).map((v, j) => (
                              <td key={j} style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: v !== null ? '#e2e8f0' : '#374151', whiteSpace: 'nowrap' }}>
                                {v !== null ? String(v) : <span style={{ fontStyle: 'italic' }}>null</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ padding: 24, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>No rows returned</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add Connector modal ─────────────────────────────────────── */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowAdd(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 560, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f3f4f6', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>Add Database Connector</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Connector Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Production MySQL" style={inp} />
              </div>
              <div>
                <label style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, config: {} }))}
                  style={{ ...inp, background: '#13131f' }}>
                  {types.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>
              </div>

              {/* Demo mode toggle */}
              <div style={{ background: form.demo ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${form.demo ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setForm(f => ({ ...f, demo: !f.demo }))}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <FlaskConical size={16} color={form.demo ? '#f59e0b' : '#4b5563'} style={{ marginTop: 1 }} />
                  <div>
                    <div style={{ color: form.demo ? '#fbbf24' : '#9ca3af', fontWeight: 700, fontSize: 13 }}>Demo Mode</div>
                    <div style={{ color: '#4b5563', fontSize: 12, marginTop: 2 }}>No credentials needed — queries return realistic sample data for {form.type}</div>
                  </div>
                </div>
                {form.demo ? <ToggleRight size={24} color="#f59e0b" /> : <ToggleLeft size={24} color="#4b5563" />}
              </div>

              {/* Credential fields — only show when not in demo mode */}
              {!form.demo && typeInfo?.fields.map(field => (
                <div key={field}>
                  <label style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                    {field.replace(/([A-Z])/g, ' $1').trim()}
                    {typeInfo.optional?.includes(field) && <span style={{ color: '#374151', fontWeight: 400 }}> (optional)</span>}
                  </label>
                  <input
                    type={field === 'password' ? 'password' : field === 'keyFileContent' ? 'text' : 'text'}
                    value={form.config[field] || ''}
                    onChange={e => setForm(f => ({ ...f, config: { ...f.config, [field]: e.target.value } }))}
                    placeholder={field === 'port' ? (form.type === 'mysql' ? '3306' : form.type === 'redshift' ? '5439' : '5432') : field === 'keyFileContent' ? 'Paste service account JSON…' : ''}
                    style={{ ...inp, fontFamily: field === 'keyFileContent' ? 'monospace' : 'inherit' }}
                  />
                </div>
              ))}

              {!form.demo && (
                <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: '9px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Info size={13} color="#818cf8" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ color: '#818cf8', fontSize: 12 }}>
                    {types.find(t => t.type === form.type)?.description}. If you don't have credentials, use Demo Mode above.
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={create}
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: form.demo ? 'linear-gradient(135deg,#d97706,#f59e0b)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                {form.demo ? <><FlaskConical size={14} /> Create (Demo)</> : 'Create & Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
