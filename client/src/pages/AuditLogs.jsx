import { useState, useEffect } from 'react';
import api from '../api/client';
import { Shield, Search, User, Activity, TrendingUp, Filter, Download, AlertTriangle, CheckCircle, XCircle, AlertCircle, Lock, Eye, Database, Key } from 'lucide-react';
import toast from 'react-hot-toast';

const ACTION_COLORS = {
  login: '#10b981', logout: '#6b7280', upload: '#6366f1', delete: '#ef4444',
  update: '#f59e0b', create: '#8b5cf6', execute: '#06b6d4',
};

const SEV_COLORS = { critical: '#ef4444', warning: '#f59e0b', info: '#6366f1' };
const STATUS_COLORS = { pass: '#10b981', warning: '#f59e0b', fail: '#ef4444' };
const STATUS_ICONS = {
  pass: <CheckCircle size={14} color="#10b981" />,
  warning: <AlertTriangle size={14} color="#f59e0b" />,
  fail: <XCircle size={14} color="#ef4444" />,
};
const CAT_ICONS = { Security: <Lock size={13} />, Privacy: <Eye size={13} />, Compliance: <Shield size={13} />, Governance: <Database size={13} /> };

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [govLoading, setGovLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('logs');
  const [filters, setFilters] = useState({ user_id: '', action: '', resource_type: '', limit: 100, offset: 0 });

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== ''));
      const res = (await api.get(`/audit?${params}`)).data;
      setLogs(res.logs || []);
      setTotal(res.total || 0);
    } catch (err) {
      if (err.response?.status === 403) toast.error('Admin access required');
      else toast.error('Failed to load audit logs');
    } finally { setLoading(false); }
  };

  const loadStats = async () => {
    try { setStats((await api.get('/audit/stats')).data); } catch {}
  };

  const loadGovernance = async () => {
    setGovLoading(true);
    try {
      const [anomRes, compRes] = await Promise.all([
        api.get('/audit/anomalies'),
        api.get('/audit/compliance'),
      ]);
      setAnomalies(anomRes.data);
      setCompliance(compRes.data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load governance data');
    } finally { setGovLoading(false); }
  };

  useEffect(() => { loadLogs(); loadStats(); }, []);
  useEffect(() => { if (activeTab === 'governance') loadGovernance(); }, [activeTab]);

  const exportCSV = () => {
    const csv = ['Time,User,Action,Resource Type,Resource ID\n',
      ...logs.map(l => `${l.created_at},${l.user_name || ''},${l.action},${l.resource_type || ''},${l.resource_id || ''}`)
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'audit_logs.csv'; a.click();
  };

  const TABS = [
    ['logs', 'Activity Log', Activity],
    ['stats', 'Statistics', TrendingUp],
    ['governance', 'Governance', Shield],
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4 }}>Audit & Governance</h1>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Security monitoring, anomaly detection, compliance checks, and user activity history</p>
        </div>
        <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', fontSize: 14 }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4 }}>
        {TABS.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: activeTab === id ? '#6366f1' : 'transparent', color: activeTab === id ? '#fff' : '#9ca3af' }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {activeTab === 'logs' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {[['action', 'Filter by action...'], ['resource_type', 'Resource type...']].map(([key, ph]) => (
              <input key={key} value={filters[key]} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, width: 180 }} />
            ))}
            <button onClick={loadLogs} style={{ padding: '8px 16px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 14 }}>
              <Filter size={13} style={{ marginRight: 6 }} />Filter
            </button>
            <span style={{ color: '#4b5563', fontSize: 13, alignSelf: 'center' }}>{total.toLocaleString()} total entries</span>
          </div>

          {loading ? <p style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>Loading...</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>{['Timestamp', 'User', 'Action', 'Resource', 'Details'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', color: '#9ca3af', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 14px', color: '#6b7280', whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(log.created_at).toLocaleString()}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <User size={12} color="#6b7280" />
                          <span style={{ color: '#d1d5db' }}>{log.user_name || 'System'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: `${ACTION_COLORS[log.action?.toLowerCase()] || '#6b7280'}20`, color: ACTION_COLORS[log.action?.toLowerCase()] || '#9ca3af', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{log.resource_type} {log.resource_id ? `#${log.resource_id}` : ''}</td>
                      <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {JSON.stringify(log.details)?.slice(0, 80)}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#4b5563' }}>No logs found</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'stats' && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {[['Top Users', stats.byUser, 'name'], ['Top Actions', stats.byAction, 'action']].map(([title, data, labelField]) => (
            <div key={title} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 16 }}>{title}</h3>
              {(data || []).map((item, i) => {
                const maxCount = data[0]?.count || 1;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ color: '#9ca3af', fontSize: 13, width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item[labelField]}</span>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${(item.count / maxCount) * 100}%`, height: '100%', background: '#6366f1', borderRadius: 4 }} />
                    </div>
                    <span style={{ color: '#6b7280', fontSize: 12, width: 40, textAlign: 'right' }}>{item.count}</span>
                  </div>
                );
              })}
              {(!data || data.length === 0) && <div style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: 20 }}>No data yet</div>}
            </div>
          ))}
          {stats.byDay?.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, gridColumn: 'span 2' }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 16 }}>Activity — Last 30 Days</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                {stats.byDay.map((d, i) => {
                  const maxCount = Math.max(...stats.byDay.map(x => x.count));
                  return <div key={i} title={`${new Date(d.day).toLocaleDateString()}: ${d.count}`} style={{ flex: 1, background: '#6366f1', borderRadius: '3px 3px 0 0', height: `${(d.count / maxCount) * 100}%`, minHeight: 2, opacity: 0.8 }} />;
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ color: '#4b5563', fontSize: 11 }}>{new Date(stats.byDay[0]?.day).toLocaleDateString()}</span>
                <span style={{ color: '#4b5563', fontSize: 11 }}>{new Date(stats.byDay[stats.byDay.length - 1]?.day).toLocaleDateString()}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'governance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {govLoading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Scanning for anomalies and running compliance checks...</div>
          ) : (
            <>
              {anomalies && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={18} color="#f59e0b" /> Anomaly Detection
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#6b7280', fontSize: 12 }}>Scanned {new Date(anomalies.scanned_at).toLocaleTimeString()}</span>
                      <button onClick={loadGovernance} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}>
                        Rescan
                      </button>
                    </div>
                  </div>
                  {anomalies.anomalies.length === 0 ? (
                    <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <CheckCircle size={20} color="#10b981" />
                      <div>
                        <div style={{ color: '#34d399', fontWeight: 600 }}>No anomalies detected</div>
                        <div style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>All activity patterns are within normal thresholds</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {anomalies.anomalies.map((a, i) => (
                        <div key={i} style={{ background: `${SEV_COLORS[a.severity]}08`, border: `1px solid ${SEV_COLORS[a.severity]}30`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                          <AlertCircle size={16} color={SEV_COLORS[a.severity]} style={{ marginTop: 2, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ background: `${SEV_COLORS[a.severity]}20`, color: SEV_COLORS[a.severity], padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{a.severity}</span>
                              <span style={{ color: '#9ca3af', fontSize: 11 }}>{a.type.replace(/_/g, ' ')}</span>
                            </div>
                            <div style={{ color: '#e2e8f0', fontSize: 14 }}>{a.message}</div>
                            {a.user && <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>User: {a.user}</div>}
                          </div>
                          <div style={{ color: '#4b5563', fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(a.detected_at).toLocaleTimeString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {compliance && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Shield size={18} color="#6366f1" /> Compliance Checks
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: compliance.score >= 80 ? '#10b981' : compliance.score >= 60 ? '#f59e0b' : '#ef4444' }}>{compliance.score}%</div>
                        <div style={{ color: '#6b7280', fontSize: 11 }}>{compliance.passed}/{compliance.total} passed</div>
                      </div>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', border: `3px solid ${compliance.score >= 80 ? '#10b981' : compliance.score >= 60 ? '#f59e0b' : '#ef4444'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: compliance.score >= 80 ? '#10b981' : compliance.score >= 60 ? '#f59e0b' : '#ef4444' }}>
                        {compliance.score >= 80 ? '✓' : compliance.score >= 60 ? '!' : '✗'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {compliance.checks.map(check => (
                      <div key={check.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ marginTop: 2 }}>{STATUS_ICONS[check.status]}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>{check.title}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.06)', color: '#9ca3af', padding: '1px 8px', borderRadius: 8, fontSize: 11 }}>
                                {CAT_ICONS[check.category]} {check.category}
                              </span>
                            </div>
                            <div style={{ color: '#9ca3af', fontSize: 13 }}>{check.value}</div>
                            {check.recommendation && (
                              <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, color: '#fbbf24', fontSize: 12 }}>
                                Recommendation: {check.recommendation}
                              </div>
                            )}
                          </div>
                          <span style={{ background: `${STATUS_COLORS[check.status]}20`, color: STATUS_COLORS[check.status], padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                            {check.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!anomalies && !compliance && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <button onClick={loadGovernance} style={{ padding: '12px 24px', background: '#6366f1', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: 15 }}>
                    Run Governance Scan
                  </button>
                  <div style={{ color: '#6b7280', fontSize: 13, marginTop: 12 }}>Analyze anomalies and check compliance posture across the platform</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
