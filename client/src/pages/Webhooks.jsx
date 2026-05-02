import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Webhook, Plus, Play, Trash2, Clock, CheckCircle2, XCircle, ToggleLeft, ToggleRight } from 'lucide-react';

export default function Webhooks() {
  const { datasets, fetchDatasets } = useData();
  const [webhooks, setWebhooks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', dataset_id: '', metric_col: '', operator: '>', threshold_value: '', method: 'POST' });
  const [triggering, setTriggering] = useState(null);
  const [cols, setCols] = useState([]);

  useEffect(() => { load(); fetchDatasets(); }, []);

  const load = async () => { try { const r = await api.get('/webhooks'); setWebhooks(r.data); } catch {} };
  const loadHistory = async (id) => { try { const r = await api.get(`/webhooks/${id}/history`); setHistory(r.data); } catch {} };
  const loadCols = async (dsId) => {
    try { const r = await api.get(`/datasets/${dsId}`); setCols(Object.keys(r.data.schema || {}).filter(k => ['integer','numeric','float','double','decimal','number'].some(t => String(r.data.schema[k]).toLowerCase().includes(t)))); }
    catch {}
  };

  const create = async () => {
    if (!form.name || !form.url) return toast.error('Name and URL required');
    try {
      await api.post('/webhooks', { ...form, dataset_id: form.dataset_id || undefined, threshold_value: form.threshold_value ? parseFloat(form.threshold_value) : undefined });
      toast.success('Webhook created'); setShowAdd(false); setForm({ name: '', url: '', dataset_id: '', metric_col: '', operator: '>', threshold_value: '', method: 'POST' }); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const trigger = async (id) => {
    setTriggering(id);
    try { const r = await api.post(`/webhooks/${id}/trigger`); toast[r.data.triggered ? 'success' : 'error'](r.data.triggered ? 'Webhook triggered!' : `Not triggered: ${r.data.reason}`); load(); if (selected?.id === id) loadHistory(id); }
    catch (e) { toast.error('Failed'); }
    finally { setTriggering(null); }
  };

  const test = async (id) => {
    try { const r = await api.post(`/webhooks/${id}/test`); toast[r.data.ok ? 'success' : 'error'](r.data.ok ? `Test OK (${r.data.status})` : `Test failed: ${r.data.error}`); }
    catch (e) { toast.error('Failed'); }
  };

  const toggle = async (wh) => {
    await api.put(`/webhooks/${wh.id}`, { is_active: !wh.is_active }); load();
  };

  const del = async (id) => {
    if (!confirm('Delete webhook?')) return;
    await api.delete(`/webhooks/${id}`); load(); if (selected?.id === id) setSelected(null);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}><Webhook size={26} color="#f59e0b" /> Webhooks & Alerts</h1>
          <p style={{ color: '#9ca3af', margin: 0 }}>Trigger HTTP webhooks when dataset metrics cross thresholds</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> New Webhook
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '360px 1fr' : '1fr', gap: 20 }}>
        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {webhooks.length === 0 ? (
            <div style={{ background: '#13131f', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 12, padding: 48, textAlign: 'center' }}>
              <Webhook size={48} color="#374151" style={{ margin: '0 auto 16px', display: 'block' }} />
              <p style={{ color: '#6b7280', margin: '0 0 16px' }}>No webhooks configured</p>
              <button onClick={() => setShowAdd(true)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #f59e0b', background: 'transparent', color: '#f59e0b', cursor: 'pointer', fontWeight: 600 }}>Create First Webhook</button>
            </div>
          ) : webhooks.map(wh => (
            <div key={wh.id} onClick={() => { setSelected(wh); loadHistory(wh.id); }}
              style={{ background: '#13131f', border: `1px solid ${selected?.id === wh.id ? '#f59e0b' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: 16, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14 }}>{wh.name}</div>
                  <div style={{ color: '#6b7280', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>{wh.url.slice(0, 45)}...</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {wh.is_active ? <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>Active</span> : <span style={{ background: 'rgba(107,114,128,0.15)', color: '#6b7280', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>Paused</span>}
                </div>
              </div>
              {wh.metric_col && <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 10 }}>Alert when <strong style={{ color: '#f59e0b' }}>{wh.metric_col}</strong> {wh.operator} <strong style={{ color: '#f59e0b' }}>{wh.threshold_value}</strong></div>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={e => { e.stopPropagation(); trigger(wh.id); }} disabled={triggering === wh.id}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Play size={11} /> {triggering === wh.id ? '...' : 'Trigger'}
                </button>
                <button onClick={e => { e.stopPropagation(); test(wh.id); }} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>Test</button>
                <button onClick={e => { e.stopPropagation(); toggle(wh); }} style={{ padding: '6px 8px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280' }}>
                  {wh.is_active ? <ToggleRight size={16} color="#10b981" /> : <ToggleLeft size={16} />}
                </button>
                <button onClick={e => { e.stopPropagation(); del(wh.id); }} style={{ padding: '6px 8px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280' }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        {/* Detail: history */}
        {selected && (
          <div>
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} color="#f59e0b" />
                <span style={{ color: '#f3f4f6', fontWeight: 600 }}>Trigger History — {selected.name}</span>
                <span style={{ color: '#6b7280', fontSize: 12 }}>{selected.trigger_count} total triggers</span>
              </div>
              {history.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>No trigger history yet — use the Trigger button to test</div>
              ) : history.map(h => (
                <div key={h.id} style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {h.status === 'ok' || h.status === 'test_ok' ? <CheckCircle2 size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}
                    <div>
                      <div style={{ color: '#e2e8f0', fontSize: 13 }}>{h.status}</div>
                      {h.triggered_value !== null && <div style={{ color: '#6b7280', fontSize: 11 }}>Value: {h.triggered_value}</div>}
                    </div>
                  </div>
                  <div style={{ color: '#4b5563', fontSize: 12 }}>{new Date(h.triggered_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowAdd(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 520, padding: 28, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f3f4f6', marginTop: 0, marginBottom: 20 }}>New Webhook</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[['NAME', 'name', 'text', 'e.g. High Revenue Alert'], ['WEBHOOK URL', 'url', 'url', 'https://hooks.slack.com/...']]
                .map(([label, field, type, ph]) => (
                  <div key={field}><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>{label}</label>
                    <input type={type} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} placeholder={ph}
                      style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }} /></div>
                ))}
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>METHOD</label>
                <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                  style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                  <option>POST</option><option>GET</option><option>PUT</option>
                </select></div>
              <div style={{ color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>Optional: Threshold Alert</div>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>DATASET</label>
                <select value={form.dataset_id} onChange={e => { setForm(f => ({ ...f, dataset_id: e.target.value, metric_col: '' })); if (e.target.value) loadCols(e.target.value); }}
                  style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                  <option value="">None</option>{datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select></div>
              {form.dataset_id && <>
                <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>METRIC COLUMN</label>
                  <select value={form.metric_col} onChange={e => setForm(f => ({ ...f, metric_col: e.target.value }))}
                    style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                    <option value="">Select column...</option>{cols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                  <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>OPERATOR</label>
                    <select value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}
                      style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                      {['>', '<', '>=', '<=', '='].map(o => <option key={o}>{o}</option>)}
                    </select></div>
                  <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>THRESHOLD</label>
                    <input type="number" value={form.threshold_value} onChange={e => setForm(f => ({ ...f, threshold_value: e.target.value }))}
                      style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }} /></div>
                </div>
              </>}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={create} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
