import { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import {
  Scatter, Line, Bar
} from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend
} from 'chart.js';
import {
  Sparkles, Send, AlertTriangle, TrendingDown, TrendingUp, BarChart3,
  Code2, Lightbulb, ChevronDown, ChevronUp, Search, Zap, ShieldCheck,
  Activity, GitBranch, Target, CheckCircle2, XCircle, Clock, Database
} from 'lucide-react';
import toast from 'react-hot-toast';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

const SEV_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
const METHOD_COLOR = {
  zscore: '#6366f1', iqr: '#f59e0b',
  isolation_forest: '#ec4899', dbscan: '#10b981', 'Multi-Method ML': '#8b5cf6',
  Statistical: '#06b6d4', Pearson: '#3b82f6', IQR: '#f59e0b',
};
const METHOD_LABEL = {
  zscore: 'Z-Score', iqr: 'IQR', isolation_forest: 'Isolation Forest',
  dbscan: 'DBSCAN', 'Multi-Method ML': 'Multi-Method ML',
  Statistical: 'Statistical', Pearson: 'Pearson', IQR: 'IQR',
};

// ── Confidence bar ────────────────────────────────────────────────────────────
const ConfidenceBar = ({ value }) => {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color }} />
      </div>
      <span style={{ color, fontSize: 11, fontWeight: 700, width: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
};

// ── Finding card ─────────────────────────────────────────────────────────────
const FindingCard = ({ finding, i }) => {
  const [open, setOpen] = useState(true);
  const color = SEV_COLOR[finding.severity] || '#6366f1';
  const methodColor = METHOD_COLOR[finding.method] || '#6b7280';
  return (
    <div style={{ border: `1px solid ${color}22`, borderLeft: `3px solid ${color}`, borderRadius: '0 10px 10px 0', padding: '12px 14px', marginBottom: 8, background: `${color}06` }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ background: `${color}20`, color, padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{finding.severity}</span>
            {finding.method && (
              <span style={{ background: `${methodColor}18`, color: methodColor, padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>
                {METHOD_LABEL[finding.method] || finding.method}
              </span>
            )}
            <ConfidenceBar value={finding.confidence} />
          </div>
          <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 13 }}>{finding.title}</div>
        </div>
        <div style={{ color: '#6b7280', flexShrink: 0 }}>{open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</div>
      </div>
      {open && (
        <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 8, lineHeight: 1.65, marginBottom: 0 }}>{finding.detail}</p>
      )}
    </div>
  );
};

// ── Method agreement mini-chart ───────────────────────────────────────────────
const MethodAgreementPanel = ({ summary }) => {
  if (!summary) return null;
  const methods = [
    { key: 'zscore_flagged', label: 'Z-Score', color: METHOD_COLOR.zscore },
    { key: 'iqr_flagged', label: 'IQR', color: METHOD_COLOR.iqr },
    { key: 'isolation_forest_flagged', label: 'Isolation Forest', color: METHOD_COLOR.isolation_forest },
    { key: 'dbscan_flagged', label: 'DBSCAN', color: METHOD_COLOR.dbscan },
  ];
  const max = Math.max(...methods.map(m => summary.methods_agreement?.[m.key] || 0), 1);

  return (
    <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Target size={13} color="#8b5cf6" /> Detection Method Agreement
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {methods.map(m => {
          const count = summary.methods_agreement?.[m.key] || 0;
          const pct = Math.round((count / summary.total_rows) * 100);
          return (
            <div key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: m.color, fontSize: 12, fontWeight: 600 }}>{m.label}</span>
                <span style={{ color: '#6b7280', fontSize: 11 }}>{count} rows ({pct}%)</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: m.color, borderRadius: 3 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 18 }}>{summary.high_confidence || 0}</div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>High Confidence<br />≥75% agreement</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: 18 }}>{summary.medium_confidence || 0}</div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Medium Confidence<br />50–75% agreement</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#6366f1', fontWeight: 700, fontSize: 18 }}>{summary.anomalies_found || 0}</div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Total Anomalies<br />majority vote</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#9ca3af', fontWeight: 700, fontSize: 18 }}>{summary.anomaly_rate || 0}%</div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Anomaly Rate<br />of dataset</div>
        </div>
      </div>
    </div>
  );
};

