import { useState, useEffect } from 'react';
import api from '../api/client';
import { Shield, Search, User, Activity, TrendingUp, Filter, Download } from 'lucide-react';
import toast from 'react-hot-toast';

const ACTION_COLORS = {
  login: '#10b981', logout: '#6b7280', upload: '#6366f1', delete: '#ef4444',
  update: '#f59e0b', create: '#8b5cf6', execute: '#06b6d4',
};

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('logs');
  const [filters, setFilters] = useState({ user_id: '', action: '', resource_type: '', limit: 100, offset: 0 });

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(Object.entries(filters).filter(([,v]) => v !== ''));
      const res = (await api.get(`/audit?${params}`)).data;
      setLogs(res.logs || []);
      setTotal(res.total || 0);
    } catch (err) {
      if (err.response?.status === 403) toast.error('Admin access required');
      else toast.error('Failed to load audit logs');
    }
    finally { setLoading(false); }
  };

  const loadStats = async () => {
    try { setStats((await api.get('/audit/stats')).data); } catch {}
  };

  useEffect(() => { loadLogs(); loadStats(); }, []);

  const exportCSV = () => {
    const csv = ['Time,User,Action,Resource Type,Resource ID\n',
      ...logs.map(l => `${l.created_at},${l.user_name || ''},${l.action},${l.resource_type || ''},${l.resource_id || ''}`)
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'audit_logs.csv'; a.click();
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4 }}>Audit Logs</h1>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Security monitoring, compliance tracking, and user activity history</p>
        </div>
        <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', fontSize: 14 }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4 }}>
        {[['logs', 'Activity Log', Activity], ['stats', 'Statistics', TrendingUp]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: activeTab === id ? '#6366f1' : 'transparent', color: activeTab === id ? '#fff' : '#9ca3af' }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {activeTab === 'logs' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {[['action', 'Filter by action...'], ['resource_type', 'Resource type...']].map(([key, ph]) => (
              <input key={key} value={filters[key]} onChange={e => setFilters(f => ({...f, [key]: e.target.value}))} placeholder={ph}
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
          {[['Top Users', stats.byUser, 'user_name', 'name'], ['Top Actions', stats.byAction, 'action', 'action']].map(([title, data, keyField, labelField]) => (
            <div key={title} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 16 }}>{title}</h3>
              {(data || []).map((item, i) => {
                const maxCount = data[0]?.count || 1;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ color: '#9ca3af', fontSize: 13, width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item[labelField] || item[keyField]}</span>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${(item.count / maxCount) * 100}%`, height: '100%', background: '#6366f1', borderRadius: 4 }} />
                    </div>
                    <span style={{ color: '#6b7280', fontSize: 12, width: 40, textAlign: 'right' }}>{item.count}</span>
                  </div>
                );
              })}
            </div>
          ))}
          {stats.byDay?.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, gridColumn: 'span 2' }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 16 }}>Activity — Last 30 Days</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                {stats.byDay.map((d, i) => {
                  const maxCount = Math.max(...stats.byDay.map(x => x.count));
                  return (
                    <div key={i} title={`${new Date(d.day).toLocaleDateString()}: ${d.count}`} style={{ flex: 1, background: '#6366f1', borderRadius: '3px 3px 0 0', height: `${(d.count / maxCount) * 100}%`, minHeight: 2, opacity: 0.8 }} />
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ color: '#4b5563', fontSize: 11 }}>{new Date(stats.byDay[0]?.day).toLocaleDateString()}</span>
                <span style={{ color: '#4b5563', fontSize: 11 }}>{new Date(stats.byDay[stats.byDay.length-1]?.day).toLocaleDateString()}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
