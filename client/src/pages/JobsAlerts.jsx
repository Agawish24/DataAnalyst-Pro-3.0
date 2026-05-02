import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { Bell, Clock, Play, Plus, Trash2, CheckCircle, XCircle, AlertTriangle, BellRing, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

const JOB_TYPES = [
  { id: 'profile', label: 'Auto-Profile Dataset' },
  { id: 'sql_query', label: 'Run SQL Query' },
  { id: 'clean', label: 'Apply Cleaning' },
];

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Weekly on Monday', value: '0 0 * * 1' },
  { label: 'Monthly (1st)', value: '0 0 1 * *' },
];

const StatusDot = ({ status }) => {
  const colors = { active: '#10b981', paused: '#f59e0b', disabled: '#6b7280' };
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[status] || '#6b7280' }} />;
};

export default function JobsAlerts() {
  const { datasets, selectedDataset } = useData();
  const [activeTab, setActiveTab] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [showJobForm, setShowJobForm] = useState(false);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [running, setRunning] = useState({});
  const [jobRuns, setJobRuns] = useState({});
  const [jobForm, setJobForm] = useState({ name: '', job_type: 'profile', schedule_description: '', schedule_cron: '', dataset_id: '', config: {} });
  const [alertForm, setAlertForm] = useState({ name: '', dataset_id: '', condition_sql: '', threshold_value: '', comparison_operator: '>', notification_channel: 'in_app' });
  const [checking, setChecking] = useState(false);

  const loadJobs = async () => { try { setJobs((await api.get('/jobs')).data); } catch {} };
  const loadAlerts = async () => { try { setAlerts((await api.get('/jobs/alerts/list')).data); } catch {} };

  useEffect(() => { loadJobs(); loadAlerts(); }, []);
  useEffect(() => { if (selectedDataset) { setJobForm(f => ({...f, dataset_id: String(selectedDataset.id)})); setAlertForm(f => ({...f, dataset_id: String(selectedDataset.id)})); } }, [selectedDataset]);

  const createJob = async () => {
    if (!jobForm.name.trim()) return toast.error('Name required');
    try { await api.post('/jobs', jobForm); toast.success('Job created'); setShowJobForm(false); setJobForm({ name: '', job_type: 'profile', schedule_description: '', schedule_cron: '', dataset_id: '', config: {} }); loadJobs(); }
    catch { toast.error('Failed to create'); }
  };

  const runJob = async (id) => {
    setRunning(r => ({ ...r, [id]: true }));
    try {
      const res = await api.post(`/jobs/${id}/run`);
      toast.success(res.data.status === 'success' ? 'Job completed' : 'Job failed');
      loadJobs();
    } catch { toast.error('Run failed'); }
    finally { setRunning(r => ({ ...r, [id]: false })); }
  };

  const deleteJob = async (id) => {
    if (!confirm('Delete this job?')) return;
    try { await api.delete(`/jobs/${id}`); loadJobs(); } catch {}
  };

  const createAlert = async () => {
    if (!alertForm.name.trim() || !alertForm.condition_sql.trim()) return toast.error('Name and condition SQL required');
    try { await api.post('/jobs/alerts', alertForm); toast.success('Alert created'); setShowAlertForm(false); setAlertForm({ name: '', dataset_id: '', condition_sql: '', threshold_value: '', comparison_operator: '>', notification_channel: 'in_app' }); loadAlerts(); }
    catch { toast.error('Failed to create alert'); }
  };

  const checkAlerts = async () => {
    if (!selectedDataset) return toast.error('Select a dataset first');
    setChecking(true);
    try {
      const res = await api.post(`/jobs/alerts/check/${selectedDataset.id}`);
      if (res.data.triggered > 0) toast.error(`${res.data.triggered} alert(s) triggered!`);
      else toast.success(`${res.data.checked} alerts checked — none triggered`);
    } catch { toast.error('Check failed'); }
    finally { setChecking(false); }
  };

  const deleteAlert = async (id) => {
    if (!confirm('Delete this alert?')) return;
    try { await api.delete(`/jobs/alerts/${id}`); loadAlerts(); } catch {}
  };

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4 }}>Jobs & Alerts</h1>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>Schedule recurring analyses and set up threshold-based alerts</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4 }}>
        {[['jobs', 'Scheduled Jobs', Clock], ['alerts', 'Alerts', Bell]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: activeTab === id ? '#6366f1' : 'transparent', color: activeTab === id ? '#fff' : '#9ca3af' }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* Jobs */}
      {activeTab === 'jobs' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowJobForm(!showJobForm)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
              <Plus size={14} /> New Job
            </button>
          </div>

          {showJobForm && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <h3 style={{ color: '#f3f4f6', marginBottom: 14, fontWeight: 600 }}>Create Job</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {[['Job Name', 'name', 'text'], ['Description', 'schedule_description', 'text']].map(([label, key]) => (
                  <div key={key}>
                    <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>{label}</label>
                    <input value={jobForm[key]} onChange={e => setJobForm(f => ({...f, [key]: e.target.value}))}
                      style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                ))}
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Job Type</label>
                  <select value={jobForm.job_type} onChange={e => setJobForm(f => ({...f, job_type: e.target.value}))}
                    style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
                    {JOB_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Dataset</label>
                  <select value={jobForm.dataset_id} onChange={e => setJobForm(f => ({...f, dataset_id: e.target.value}))}
                    style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', fontSize: 14 }}>
                    <option value="">— Select Dataset —</option>
                    {(datasets || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>Schedule (Cron)</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {CRON_PRESETS.map(p => (
                    <button key={p.value} onClick={() => setJobForm(f => ({...f, schedule_cron: p.value, schedule_description: p.label}))}
                      style={{ padding: '5px 12px', background: jobForm.schedule_cron === p.value ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, color: jobForm.schedule_cron === p.value ? '#a5b4fc' : '#9ca3af', cursor: 'pointer', fontSize: 12 }}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <input value={jobForm.schedule_cron} onChange={e => setJobForm(f => ({...f, schedule_cron: e.target.value}))} placeholder="Custom cron: 0 8 * * *"
                  style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box', fontFamily: 'monospace' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowJobForm(false)} style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
                <button onClick={createJob} style={{ padding: '9px 16px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Create Job</button>
              </div>
            </div>
          )}

          {jobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#4b5563' }}>
              <Clock size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p>No jobs yet. Schedule recurring analyses to run automatically.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobs.map(job => (
                <div key={job.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <StatusDot status={job.status} />
                  <Zap size={16} color="#6366f1" />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>{job.name}</div>
                    <div style={{ color: '#6b7280', fontSize: 12, display: 'flex', gap: 10 }}>
                      <span>{JOB_TYPES.find(t => t.id === job.job_type)?.label || job.job_type}</span>
                      {job.dataset_name && <span>· {job.dataset_name}</span>}
                      {job.schedule_description && <span>· {job.schedule_description}</span>}
                      {job.last_run_at && <span>· Last: {new Date(job.last_run_at).toLocaleString()}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => runJob(job.id)} disabled={running[job.id]}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', background: running[job.id] ? 'rgba(99,102,241,0.2)' : '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                      <Play size={11} /> {running[job.id] ? 'Running...' : 'Run Now'}
                    </button>
                    <button onClick={() => deleteJob(job.id)} style={{ padding: '7px 10px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 8, color: '#f87171', cursor: 'pointer' }}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alerts */}
      {activeTab === 'alerts' && (
        <div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={checkAlerts} disabled={checking || !selectedDataset}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, color: '#fbbf24', cursor: 'pointer', opacity: !selectedDataset || checking ? 0.5 : 1, fontSize: 14 }}>
              <BellRing size={14} /> {checking ? 'Checking...' : 'Check Alerts Now'}
            </button>
            <button onClick={() => setShowAlertForm(!showAlertForm)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
              <Plus size={14} /> New Alert
            </button>
          </div>

          {showAlertForm && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <h3 style={{ color: '#f3f4f6', marginBottom: 14, fontWeight: 600 }}>Create Alert</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Alert Name</label>
                  <input value={alertForm.name} onChange={e => setAlertForm(f => ({...f, name: e.target.value}))} placeholder="e.g. High Sales Alert"
                    style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Dataset</label>
                  <select value={alertForm.dataset_id} onChange={e => setAlertForm(f => ({...f, dataset_id: e.target.value}))}
                    style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', fontSize: 14 }}>
                    <option value="">— Select Dataset —</option>
                    {(datasets || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Condition SQL</label>
                <input value={alertForm.condition_sql} onChange={e => setAlertForm(f => ({...f, condition_sql: e.target.value}))} placeholder="SELECT COUNT(*) FROM dataset WHERE sales > 1000"
                  style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box' }} />
                <div style={{ color: '#4b5563', fontSize: 11, marginTop: 4 }}>Use "FROM dataset" to reference the selected dataset. Must return a single numeric value.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 120px 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Operator</label>
                  <select value={alertForm.comparison_operator} onChange={e => setAlertForm(f => ({...f, comparison_operator: e.target.value}))}
                    style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
                    {['>', '<', '>=', '<=', '='].map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Threshold</label>
                  <input type="number" value={alertForm.threshold_value} onChange={e => setAlertForm(f => ({...f, threshold_value: e.target.value}))} placeholder="100"
                    style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Notification Channel</label>
                  <select value={alertForm.notification_channel} onChange={e => setAlertForm(f => ({...f, notification_channel: e.target.value}))}
                    style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
                    <option value="in_app">In-App Notification</option>
                    <option value="email">Email (configure SMTP)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAlertForm(false)} style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
                <button onClick={createAlert} style={{ padding: '9px 16px', background: '#f59e0b', border: 'none', borderRadius: 8, color: '#000', cursor: 'pointer', fontWeight: 600 }}>Create Alert</button>
              </div>
            </div>
          )}

          {alerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#4b5563' }}>
              <Bell size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p>No alerts configured. Set up threshold conditions to get notified.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map(alert => (
                <div key={alert.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Bell size={16} color={alert.last_triggered_at ? '#ef4444' : '#6b7280'} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>{alert.name}</div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2, fontFamily: 'monospace' }}>{alert.condition_sql?.slice(0, 60)}...</div>
                    <div style={{ color: '#4b5563', fontSize: 12, marginTop: 2 }}>
                      Triggers when result {alert.comparison_operator} {alert.threshold_value} · {alert.dataset_name}
                      {alert.last_triggered_at && <span style={{ color: '#f87171', marginLeft: 8 }}>⚡ Last triggered: {new Date(alert.last_triggered_at).toLocaleString()}</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteAlert(alert.id)} style={{ padding: '7px 10px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 8, color: '#f87171', cursor: 'pointer' }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