// ── Anomaly scatter chart ─────────────────────────────────────────────────────
const AnomalyChart = ({ anomalyData }) => {
  if (!anomalyData?.series?.length) return null;
  const { series, chartColumn, summary } = anomalyData;

  const normal = series.filter(p => !p.is_anomaly && !isNaN(p.value)).map(p => ({ x: p.index, y: p.value }));
  const flagged = series.filter(p => p.is_anomaly && !isNaN(p.value)).map(p => ({ x: p.index, y: p.value }));

  const chartData = {
    datasets: [
      {
        label: 'Normal',
        data: normal,
        backgroundColor: 'rgba(99,102,241,0.5)',
        pointRadius: 3,
        pointHoverRadius: 5,
      },
      {
        label: 'Anomaly',
        data: flagged,
        backgroundColor: 'rgba(239,68,68,0.85)',
        pointRadius: 5,
        pointHoverRadius: 8,
        pointStyle: 'triangle',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9ca3af', font: { size: 12 } } },
      tooltip: {
        callbacks: {
          label: ctx => `Row ${ctx.parsed.x}: ${Number(ctx.parsed.y).toFixed(2)}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Row Index', color: '#4b5563' } },
      y: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: chartColumn, color: '#4b5563' } },
    },
  };

  // Column anomaly bar chart
  const colCounts = Object.entries(summary?.column_anomaly_counts || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxColCount = Math.max(1, ...colCounts.map(([, v]) => v));
  const colBarData = {
    labels: colCounts.map(([k]) => k),
    datasets: [{
      label: 'Anomalies',
      data: colCounts.map(([, v]) => v),
      backgroundColor: colCounts.map((_, i) => i === 0 ? 'rgba(239,68,68,0.7)' : 'rgba(99,102,241,0.5)'),
      borderRadius: 4,
    }],
  };
  const colBarOptions = {
    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { min: 0, max: maxColCount, ticks: { color: '#6b7280', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { ticks: { color: '#9ca3af', font: { size: 11 } }, grid: { display: false } },
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
        <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Activity size={13} color="#ef4444" />
          Anomaly Scatter — {chartColumn}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <span style={{ color: '#6366f1', fontSize: 12 }}>● Normal ({normal.length})</span>
            <span style={{ color: '#ef4444', fontSize: 12 }}>▲ Anomaly ({flagged.length})</span>
          </span>
        </div>
        <div style={{ height: 280 }}>
          <Scatter data={chartData} options={options} />
        </div>
      </div>

      {colCounts.length > 1 && (
        <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
            <BarChart3 size={13} color="#6366f1" /> Anomaly Count by Column
          </div>
          <div style={{ height: Math.max(120, colCounts.length * 28) }}>
            <Bar data={colBarData} options={colBarOptions} />
          </div>
        </div>
      )}

      {/* Top anomalous rows table */}
      {anomalyData.anomalies?.length > 0 && (
        <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#f3f4f6', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
            <AlertTriangle size={13} color="#f59e0b" />
            Top Anomalous Records
            <span style={{ color: '#4b5563', fontWeight: 400, fontSize: 12, marginLeft: 4 }}>sorted by confidence</span>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 280 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0d0d1a' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap' }}>Row</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Confidence</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Methods</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Columns Affected</th>
                  {anomalyData.anomalies[0]?.zscore_by_col && Object.keys(anomalyData.anomalies[0].zscore_by_col).slice(0, 3).map(c => (
                    <th key={c} style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {anomalyData.anomalies.slice(0, 20).map((a, i) => {
                  const conf = Math.round(a.confidence * 100);
                  const confColor = conf >= 75 ? '#ef4444' : conf >= 50 ? '#f59e0b' : '#10b981';
                  return (
                    <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                      <td style={{ padding: '7px 12px', color: '#9ca3af', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'monospace' }}>#{a.row_index}</td>
                      <td style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 40, height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                            <div style={{ width: `${conf}%`, height: '100%', borderRadius: 2, background: confColor }} />
                          </div>
                          <span style={{ color: confColor, fontSize: 11, fontWeight: 700 }}>{conf}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {a.methods_detected.map(m => (
                            <span key={m} style={{ background: `${METHOD_COLOR[m] || '#6366f1'}20`, color: METHOD_COLOR[m] || '#6366f1', padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
                              {m === 'isolation_forest' ? 'IF' : m === 'zscore' ? 'Z' : m.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: 11 }}>
                        {a.columns_affected.slice(0, 3).join(', ') || '—'}
                      </td>
                      {a.zscore_by_col && Object.entries(a.zscore_by_col).slice(0, 3).map(([c, z]) => (
                        <td key={c} style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: Number(z) > 3 ? '#ef4444' : '#9ca3af', fontFamily: 'monospace', fontSize: 11 }}>{Number(z).toFixed(2)}σ</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Governance panel ─────────────────────────────────────────────────────────
const GovernancePanel = ({ governance, lineage, findings, targetMetric }) => {
  if (!governance) return null;
  return (
    <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
        <ShieldCheck size={13} color="#10b981" /> Data Governance Provenance
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[
          ['Dataset', governance.name],
          ['Version', `v${governance.version || '1.0'}`],
          ['Source', governance.source_type || 'Uploaded'],
          ['Rows', governance.row_count?.toLocaleString()],
          ['Imported', governance.imported],
          ['Dataset ID', `#${governance.dataset_id}`],
        ].map(([k, v]) => (
          <div key={k} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
            <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{v || '—'}</div>
          </div>
        ))}
      </div>

      {/* Anomaly-lineage connection */}
      {findings?.some(f => f.type === 'ml_anomalies') && (
        <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <AlertTriangle size={12} color="#ef4444" />
            <span style={{ color: '#fca5a5', fontWeight: 700, fontSize: 12 }}>Anomaly Detected in Lineage</span>
          </div>
          <div style={{ color: '#7f1d1d', fontSize: 12 }}>
            Anomalous records found in metric <strong style={{ color: '#fca5a5' }}>{targetMetric}</strong> within dataset <strong style={{ color: '#fca5a5' }}>{governance.name}</strong> (v{governance.version || '1.0'}), imported {governance.imported}.
            Review upstream data pipeline for ingestion errors before this checkpoint.
          </div>
        </div>
      )}

      {lineage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(16,185,129,0.06)', borderRadius: 8 }}>
          <GitBranch size={12} color="#10b981" />
          <div>
            <span style={{ color: '#6ee7b7', fontSize: 12, fontWeight: 600 }}>Last lineage event: </span>
            <span style={{ color: '#9ca3af', fontSize: 12 }}>{lineage.event} · {new Date(lineage.timestamp).toLocaleString()}</span>
            {lineage.actor && <span style={{ color: '#4b5563', fontSize: 12 }}> by {lineage.actor}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════════
export default function BusinessQuestions() {
  const { selectedDataset, datasets } = useData();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (selectedDataset) {
      api.get(`/business-questions/suggestions/${selectedDataset.id}`).then(r => setSuggestions(r.data)).catch(() => {});
      api.get('/business-questions').then(r => setHistory(r.data)).catch(() => {});
    }
  }, [selectedDataset]);

  const ask = async (q = question) => {
    if (!q.trim()) return toast.error('Enter a question');
    if (!selectedDataset) return toast.error('Select a dataset first');
    setLoading(true);
    setResult(null);
    setTab('overview');
    try {
      const res = await api.post('/business-questions/analyze', { question: q, dataset_id: selectedDataset.id });
      setResult(res.data);
      setQuestion(q);
      const anomalyCount = res.data.anomalyData?.summary?.anomalies_found || 0;
      if (anomalyCount > 0) toast.success(`${anomalyCount} anomalies detected — ${res.data.findings?.length || 0} findings`);
      else toast.success(`Analysis complete · ${res.data.findings?.length || 0} findings`);
    } catch (err) { toast.error(err.response?.data?.error || 'Analysis failed'); }
    finally { setLoading(false); }
  };

  const copySQL = (sql) => { navigator.clipboard.writeText(sql); toast.success('SQL copied'); };

  const intentLabels = result ? Object.entries(result.intent || {}).filter(([, v]) => v).map(([k]) => k.replace('is', '').replace('Question', '')) : [];
  const anomalySummary = result?.anomalyData?.summary;
  const hasAnomalyChart = result?.anomalyData?.series?.length > 0;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <Sparkles size={13} /> },
    { id: 'anomalies', label: `Anomaly Charts${anomalySummary ? ` (${anomalySummary.anomalies_found})` : ''}`, icon: <Activity size={13} />, disabled: !hasAnomalyChart },
    { id: 'methods', label: 'Detection Methods', icon: <Target size={13} />, disabled: !anomalySummary },
    { id: 'governance', label: 'Governance', icon: <ShieldCheck size={13} />, disabled: !result?.governance },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={22} color="#6366f1" /> Business Question Engine
        </h1>
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
          Ask any business question · Multi-method anomaly detection (Z-score, IQR, Isolation Forest, DBSCAN) · Governance-linked findings · AI prescriptive insights
        </p>
      </div>

      {/* Input */}
      <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
            <input value={question} onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ask()}
              placeholder="e.g. Why did revenue drop in Q2? Where are the outliers? What caused the sales spike?"
              style={{ width: '100%', padding: '13px 13px 13px 42px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <button onClick={() => ask()} disabled={loading || !selectedDataset}
            style={{ padding: '13px 22px', background: loading ? 'rgba(99,102,241,0.4)' : '#6366f1', border: 'none', borderRadius: 9, color: '#fff', cursor: loading || !selectedDataset ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 14, opacity: !selectedDataset ? 0.5 : 1, whiteSpace: 'nowrap' }}>
            {loading ? <><Zap size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Analyzing…</> : <><Send size={14} /> Analyze</>}
          </button>
        </div>

        {suggestions.length > 0 && !result && !loading && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: '#374151', fontSize: 11, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.8 }}>Try these</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {suggestions.slice(0, 6).map((s, i) => (
                <button key={i} onClick={() => { setQuestion(s); ask(s); }}
                  style={{ padding: '5px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20, color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; e.currentTarget.style.color = '#a5b4fc'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#9ca3af'; }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!selectedDataset && (
        <div style={{ textAlign: 'center', padding: 60, color: '#374151' }}>
          <Database size={40} style={{ margin: '0 auto 12px', opacity: 0.15 }} />
          <p style={{ margin: 0 }}>Select a dataset to start your analysis</p>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <Zap size={32} color="#6366f1" style={{ animation: 'spin 0.8s linear infinite' }} />
            <div>
              <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 4 }}>Running multi-method analysis…</div>
              <div style={{ color: '#4b5563', fontSize: 13 }}>Z-Score · IQR · Isolation Forest · DBSCAN · Groq AI</div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18 }}>
          {/* Left column */}
          <div>
            {/* Stats strip */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 18px', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {intentLabels.map(l => (
                  <span key={l} style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{l}</span>
                ))}
                {result.targetMetric && <span style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', padding: '2px 10px', borderRadius: 20, fontSize: 11 }}>Metric: {result.targetMetric}</span>}
                {anomalySummary?.anomalies_found > 0 && (
                  <span style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                    ⚠ {anomalySummary.anomalies_found} Anomalies
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {[
                  ['Rows', result.dataOverview?.rows?.toLocaleString()],
                  ['Numeric Cols', result.dataOverview?.numericColumns],
                  ['Findings', result.findings?.length],
                  ['Anomalies', anomalySummary?.anomalies_found ?? '—'],
                  ['High Confidence', anomalySummary?.high_confidence ?? '—'],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 20 }}>{val}</div>
                    <div style={{ color: '#6b7280', fontSize: 11 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.06)' }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => !t.disabled && setTab(t.id)} disabled={t.disabled}
                  style={{ flex: 1, padding: '7px 10px', border: 'none', borderRadius: 8, cursor: t.disabled ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.15s', opacity: t.disabled ? 0.35 : 1, background: tab === t.id ? 'rgba(99,102,241,0.25)' : 'transparent', color: tab === t.id ? '#a5b4fc' : '#6b7280' }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Tab: Overview ─ Findings + Narrative + SQL */}
            {tab === 'overview' && (
              <div>
                {result.findings?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 8, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={14} color="#f59e0b" /> Findings ({result.findings.length})
                    </h3>
                    {result.findings.map((f, i) => <FindingCard key={i} finding={f} i={i} />)}
                  </div>
                )}

                {result.narrative && (
                  <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.14)', borderRadius: 11, padding: 18, marginBottom: 14 }}>
                    <div style={{ color: '#a5b4fc', fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={13} /> AI Prescriptive Narrative
                    </div>
                    <div style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>
                      {result.narrative}
                    </div>
                  </div>
                )}

                {result.suggestedQueries?.length > 0 && (
                  <div>
                    <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 8, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Code2 size={14} color="#06b6d4" /> Suggested SQL Queries
                    </h3>
                    {result.suggestedQueries.map((q, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: 12, marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                          <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500 }}>{q.label}</span>
                          <button onClick={() => copySQL(q.sql)} style={{ padding: '3px 9px', background: 'rgba(6,182,212,0.13)', border: 'none', borderRadius: 5, color: '#67e8f9', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>Copy SQL</button>
                        </div>
                        <code style={{ color: '#a5b4fc', fontSize: 11, fontFamily: 'monospace', display: 'block', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{q.sql}</code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Anomaly Charts */}
            {tab === 'anomalies' && hasAnomalyChart && (
              <AnomalyChart anomalyData={result.anomalyData} />
            )}

            {/* Tab: Detection Methods */}
            {tab === 'methods' && anomalySummary && (
              <div>
                <MethodAgreementPanel summary={anomalySummary} />

                {/* Column stats table */}
                {result.anomalyData?.colStats && (
                  <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#f3f4f6', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <BarChart3 size={13} color="#6b7280" /> Column Statistics & Thresholds
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#0d0d1a' }}>
                            {['Column', 'Mean', 'Std Dev', 'Q1', 'Q3', 'IQR', 'Z-Score Threshold', 'Anomalies'].map(h => (
                              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(result.anomalyData.colStats).map(([col, s], i) => (
                            <tr key={col} style={{ background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                              <td style={{ padding: '8px 12px', color: '#a5b4fc', fontFamily: 'monospace', fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: 600 }}>{col}</td>
                              {[s.mean, s.std, s.q1, s.q3, s.iqr].map((v, j) => (
                                <td key={j} style={{ padding: '8px 12px', color: '#9ca3af', fontFamily: 'monospace', fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{Number(v).toFixed(2)}</td>
                              ))}
                              <td style={{ padding: '8px 12px', color: '#6366f1', fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'monospace' }}>±{s.zscore_threshold}σ</td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <span style={{ color: (anomalySummary.column_anomaly_counts?.[col] || 0) > 0 ? '#ef4444' : '#10b981', fontWeight: 700, fontSize: 11 }}>
                                  {anomalySummary.column_anomaly_counts?.[col] || 0}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Governance */}
            {tab === 'governance' && result.governance && (
              <GovernancePanel governance={result.governance} lineage={result.lineage} findings={result.findings} targetMetric={result.targetMetric} />
            )}
          </div>

          {/* Right sidebar */}
          <div>
            {/* Recommendations */}
            {result.recommendations?.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                <h3 style={{ color: '#f3f4f6', fontWeight: 700, marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lightbulb size={13} color="#fbbf24" /> Prescriptive Actions
                </h3>
                {result.recommendations.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, marginBottom: 9, padding: '10px 11px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.1)', borderRadius: 8 }}>
                    <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 12, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                    <span style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.55 }}>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Governance quick-view */}
            {result.governance && (
              <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.12)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ color: '#6ee7b7', fontWeight: 700, fontSize: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={12} /> Lineage Summary
                </div>
                <div style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span>Dataset</span><span style={{ color: '#e2e8f0' }}>{result.governance.name}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span>Imported</span><span style={{ color: '#e2e8f0' }}>{result.governance.imported}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Rows</span><span style={{ color: '#e2e8f0' }}>{result.governance.row_count?.toLocaleString()}</span></div>
                </div>
                {result.anomalyData?.summary?.anomaly_rate > 0 && (
                  <div style={{ marginTop: 10, padding: '7px 9px', background: 'rgba(239,68,68,0.07)', borderRadius: 7, color: '#fca5a5', fontSize: 11, fontWeight: 600 }}>
                    ⚠ {result.anomalyData.summary.anomaly_rate}% anomaly rate detected — review pipeline
                  </div>
                )}
              </div>
            )}

            {/* Cross-dataset suggestion */}
            {result.anomalyData?.summary?.anomalies_found > 0 && (
              <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ color: '#a5b4fc', fontWeight: 700, fontSize: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GitBranch size={12} /> Cross-Dataset Analysis
                </div>
                <div style={{ color: '#6b7280', fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
                  Anomalies in <strong style={{ color: '#9ca3af' }}>{result.targetMetric}</strong> may be explained by changes in related datasets. Consider comparing:
                </div>
                {(datasets || []).filter(d => d.id !== selectedDataset?.id).slice(0, 3).map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <Database size={11} color="#6b7280" />
                    <span style={{ color: '#9ca3af', fontSize: 12, flex: 1 }}>{d.name}</span>
                    <button onClick={() => toast('Switch dataset and re-run analysis')}
                      style={{ background: 'rgba(99,102,241,0.15)', border: 'none', borderRadius: 4, color: '#a5b4fc', cursor: 'pointer', fontSize: 10, padding: '2px 7px', fontWeight: 700 }}>
                      Analyze
                    </button>
                  </div>
                ))}
                {(!datasets || datasets.filter(d => d.id !== selectedDataset?.id).length === 0) && (
                  <div style={{ color: '#374151', fontSize: 12 }}>Upload additional datasets to enable cross-dataset root cause analysis.</div>
                )}
              </div>
            )}

            {/* History */}
            {history.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                <h3 style={{ color: '#4b5563', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                  <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 5 }} />Recent
                </h3>
                {history.slice(0, 8).map(h => (
                  <button key={h.id} onClick={() => ask(h.question)}
                    style={{ width: '100%', textAlign: 'left', padding: '7px 8px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', marginBottom: 1 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <div style={{ color: '#9ca3af', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.question}</div>
                    <div style={{ color: '#374151', fontSize: 10 }}>{new Date(h.created_at).toLocaleDateString()}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
