import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  Webhook, Plus, Play, Trash2, Clock, CheckCircle2, XCircle,
  ToggleLeft, ToggleRight, Sparkles, ShieldCheck, GitBranch,
  Users, AlertTriangle, Info, ChevronDown, ChevronUp, Zap,
  Settings, Activity, Filter, Bell, Eye
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────
const OPERATORS    = ['>', '<', '>=', '<=', '=', '!='];
const AGG_FNS      = ['AVG', 'SUM', 'MIN', 'MAX', 'COUNT'];
const CHANNELS     = ['webhook', 'slack', 'teams', 'email', 'pagerduty'];
const SEVERITIES   = ['low', 'medium', 'high', 'critical'];
const SEV_COLORS   = { low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };
const SEV_BG       = { low: 'rgba(16,185,129,0.1)', medium: 'rgba(245,158,11,0.1)', high: 'rgba(249,115,22,0.1)', critical: 'rgba(239,68,68,0.1)' };

const STATUS_ICON = ({ status }) => {
  if (status === 'triggered' || status === 'test_ok')   return <CheckCircle2 size={13} color="#10b981" />;
  if (status === 'trigger_failed' || status === 'test_failed') return <XCircle size={13} color="#ef4444" />;
  if (status === 'rate_limited')  return <Clock size={13} color="#f59e0b" />;
  return <Info size={13} color="#6b7280" />;
};

