import { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Database, Plus, Play, Trash2, CheckCircle2, XCircle, RefreshCw, Globe, Code2 } from 'lucide-react';

const COLORS = { postgresql: '#336791', mysql: '#f29111', snowflake: '#29b5e8', bigquery: '#4285f4', redshift: '#8c4fff', csv_url: '#10b981' };

export default function DatabaseConnectors() {
  const [connectors, setConnectors] = useState([]);
  const [types, setTypes] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [querySQL, setQuerySQL] = useState('SELECT * FROM table_name LIMIT 10');
  const [queryResult, setQueryResult] = useState(null);
  const [schema, setSchema] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'postgresql', config: {} });
  const [testing, setTesting] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => { load(); loadTypes(); }, []);

  const load = async () => { try { const r = await api.get('/connectors'); setConnectors(r.data); } catch {} };
  const loadTypes = async () => { try { const r = await api.get('/connectors/types'); setTypes(r.data); } catch {} };

  const create = async () => {
    if (!form.name || !form.type) return toast.error('Name and type required');
    try {
      const r = await api.post('/connectors', form);
      toast[r.data.testResult?.ok ? 'success' : 'error'](r.data.testResult?.ok ? 'Connector created and tested successfully' : `Created but connection failed: ${r.data.testResult?.error}`);
      setShowAdd(false); setForm({ name: '', type: 'postgresql', config: {} }); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const testConn = async (id) => {
    setTesting(id);
    try {
      const r = await api.post(`/connectors/${id}/test`);
      toast[r.data.ok ? 'success' : 'error'](r.data.ok ? `Connected: ${r.data.version?.slice(0, 50)}` : `Failed: ${r.data.error}`);
      load();
    } catch (e) { toast.error('Test failed'); }
    finally { setTesting(null); }
  };

  const loadSchema = async (id) => {
    try { const r = await api.get(`/connectors/${id}/schema`); setSchema(r.data); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not fetch schema'); }
  };

  const runQuery = async () => {
    if (!selected) return;
    setRunning(true);
    try {
      const r = await api.post(`/connectors/${selected.id}/query`, { sql: querySQL });
      setQueryResult(r.data);
      toast.success(`${r.data.rowCount} rows returned`);
    } catch (e) { toast.error(e.response?.data?.error || 'Query failed'); }
    finally { setRunning(false); }
  };

  const del = async (id) => {
    if (!confirm('Delete this connector?')) return;
    await api.delete(`/connectors/${id}`); load();
    if (selected?.id === id) setSelected(null);
  };

  const typeInfo = types.find(t => t.type === form.type);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px' }}>Database Connectors</h1>
          <p style={{ color: '#9ca3af', margin: 0 }}>Connect to external PostgreSQL, MySQL, Snowflake, BigQuery and more</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Add Connector
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '280px 1fr' : '1fr', gap: 20 }}>
        {/* Connector list */}
        <div>
          {connectors.length === 0 ? (
            <div style={{ background: '#13131f', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
              <Database size={40} color="#374151" style={{ margin: '0 auto 12px', display: 'block' }} />
              <p style={{ color: '#6b7280', margin: '0 0 16px' }}>No connectors yet</p>
              <button onClick={() => setShowAdd(true)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontWeight: 600 }}>Add First Connector</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {connectors.map(c => (
                <div key={c.id} onClick={() => { setSelected(c); loadSchema(c.id); setQueryResult(null); }}
                  style={{ background: '#13131f', border: `1px solid ${selected?.id === c.id ? '#6366f1' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: 16, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${COLORS[c.type] || '#6366f1'}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Database size={18} color={COLORS[c.type] || '#6366f1'} />
                      </div>
                      <div>
                        <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                        <div style={{ color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>{c.type}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {c.status === 'active' ? <CheckCircle2 size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}
                      <button onClick={e => { e.stopPropagation(); testConn(c.id); }} disabled={testing === c.id}
                        style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}>
                        <RefreshCw size={13} style={testing === c.id ? { animation: 'spin 1s linear infinite' } : {}} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); del(c.id); }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { }} style={{ flex: 1, padding: '10px 0', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Globe size={15} /> {selected.name}
              </button>
            </div>

            {/* Schema browser */}
            {schema && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ color: '#f3f4f6', fontWeight: 600 }}>Schema Browser — {schema.tables?.length} tables</span>
                </div>
                <div style={{ maxHeight: 250, overflowY: 'auto', padding: 12 }}>
                  {schema.tables?.map(t => (
                    <div key={t.table} style={{ marginBottom: 10 }}>
                      <div style={{ color: '#8b5cf6', fontWeight: 600, fontSize: 13, fontFamily: 'monospace', marginBottom: 4, cursor: 'pointer' }}
                        onClick={() => setQuerySQL(`SELECT * FROM ${t.table} LIMIT 100`)}>📋 {t.table}</div>
                      {t.columns.map(c => (
                        <div key={c.name} style={{ paddingLeft: 16, color: '#9ca3af', fontSize: 12, fontFamily: 'monospace', display: 'flex', gap: 8 }}>
                          <span>{c.name}</span><span style={{ color: '#4b5563' }}>{c.type}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Query editor */}
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#f3f4f6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Code2 size={15} /> Query {selected.name}</span>
                <button onClick={runQuery} disabled={running} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: running ? '#374151' : '#10b981', color: 'white', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Play size={13} /> {running ? 'Running...' : 'Run'}
                </button>
              </div>
              <textarea value={querySQL} onChange={e => setQuerySQL(e.target.value)} rows={4}
                style={{ width: '100%', background: '#0d0d1a', border: 'none', color: '#86efac', fontFamily: 'Monaco, monospace', fontSize: 13, padding: 14, resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {queryResult && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ color: '#f3f4f6', fontWeight: 600 }}>Results — {queryResult.rowCount} rows</span>
                </div>
                <div style={{ overflowX: 'auto', maxHeight: 300 }}>
                  {queryResult.rows?.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead><tr>{Object.keys(queryResult.rows[0]).map(k => <th key={k} style={{ padding: '8px 12px', textAlign: 'left', color: '#9ca3af', background: '#0d0d1a', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>{k}</th>)}</tr></thead>
                      <tbody>{queryResult.rows.slice(0, 100).map((row, i) => <tr key={i}>{Object.values(row).map((v, j) => <td key={j} style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0' }}>{v !== null ? String(v) : <span style={{ color: '#4b5563' }}>null</span>}</td>)}</tr>)}</tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowAdd(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 560, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f3f4f6', fontSize: 20, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>Add Database Connector</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>CONNECTOR NAME</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Production Postgres" style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>TYPE</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, config: {} }))}
                  style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                  {types.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>
              </div>
              {typeInfo?.fields.map(field => (
                <div key={field}>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>{field.toUpperCase()}</label>
                  <input type={field === 'password' ? 'password' : 'text'} value={form.config[field] || ''}
                    onChange={e => setForm(f => ({ ...f, config: { ...f.config, [field]: e.target.value } }))}
                    placeholder={field === 'port' ? (form.type === 'mysql' ? '3306' : '5432') : ''}
                    style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={create} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Create & Test</button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