const sel = { background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 12px', fontSize: 13 };
const inp = { ...sel };

// ── Empty rule template ──────────────────────────────────────────────────────
const newRule = (metric_col = '') => ({
  metric_col, operator: '>', threshold_value: '', agg_fn: 'AVG',
  severity: 'medium', label: '', time_window_hours: ''
});

// ── Rule builder row ─────────────────────────────────────────────────────────
const RuleRow = ({ rule, idx, cols, onChange, onRemove, canRemove }) => (
  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 12, marginBottom: 8 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 90px 90px 28px', gap: 8, alignItems: 'end' }}>
      <div>
        <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>Metric Column</div>
        <select value={rule.metric_col} onChange={e => onChange(idx, 'metric_col', e.target.value)} style={{ ...sel, width: '100%' }}>
          <option value="">Select…</option>
          {cols.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>Agg</div>
        <select value={rule.agg_fn} onChange={e => onChange(idx, 'agg_fn', e.target.value)} style={{ ...sel, width: '100%' }}>
          {AGG_FNS.map(f => <option key={f}>{f}</option>)}
        </select>
      </div>
      <div>
        <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>Operator</div>
        <select value={rule.operator} onChange={e => onChange(idx, 'operator', e.target.value)} style={{ ...sel, width: '100%' }}>
          {OPERATORS.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>Threshold</div>
        <input type="number" value={rule.threshold_value} onChange={e => onChange(idx, 'threshold_value', e.target.value)}
          placeholder="e.g. 1000000" style={{ ...inp, width: '100%' }} />
      </div>
      <div>
        <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>Severity</div>
        <select value={rule.severity} onChange={e => onChange(idx, 'severity', e.target.value)} style={{ ...sel, width: '100%', color: SEV_COLORS[rule.severity] }}>
          {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {canRemove
        ? <button onClick={() => onRemove(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: 4, marginTop: 18 }}><Trash2 size={13} /></button>
        : <div />}
    </div>
    {rule.metric_col && rule.threshold_value !== '' && (
      <div style={{ marginTop: 8, padding: '5px 10px', background: 'rgba(245,158,11,0.06)', borderRadius: 6, fontSize: 12, color: '#9ca3af' }}>
        <span style={{ color: '#fbbf24' }}>⚡ Trigger when</span> {rule.agg_fn}(<span style={{ color: '#e2e8f0' }}>{rule.metric_col}</span>) {rule.operator} <span style={{ color: SEV_COLORS[rule.severity] }}>{rule.threshold_value}</span>
      </div>
    )}
  </div>
);

// ── Channel config panel ─────────────────────────────────────────────────────
const ChannelConfig = ({ channel, config, onChange }) => {
  if (channel === 'webhook') return null;
  const fields = {
    slack:     [['webhook_url', 'Slack Webhook URL', 'https://hooks.slack.com/services/...'], ['channel', 'Channel', '#alerts']],
    teams:     [['webhook_url', 'Teams Webhook URL', 'https://xxx.webhook.office.com/...']],
    email:     [['to', 'To Email(s)', 'ops@company.com, cto@company.com'], ['from', 'From', 'alerts@dataanalystpro.com']],
    pagerduty: [['routing_key', 'PagerDuty Routing Key', 'xxxxxxxxxxxxxxxx']],
  }[channel] || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {fields.map(([key, label, ph]) => (
        <div key={key}>
          <div style={{ color: '#4b5563', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
          <input value={config[key] || ''} onChange={e => onChange({ ...config, [key]: e.target.value })}
            placeholder={ph} style={{ ...inp, width: '100%' }} />
        </div>
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════════════════════
export default function Webhooks() {
  const { datasets, fetchDatasets } = useData();
  const [webhooks, setWebhooks] = useState([]);
  const [selected, setSelected]   = useState(null);
  const [history, setHistory]     = useState([]);
  const [showAdd, setShowAdd]     = useState(false);
  const [triggering, setTriggering] = useState(null);
  const [evaluating, setEvaluating] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [cols, setCols]           = useState([]);
  const [activeTab, setActiveTab] = useState('history');
  const [historyExpanded, setHistoryExpanded] = useState(null);

  // Form state
  const [form, setForm] = useState({
    name: '', url: '', dataset_id: '', method: 'POST',
    rule_logic: 'OR', severity: 'medium',
    channel: 'webhook', channel_config: {},
    shared: false, min_interval_minutes: '',
  });
  const [rules, setRules] = useState([newRule()]);

  useEffect(() => { load(); fetchDatasets(); }, []);

  const load = async () => { try { const r = await api.get('/webhooks'); setWebhooks(r.data); } catch {} };
  const loadHistory = async (id) => { try { const r = await api.get(`/webhooks/${id}/history`); setHistory(r.data); } catch {} };

  const loadCols = async (dsId) => {
    if (!dsId) { setCols([]); return; }
    try {
      const r = await api.get(`/datasets/${dsId}`);
      const schema = r.data.schema || [];
      const entries = Array.isArray(schema) ? schema.map(c => [c.name, c.type]) : Object.entries(schema);
      // Include all columns — let user pick, since we support aggregations like COUNT on any col
      setCols(entries.map(([n]) => n));
    } catch {}
  };

  const updateRule = (idx, key, val) => setRules(rs => { const next = [...rs]; next[idx] = { ...next[idx], [key]: val }; return next; });
  const addRule    = () => setRules(rs => [...rs, newRule()]);
  const removeRule = (idx) => setRules(rs => rs.filter((_, i) => i !== idx));

  const create = async () => {
    if (!form.name || !form.url) return toast.error('Name and URL required');
    const validRules = rules.filter(r => r.metric_col && r.threshold_value !== '');
    try {
      await api.post('/webhooks', {
        ...form,
        dataset_id: form.dataset_id || undefined,
        min_interval_minutes: form.min_interval_minutes ? parseFloat(form.min_interval_minutes) : null,
        rules: validRules.map(r => ({ ...r, threshold_value: parseFloat(r.threshold_value) })),
        // backwards compat fields
        metric_col: validRules[0]?.metric_col || null,
        operator: validRules[0]?.operator || '>',
        threshold_value: validRules[0]?.threshold_value ? parseFloat(validRules[0].threshold_value) : null,
      });
      toast.success('Alert created');
      setShowAdd(false);
      setForm({ name: '', url: '', dataset_id: '', method: 'POST', rule_logic: 'OR', severity: 'medium', channel: 'webhook', channel_config: {}, shared: false, min_interval_minutes: '' });
      setRules([newRule()]);
      setCols([]);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const trigger = async (id) => {
    setTriggering(id);
    try {
      const r = await api.post(`/webhooks/${id}/trigger`);
      if (r.data.triggered) {
        toast.success('🔔 Alert triggered!');
      } else {
        toast(r.data.reason || 'Condition not met', { icon: '⚠️' });
      }
      load();
      if (selected?.id === id) { loadHistory(id); setEvalResult(r.data); }
    } catch (e) { toast.error('Trigger failed'); }
    finally { setTriggering(null); }
  };

  const evaluate = async (id) => {
    setEvaluating(id);
    setEvalResult(null);
    try {
      const r = await api.post(`/webhooks/${id}/evaluate`);
      setEvalResult(r.data);
      setActiveTab('evaluate');
      toast(r.data.conditionMet ? '✅ Conditions would fire!' : '⚠️ Conditions not met', { duration: 3000 });
    } catch { toast.error('Evaluation failed'); }
    finally { setEvaluating(null); }
  };

  const toggle = async (wh) => { await api.put(`/webhooks/${wh.id}`, { is_active: !wh.is_active }); load(); };
  const test   = async (id) => {
    try { const r = await api.post(`/webhooks/${id}/test`); toast[r.data.ok ? 'success' : 'error'](r.data.ok ? `Test OK (${r.data.status})` : `Test failed: ${r.data.error}`); }
    catch { toast.error('Test failed'); }
  };
  const del = async (id) => {
    if (!confirm('Delete this alert?')) return;
    await api.delete(`/webhooks/${id}`); load(); if (selected?.id === id) { setSelected(null); setEvalResult(null); }
  };

  const selectWebhook = (wh) => {
    setSelected(wh); setEvalResult(null); setActiveTab('history');
    loadHistory(wh.id);
  };

  const tabs = [
    { id: 'history',  label: `History (${history.length})` },
    { id: 'evaluate', label: 'Dry-Run Eval', disabled: !evalResult },
    { id: 'governance', label: 'Governance', disabled: !history.some(h => h.narrative) },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bell size={23} color="#f59e0b" /> Webhooks & Alerts
          </h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: 13 }}>
            Multi-rule engine · AVG/SUM/MIN/MAX/COUNT · AI narratives · Governance lineage · Slack · Teams · Email
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Plus size={15} /> New Alert
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '380px 1fr' : '1fr', gap: 18 }}>
        {/* ── Alert list ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {webhooks.length === 0 ? (
            <div style={{ background: '#13131f', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 14, padding: 48, textAlign: 'center' }}>
              <Bell size={44} color="#374151" style={{ margin: '0 auto 14px', display: 'block' }} />
              <p style={{ color: '#6b7280', marginBottom: 16 }}>No alerts configured yet</p>
              <button onClick={() => setShowAdd(true)}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #f59e0b', background: 'transparent', color: '#f59e0b', cursor: 'pointer', fontWeight: 600 }}>
                Create First Alert
              </button>
            </div>
          ) : webhooks.map(wh => {
            const maxSev = (wh.rules || []).reduce((m, r) => {
              const order = { critical: 4, high: 3, medium: 2, low: 1 };
              return (order[r.severity] || 0) > (order[m] || 0) ? r.severity : m;
            }, wh.severity || 'medium');
            const sevColor = SEV_COLORS[maxSev] || '#f59e0b';
            const rules_ = Array.isArray(wh.rules) && wh.rules.length ? wh.rules : (wh.metric_col ? [{ metric_col: wh.metric_col, operator: wh.operator, threshold_value: wh.threshold_value, agg_fn: 'AVG', severity: 'medium' }] : []);

            return (
              <div key={wh.id} onClick={() => selectWebhook(wh)}
                style={{ background: '#13131f', border: `1px solid ${selected?.id === wh.id ? '#f59e0b' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: 14, cursor: 'pointer', borderLeft: `3px solid ${sevColor}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                      {wh.shared && <Users size={11} color="#6366f1" />}
                      {wh.name}
                    </div>
                    <div style={{ color: '#4b5563', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
                      {wh.url?.slice(0, 42)}{wh.url?.length > 42 ? '…' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ background: SEV_BG[maxSev], color: sevColor, padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{maxSev}</span>
                    <span style={{ background: wh.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)', color: wh.is_active ? '#10b981' : '#6b7280', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>
                      {wh.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                </div>

                {/* Rule summary chips */}
                {rules_.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                    {rules_.slice(0, 3).map((rule, i) => (
                      <span key={i} style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#d1d5db' }}>
                        <span style={{ color: '#fbbf24' }}>{rule.agg_fn || 'AVG'}</span>({rule.metric_col}) {rule.operator} <span style={{ color: sevColor }}>{rule.threshold_value}</span>
                      </span>
                    ))}
                    {rules_.length > 3 && <span style={{ color: '#4b5563', fontSize: 11 }}>+{rules_.length - 3} more</span>}
                    {rules_.length > 1 && <span style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', padding: '2px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700 }}>{wh.rule_logic || 'OR'}</span>}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={e => { e.stopPropagation(); trigger(wh.id); }} disabled={triggering === wh.id}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Play size={10} /> {triggering === wh.id ? '…' : 'Trigger'}
                  </button>
                  <button onClick={e => { e.stopPropagation(); evaluate(wh.id); setSelected(wh); }} disabled={evaluating === wh.id}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid rgba(99,102,241,0.3)', background: 'transparent', color: '#818cf8', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Eye size={10} /> {evaluating === wh.id ? '…' : 'Dry-Run'}
                  </button>
                  <button onClick={e => { e.stopPropagation(); test(wh.id); }}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>Test</button>
                  <button onClick={e => { e.stopPropagation(); toggle(wh); }}
                    style={{ padding: '6px 8px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    {wh.is_active ? <ToggleRight size={16} color="#10b981" /> : <ToggleLeft size={16} color="#6b7280" />}
                  </button>
                  <button onClick={e => { e.stopPropagation(); del(wh.id); }}
                    style={{ padding: '6px 8px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#4b5563' }}>
                    <Trash2 size={13} />
                  </button>
                </div>

                {wh.trigger_count > 0 && (
                  <div style={{ color: '#4b5563', fontSize: 11, marginTop: 7, display: 'flex', gap: 12 }}>
                    <span><Activity size={9} style={{ verticalAlign: 'middle' }} /> {wh.trigger_count} triggers</span>
                    {wh.last_triggered && <span><Clock size={9} style={{ verticalAlign: 'middle' }} /> {new Date(wh.last_triggered).toLocaleString()}</span>}
                    {wh.min_interval_minutes && <span>⏱ {wh.min_interval_minutes}m rate limit</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Detail panel ─────────────────────────────────────────── */}
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: 3, border: '1px solid rgba(255,255,255,0.06)' }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => !t.disabled && setActiveTab(t.id)} disabled={t.disabled}
                  style={{ flex: 1, padding: '7px 10px', border: 'none', borderRadius: 7, cursor: t.disabled ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12, opacity: t.disabled ? 0.35 : 1, background: activeTab === t.id ? 'rgba(245,158,11,0.2)' : 'transparent', color: activeTab === t.id ? '#fbbf24' : '#6b7280' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab: History */}
            {activeTab === 'history' && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={14} color="#f59e0b" />
                  <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13 }}>Trigger History — {selected.name}</span>
                  <span style={{ color: '#4b5563', fontSize: 12 }}>{selected.trigger_count || 0} total</span>
                </div>
                {history.length === 0 ? (
                  <div style={{ padding: 36, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>No trigger history yet — use Trigger or Dry-Run above</div>
                ) : history.map(h => (
                  <div key={h.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: h.narrative ? 'pointer' : 'default' }}
                      onClick={() => h.narrative && setHistoryExpanded(historyExpanded === h.id ? null : h.id)}>
                      <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                        <STATUS_ICON status={h.status} />
                        <div>
                          <div style={{ color: '#e2e8f0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>{h.status?.replace(/_/g, ' ')}</span>
                            {h.triggered_value !== null && h.triggered_value !== undefined && (
                              <span style={{ color: '#6b7280', fontSize: 12 }}>· value: {parseFloat(h.triggered_value).toFixed(2)}</span>
                            )}
                            {h.narrative && <Sparkles size={10} color="#818cf8" />}
                          </div>
                          <div style={{ color: '#4b5563', fontSize: 11 }}>{new Date(h.triggered_at).toLocaleString()}</div>
                        </div>
                      </div>
                      {h.narrative && (historyExpanded === h.id ? <ChevronUp size={12} color="#4b5563" /> : <ChevronDown size={12} color="#4b5563" />)}
                    </div>
                    {historyExpanded === h.id && h.narrative && (
                      <div style={{ padding: '0 16px 12px' }}>
                        <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: '9px 12px' }}>
                          <div style={{ color: '#818cf8', fontSize: 11, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Sparkles size={10} /> AI Narrative</div>
                          <div style={{ color: '#d1d5db', fontSize: 12, lineHeight: 1.7 }}>{h.narrative}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Tab: Dry-Run Evaluation */}
            {activeTab === 'evaluate' && evalResult && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
                <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Eye size={13} color="#818cf8" /> Dry-Run Evaluation
                  <span style={{ fontSize: 11, color: '#4b5563', fontWeight: 400 }}>— no webhook fired</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: evalResult.conditionMet ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)', border: `1px solid ${evalResult.conditionMet ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}` }}>
                  {evalResult.conditionMet ? <AlertTriangle size={20} color="#ef4444" /> : <CheckCircle2 size={20} color="#10b981" />}
                  <div>
                    <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14 }}>{evalResult.conditionMet ? '🔔 Alert would fire!' : '✓ Conditions not met'}</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{evalResult.datasetName} · evaluated {new Date(evalResult.evaluated_at).toLocaleString()}</div>
                  </div>
                </div>

                {/* Rule breakdown */}
                {(evalResult.ruleResults || []).map((r, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 9, marginBottom: 8, borderLeft: `3px solid ${r.conditionMet ? SEV_COLORS[r.severity || 'medium'] : '#374151'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#d1d5db', fontSize: 13 }}>
                        {r.agg_fn || 'AVG'}(<strong style={{ color: '#f3f4f6' }}>{r.metric}</strong>) {r.operator} {r.threshold_value}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 16, color: r.conditionMet ? SEV_COLORS[r.severity || 'medium'] : '#6b7280' }}>
                        {r.currentValue?.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ color: '#4b5563', fontSize: 11, marginTop: 3 }}>
                      {r.conditionMet ? '⚡ FIRES' : '✓ passes'} — current: {r.currentValue?.toFixed(4)} {r.operator} threshold: {r.threshold_value}
                    </div>
                  </div>
                ))}

                {evalResult.narrative && (
                  <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 9, padding: '11px 14px', marginTop: 12 }}>
                    <div style={{ color: '#818cf8', fontSize: 11, fontWeight: 700, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}><Sparkles size={10} /> AI Narrative (if fired)</div>
                    <div style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.7 }}>{evalResult.narrative}</div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Governance */}
            {activeTab === 'governance' && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
                <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <ShieldCheck size={13} color="#10b981" /> Governance & Lineage
                </div>
                {history.filter(h => h.narrative).slice(0, 5).map(h => (
                  <div key={h.id} style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.12)', borderRadius: 9, padding: '11px 14px', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                      <GitBranch size={12} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <div style={{ color: '#6ee7b7', fontWeight: 700, fontSize: 11, marginBottom: 3 }}>Lineage Event · {h.status?.replace(/_/g, ' ')}</div>
                        <div style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.6 }}>{h.narrative}</div>
                        <div style={{ color: '#4b5563', fontSize: 11, marginTop: 4 }}>{new Date(h.triggered_at).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {!history.some(h => h.narrative) && (
                  <div style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: 20 }}>Trigger an alert to generate governance records</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create Alert Modal ─────────────────────────────────────── */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowAdd(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 680, padding: 28, maxHeight: '92vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f3f4f6', marginTop: 0, marginBottom: 20, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={17} color="#f59e0b" /> New Alert
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Basic info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>Alert Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Revenue Drop Alert"
                    style={{ ...inp, width: '100%' }} /></div>
                <div><label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>Severity</label>
                  <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                    style={{ ...sel, width: '100%', color: SEV_COLORS[form.severity] }}>
                    {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select></div>
              </div>

              {/* Dataset */}
              <div><label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>Dataset</label>
                <select value={form.dataset_id} onChange={e => { setForm(f => ({ ...f, dataset_id: e.target.value })); loadCols(e.target.value); }}
                  style={{ ...sel, width: '100%' }}>
                  <option value="">None — manual trigger only</option>
                  {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              {/* Rule engine */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Filter size={11} /> Threshold Rules
                    {rules.length > 1 && (
                      <select value={form.rule_logic} onChange={e => setForm(f => ({ ...f, rule_logic: e.target.value }))}
                        style={{ ...sel, padding: '2px 8px', fontSize: 11, marginLeft: 8, width: 'auto' }}>
                        <option value="OR">Match ANY (OR)</option>
                        <option value="AND">Match ALL (AND)</option>
                      </select>
                    )}
                  </label>
                  <button onClick={addRule}
                    style={{ padding: '4px 10px', background: 'rgba(245,158,11,0.12)', border: 'none', borderRadius: 6, color: '#fbbf24', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    + Add Rule
                  </button>
                </div>
                {rules.map((rule, idx) => (
                  <RuleRow key={idx} rule={rule} idx={idx} cols={cols} onChange={updateRule} onRemove={removeRule} canRemove={rules.length > 1} />
                ))}
                {!form.dataset_id && <div style={{ color: '#4b5563', fontSize: 12 }}>Select a dataset above to enable column-based thresholds</div>}
              </div>

              {/* Notification channel */}
              <div>
                <label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>Notification Channel</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  {CHANNELS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, channel: c }))}
                      style={{ padding: '5px 12px', border: `1px solid ${form.channel === c ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`, borderRadius: 7, background: form.channel === c ? 'rgba(245,158,11,0.15)' : 'transparent', color: form.channel === c ? '#fbbf24' : '#6b7280', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>
                <ChannelConfig channel={form.channel} config={form.channel_config} onChange={cfg => setForm(f => ({ ...f, channel_config: cfg }))} />
              </div>

              {/* Webhook URL + Method */}
              <div>
                <label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>
                  {form.channel === 'webhook' ? 'Webhook URL' : 'Fallback Webhook URL'}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
                  <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://hooks.slack.com/..."
                    style={{ ...inp, width: '100%' }} />
                  <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                    style={{ ...sel, width: '100%' }}>
                    <option>POST</option><option>GET</option><option>PUT</option>
                  </select>
                </div>
              </div>

              {/* Advanced */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>Rate Limit (minutes between triggers)</label>
                  <input type="number" value={form.min_interval_minutes} onChange={e => setForm(f => ({ ...f, min_interval_minutes: e.target.value }))} placeholder="e.g. 60"
                    style={{ ...inp, width: '100%' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#9ca3af', fontSize: 13 }}>
                    <input type="checkbox" checked={form.shared} onChange={e => setForm(f => ({ ...f, shared: e.target.checked }))} />
                    <Users size={13} /> Share with team
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={create}
                style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                Create Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
