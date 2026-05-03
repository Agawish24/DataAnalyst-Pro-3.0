import { useState, useEffect, useRef, useCallback } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, RadialLinearScale, Filler
} from 'chart.js';
import { Bar, Line, Pie, Doughnut, Scatter, Radar } from 'react-chartjs-2';
import {
  BarChart3, Download, Save, FileDown, Trash2, BookOpen, Shield, AlertTriangle,
  ChevronRight, Filter, X, Plus, RefreshCw, Code2, ExternalLink, GitBranch,
  Eye, Lock, Database, Sparkles, Copy, CheckCircle2
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, RadialLinearScale, Filler);

const CHART_TYPES = ['bar', 'line', 'pie', 'doughnut', 'scatter', 'radar'];
const AGGREGATIONS = ['count', 'sum', 'avg', 'max', 'min', 'median'];
const OPERATORS = [
  { v: '=', l: '=' }, { v: '!=', l: '≠' }, { v: '>', l: '>' }, { v: '>=', l: '≥' },
  { v: '<', l: '<' }, { v: '<=', l: '≤' }, { v: 'contains', l: 'contains' },
  { v: 'not_contains', l: "doesn't contain" }, { v: 'is_null', l: 'is null' }, { v: 'is_not_null', l: 'is not null' },
];
const PALETTES = {
  indigo: ['rgba(99,102,241,0.85)', 'rgba(139,92,246,0.85)', 'rgba(59,130,246,0.85)', 'rgba(6,182,212,0.85)', 'rgba(16,185,129,0.85)', 'rgba(245,158,11,0.85)', 'rgba(239,68,68,0.85)', 'rgba(236,72,153,0.85)'],
  warm:   ['rgba(239,68,68,0.85)', 'rgba(245,158,11,0.85)', 'rgba(234,179,8,0.85)', 'rgba(236,72,153,0.85)', 'rgba(168,85,247,0.85)', 'rgba(99,102,241,0.85)', 'rgba(59,130,246,0.85)', 'rgba(16,185,129,0.85)'],
  cool:   ['rgba(6,182,212,0.85)', 'rgba(59,130,246,0.85)', 'rgba(99,102,241,0.85)', 'rgba(139,92,246,0.85)', 'rgba(16,185,129,0.85)', 'rgba(52,211,153,0.85)', 'rgba(103,232,249,0.85)', 'rgba(167,243,208,0.85)'],
  sunset: ['rgba(251,113,133,0.85)', 'rgba(251,146,60,0.85)', 'rgba(253,224,71,0.85)', 'rgba(134,239,172,0.85)', 'rgba(103,232,249,0.85)', 'rgba(165,180,252,0.85)', 'rgba(249,168,212,0.85)', 'rgba(253,186,116,0.85)'],
};

const s = (children, style = {}) => (
  <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, ...style }}>
    {children}
  </div>
);

const chip = (label, color = '#6366f1', small = false) => (
  <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, padding: small ? '1px 6px' : '3px 10px', borderRadius: 20, fontSize: small ? 10 : 11, fontWeight: 700 }}>{label}</span>
);

export default function Visualization() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const chartRef = useRef(null);

  // Config state
  const [config, setConfig] = useState({
    type: 'bar', xKey: '', yKey: '', title: '', palette: 'indigo',
    aggregation: 'count', limit: 50,
  });

  // Data state
  const [chartData, setChartData] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [totalGroups, setTotalGroups] = useState(0);
  const [loading, setLoading] = useState(false);

  // Drill-down state
  const [drillPath, setDrillPath] = useState([]); // [{xKey, xValue, label}]
  const [drillKey, setDrillKey] = useState('');

  // Filter state
  const [filters, setFilters] = useState([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [distinctValues, setDistinctValues] = useState([]);
  const [filterDraft, setFilterDraft] = useState({ column: '', operator: '=', value: '' });

  // Governance state
  const [governance, setGovernance] = useState(null);
  const [showGovernance, setShowGovernance] = useState(false);

  // Export / embed state
  const [showExport, setShowExport] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [savedCharts, setSavedCharts] = useState([]);
  const [showSaved, setShowSaved] = useState(false);
  const [savingChart, setSavingChart] = useState(false);

  // Tab
  const [activeTab, setActiveTab] = useState('chart'); // chart | table | governance | export | saved

  useEffect(() => { fetchDatasets(); loadSavedCharts(); }, []);

  useEffect(() => {
    if (!activeDataset) return;
    // Auto-select best columns
    const schema = activeDataset.schema || [];
    const cols = Array.isArray(schema) ? schema : Object.entries(schema).map(([n, t]) => ({ name: n, type: t }));
    const numCol = cols.find(c => ['numeric', 'integer', 'float', 'decimal', 'double', 'number'].some(k => String(c.type).toLowerCase().includes(k)));
    const catCol = cols.find(c => !['numeric', 'integer', 'float', 'decimal', 'double', 'number'].some(k => String(c.type).toLowerCase().includes(k)));
    setConfig(prev => ({
      ...prev,
      xKey: catCol?.name || cols[0]?.name || '',
      yKey: numCol?.name || '',
    }));
    setFilters([]);
    setDrillPath([]);
    setGovernance(null);
    loadGovernance(activeDataset.id);
  }, [activeDataset]);

  // Auto-run chart when config/filters/drillPath change
  useEffect(() => {
    if (activeDataset && config.xKey) {
      const dKey = drillPath.length > 0 ? (drillKey || config.xKey) : config.xKey;
      runChart(dKey, drillPath);
    }
  }, [activeDataset, config.xKey, config.yKey, config.aggregation, config.limit, config.type, filters, drillPath]);

  const loadGovernance = async (id) => {
    try { const r = await api.get(`/visualization/governance/${id}`); setGovernance(r.data); }
    catch {}
  };

  const loadSavedCharts = async () => {
    try { const r = await api.get('/visualization/charts'); setSavedCharts(r.data); }
    catch {}
  };

  const runChart = async (xKeyOverride, drillPathOverride) => {
    if (!activeDataset || !config.xKey) return;
    setLoading(true);
    try {
      const xK = xKeyOverride || config.xKey;
      const effectiveFilters = [
        ...filters,
        ...drillPathOverride.map(d => ({ column: d.xKey, operator: '=', value: d.xValue })),
      ];

      if (config.type === 'scatter') {
        const r = await api.post('/visualization/scatter', {
          datasetId: activeDataset.id, xKey: config.xKey, yKey: config.yKey || config.xKey,
          filters: effectiveFilters, limit: Math.min(config.limit * 40, 2000),
        });
        buildScatterChart(r.data.rows);
        setTotalRows(r.data.rows.length);
        return;
      }

      const r = await api.post('/visualization/aggregate', {
        datasetId: activeDataset.id, xKey: xK,
        yKey: config.yKey || null, aggregation: config.aggregation,
        filters: effectiveFilters, limit: config.limit,
      });
      setRawRows(r.data.rows);
      setTotalRows(r.data.totalRows);
      setTotalGroups(r.data.total);
      buildChart(r.data.rows, xK);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Query failed');
    } finally { setLoading(false); }
  };

  const buildChart = (rows, xK) => {
    if (!rows?.length) { setChartData(null); return; }
    const colors = PALETTES[config.palette] || PALETTES.indigo;
    const labels = rows.map(r => String(r.label ?? '').slice(0, 40) || '(empty)');
    const data = rows.map(r => parseFloat(r.value) || 0);
    const bgColors = labels.map((_, i) => colors[i % colors.length]);
    setChartData({
      labels,
      datasets: [{
        label: config.title || `${config.yKey || 'count'} by ${xK}`,
        data,
        backgroundColor: bgColors,
        borderColor: bgColors.map(c => c.replace('0.85)', '1)')),
        borderWidth: 1,
        borderRadius: config.type === 'bar' ? 6 : 0,
        fill: config.type === 'radar',
        tension: 0.4,
        pointRadius: 4,
      }],
    });
  };

  const buildScatterChart = (rows) => {
    const colors = PALETTES[config.palette] || PALETTES.indigo;
    setRawRows(rows.map(r => ({ [config.xKey]: r.x, [config.yKey]: r.y })));
    setChartData({
      datasets: [{
        label: `${config.xKey} vs ${config.yKey}`,
        data: rows.map(r => ({ x: r.x, y: r.y })),
        backgroundColor: colors[0],
        pointRadius: 4,
      }],
    });
  };

  // Drill-down: click bar → filter on that value, break down by another column
  const handleChartClick = async (elements) => {
    if (!elements?.length || !chartData) return;
    const idx = elements[0].index;
    const label = chartData.labels[idx];
    const currentXKey = drillPath.length > 0 && drillKey ? drillKey : config.xKey;

    if (!drillKey || drillKey === currentXKey) {
      toast('Select a "Drill Into" column to enable drill-down', { icon: '💡' });
      return;
    }

    const newDrillPath = [...drillPath, { xKey: currentXKey, xValue: label, label: `${currentXKey} = "${label}"` }];
    setDrillPath(newDrillPath);
    // runChart will auto-trigger via useEffect watching drillPath
  };

  const popDrill = (idx) => {
    setDrillPath(drillPath.slice(0, idx));
  };

  // Filters
  const addFilter = () => {
    if (!filterDraft.column) return;
    if (!['is_null', 'is_not_null'].includes(filterDraft.operator) && !filterDraft.value) return;
    setFilters(prev => [...prev, { ...filterDraft }]);
    setFilterDraft({ column: '', operator: '=', value: '' });
  };

  const removeFilter = (i) => setFilters(prev => prev.filter((_, j) => j !== i));

  const loadDistinctValues = async (col) => {
    if (!activeDataset || !col) return;
    try {
      const r = await api.get(`/visualization/distinct/${activeDataset.id}/${col}`);
      setDistinctValues(r.data || []);
    } catch { setDistinctValues([]); }
  };

  // Save chart
  const saveChart = async () => {
    if (!chartData || !activeDataset) return toast.error('Build a chart first');
    setSavingChart(true);
    try {
      const name = config.title || `${config.type} — ${config.yKey || 'count'} by ${drillPath.length > 0 ? drillKey : config.xKey}`;
      const lineageSnapshot = governance ? {
        datasetId: activeDataset.id, datasetName: governance.datasetName,
        version: governance.latestVersion?.id, piiColumns: governance.piiColumns?.length,
        complianceWarnings: governance.complianceWarnings,
      } : {};
      await api.post('/visualization/charts', { name, datasetId: activeDataset.id, config, filters, lineageSnapshot });
      toast.success(`"${name}" saved`);
      loadSavedCharts();
    } catch { toast.error('Save failed'); }
    finally { setSavingChart(false); }
  };

  const deleteChart = async (id) => {
    try { await api.delete(`/visualization/charts/${id}`); loadSavedCharts(); toast.success('Deleted'); }
    catch { toast.error('Delete failed'); }
  };

  const loadChart = (c) => {
    const ds = datasets.find(d => d.id === c.dataset_id);
    if (ds) selectDataset(ds);
    setConfig(c.config || config);
    setFilters(c.filters || []);
    setDrillPath([]);
    setShowSaved(false);
    toast.success('Chart loaded');
  };

  // Exports
  const downloadPNG = () => {
    if (!chartRef.current) return toast.error('No chart');
    const link = document.createElement('a');
    link.download = `${(config.title || 'chart').replace(/\s+/g, '_')}.png`;
    link.href = chartRef.current.canvas.toDataURL('image/png');
    link.click();
    toast.success('PNG downloaded');
  };

  const exportCSV = () => {
    if (!rawRows.length) return toast.error('No data');
    const hdrs = Object.keys(rawRows[0]);
    const lines = rawRows.map(r => hdrs.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[hdrs.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = `${(config.title || 'chart-data').replace(/\s+/g, '_')}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`${rawRows.length} rows exported`);
  };

  const downloadPowerBI = () => {
    if (!activeDataset) return;
    window.open(`/api/visualization/powerbi/${activeDataset.id}`, '_blank');
    toast.success('Power BI JSON downloading…');
  };

  const downloadTableau = (type = 'twb') => {
    if (!activeDataset) return;
    window.open(`/api/tableau/export/${activeDataset.id}/${type}`, '_blank');
    toast.success(`Tableau .${type} downloading…`);
  };

  const copyEmbedCode = async (chartId) => {
    try {
      const r = await api.get(`/visualization/embed/${chartId}`);
      await navigator.clipboard.writeText(r.data.iframeCode);
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2000);
      toast.success('Embed code copied');
    } catch { toast.error('Copy failed'); }
  };

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    onClick: (_, elements) => handleChartClick(elements),
    plugins: {
      legend: { display: true, labels: { color: '#9ca3af', font: { size: 11 } } },
      title: { display: !!config.title, text: config.title, color: '#f3f4f6', font: { size: 14, weight: '700' } },
      tooltip: { backgroundColor: '#1e1e2e', titleColor: '#f3f4f6', bodyColor: '#9ca3af', cornerRadius: 8, padding: 10 },
    },
    scales: ['pie', 'doughnut', 'radar'].includes(config.type) ? {} : {
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', font: { size: 11 } } },
      x: { grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 45, font: { size: 11 } } },
    },
    ...(config.type === 'bar' ? { onClick: (_, elements) => handleChartClick(elements) } : {}),
  };

  const renderChart = () => {
    if (!chartData) return null;
    const props = { ref: chartRef, data: chartData, options: chartOptions };
    switch (config.type) {
      case 'bar':      return <Bar {...props} />;
      case 'line':     return <Line {...props} />;
      case 'pie':      return <Pie {...props} />;
      case 'doughnut': return <Doughnut {...props} />;
      case 'scatter':  return <Scatter {...props} />;
      case 'radar':    return <Radar {...props} />;
      default:         return <Bar {...props} />;
    }
  };

  const cols = activeDataset?.schema
    ? (Array.isArray(activeDataset.schema) ? activeDataset.schema.map(c => c.name) : Object.keys(activeDataset.schema))
    : [];

  const numCols = activeDataset?.schema
    ? (Array.isArray(activeDataset.schema) ? activeDataset.schema : Object.entries(activeDataset.schema).map(([n, t]) => ({ name: n, type: t })))
        .filter(c => ['numeric', 'integer', 'float', 'decimal', 'double', 'number'].some(k => String(c.type).toLowerCase().includes(k)))
        .map(c => c.name)
    : [];

  const govWarnings = governance?.complianceWarnings || [];
  const piiInChart = governance?.piiColumns?.filter(c => [config.xKey, config.yKey].includes(c.name)) || [];

  const tabBtn = (id, label, count) => (
    <button key={id} onClick={() => setActiveTab(id)} style={{
      padding: '7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
      background: activeTab === id ? 'rgba(99,102,241,0.2)' : 'transparent',
      color: activeTab === id ? '#a5b4fc' : '#6b7280',
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {label}
      {count > 0 && <span style={{ background: activeTab === id ? '#6366f1' : '#374151', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10, lineHeight: '16px' }}>{count}</span>}
    </button>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart3 size={24} color="#6366f1" /> Visualization
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>Enterprise</span>
          </h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: 13 }}>Server-side aggregation · Drill-downs · Filters · PowerBI/Tableau export · Governance</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSaved(s => !s)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: showSaved ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <BookOpen size={13} /> Saved {savedCharts.length > 0 && <span style={{ background: '#6366f1', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{savedCharts.length}</span>}
          </button>
          <button onClick={saveChart} disabled={!chartData || savingChart} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: chartData ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#374151', color: 'white', cursor: chartData ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
            <Save size={13} /> {savingChart ? 'Saving…' : 'Save Chart'}
          </button>
          <button onClick={downloadPNG} disabled={!chartData} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: chartData ? '#0f766e' : '#374151', color: 'white', cursor: chartData ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
            <Download size={13} /> PNG
          </button>
          <button onClick={exportCSV} disabled={!rawRows.length} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: rawRows.length ? '#065f46' : '#374151', color: 'white', cursor: rawRows.length ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
            <FileDown size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Saved Charts panel */}
      {showSaved && (
        <div style={{ marginBottom: 16, background: '#13131f', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14 }}>Saved Charts</span>
            <span style={{ color: '#6b7280', fontSize: 12 }}>Stored in database — available across sessions</span>
          </div>
          {savedCharts.length === 0
            ? <div style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: 20 }}>No saved charts yet — configure a chart and click Save Chart</div>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
              {savedCharts.map(c => (
                <div key={c.id} style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => loadChart(c)}>
                    <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ color: '#6b7280', fontSize: 11 }}>{c.dataset_name} · {c.config?.type} · {new Date(c.created_at).toLocaleDateString()}</div>
                    {c.lineage_snapshot?.piiColumns > 0 && (
                      <div style={{ marginTop: 4 }}><span style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c', padding: '1px 6px', borderRadius: 8, fontSize: 10 }}>⚠ PII data</span></div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => copyEmbedCode(c.id)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }} title="Copy embed code"><Code2 size={12} /></button>
                    <button onClick={() => deleteChart(c.id)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>}
        </div>
      )}

      {/* Dataset selector */}
      <div style={{ marginBottom: 16, background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 }}>
        <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Dataset</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {datasets.map(ds => (
            <button key={ds.id} onClick={() => selectDataset(ds)} style={{
              padding: '7px 14px', borderRadius: 20, border: '1px solid',
              borderColor: activeDataset?.id === ds.id ? '#6366f1' : 'rgba(255,255,255,0.1)',
              background: activeDataset?.id === ds.id ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
              color: activeDataset?.id === ds.id ? '#a5b4fc' : '#6b7280',
              cursor: 'pointer', fontSize: 12, fontWeight: activeDataset?.id === ds.id ? 700 : 400,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {ds.name}
              <span style={{ color: '#4b5563', fontSize: 10 }}>{(ds.row_count || 0).toLocaleString()} rows</span>
            </button>
          ))}
        </div>
      </div>

      {/* PII + governance warning banner */}
      {piiInChart.length > 0 && (
        <div style={{ marginBottom: 14, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <AlertTriangle size={15} color="#f97316" />
          <span style={{ color: '#fdba74', fontSize: 13 }}>
            <strong>Governance alert:</strong> {piiInChart.map(c => `"${c.name}" ${c.masked ? '(masked)' : '⚠ unmasked PII'}`).join(', ')} — ensure compliance before sharing this chart
          </span>
          <button onClick={() => setActiveTab('governance')} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(249,115,22,0.3)', background: 'transparent', color: '#f97316', cursor: 'pointer', fontSize: 11 }}>View Governance</button>
        </div>
      )}

      {!activeDataset ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#4b5563' }}>
          <BarChart3 size={56} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }} />
          <div style={{ fontSize: 15, color: '#6b7280' }}>Select a dataset to start visualizing</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
          {/* ── Config panel ───────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {s(
              <div style={{ padding: 16 }}>
                <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Chart Configuration</div>

                {/* Chart type */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 7, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Chart Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
                    {CHART_TYPES.map(t => (
                      <button key={t} onClick={() => setConfig(p => ({ ...p, type: t }))} style={{
                        padding: '6px 4px', borderRadius: 7, border: `1px solid ${config.type === t ? '#6366f1' : 'rgba(255,255,255,0.08)'}`,
                        background: config.type === t ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                        color: config.type === t ? '#a5b4fc' : '#6b7280', cursor: 'pointer', fontSize: 11, fontWeight: config.type === t ? 700 : 400, textTransform: 'capitalize',
                      }}>{t}</button>
                    ))}
                  </div>
                </div>

                {/* X axis */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>X Axis / Label</label>
                  <select value={config.xKey} onChange={e => setConfig(p => ({ ...p, xKey: e.target.value }))}
                    style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12 }}>
                    <option value="">Select column…</option>
                    {cols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Y axis */}
                {config.type !== 'scatter' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Y Axis / Value</label>
                    <select value={config.yKey} onChange={e => setConfig(p => ({ ...p, yKey: e.target.value }))}
                      style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12 }}>
                      <option value="">Count (rows)</option>
                      {numCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                {/* Aggregation */}
                {config.yKey && config.type !== 'scatter' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Aggregation</label>
                    <select value={config.aggregation} onChange={e => setConfig(p => ({ ...p, aggregation: e.target.value }))}
                      style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12 }}>
                      {AGGREGATIONS.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
                    </select>
                  </div>
                )}

                {/* Drill-into column */}
                {config.type === 'bar' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ color: '#8b5cf6', fontSize: 11, display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Drill Into Column</label>
                    <select value={drillKey} onChange={e => setDrillKey(e.target.value)}
                      style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 8, color: '#c4b5fd', padding: '8px 10px', fontSize: 12 }}>
                      <option value="">Click bar to drill…</option>
                      {cols.filter(c => c !== config.xKey).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div style={{ color: '#4b5563', fontSize: 10, marginTop: 4 }}>Click any bar to drill down by this column</div>
                  </div>
                )}

                {/* Max items slider */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Max Groups: {config.limit}</label>
                  <input type="range" min="5" max="200" step="5" value={config.limit}
                    onChange={e => setConfig(p => ({ ...p, limit: parseInt(e.target.value) }))}
                    style={{ width: '100%', accentColor: '#6366f1' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151', fontSize: 10 }}><span>5</span><span>200</span></div>
                </div>

                {/* Palette */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Color Palette</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(PALETTES).map(([p, colors]) => (
                      <button key={p} onClick={() => setConfig(c => ({ ...c, palette: p }))} style={{
                        padding: '4px 10px', borderRadius: 20, border: `2px solid ${config.palette === p ? '#f3f4f6' : 'transparent'}`,
                        background: `linear-gradient(90deg,${colors[0]},${colors[1]},${colors[2]})`,
                        cursor: 'pointer', fontSize: 10, color: '#fff', fontWeight: 600, textTransform: 'capitalize',
                      }}>{p}</button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Chart Title</label>
                  <input type="text" placeholder="Optional…" value={config.title} onChange={e => setConfig(p => ({ ...p, title: e.target.value }))}
                    style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }} />
                </div>

                {/* Filter toggle */}
                <button onClick={() => setShowFilterPanel(v => !v)}
                  style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: `1px solid ${showFilterPanel ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`, background: showFilterPanel ? 'rgba(99,102,241,0.1)' : 'transparent', color: showFilterPanel ? '#a5b4fc' : '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                  <Filter size={12} /> Filters {filters.length > 0 && <span style={{ background: '#6366f1', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{filters.length}</span>}
                </button>
              </div>
            )}

            {/* Stats card */}
            {chartData && s(
              <div style={{ padding: 14 }}>
                <div style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Query Stats</div>
                {[
                  { label: 'Dataset rows', val: (totalRows || activeDataset.row_count || 0).toLocaleString(), color: '#6366f1' },
                  { label: 'Groups shown', val: `${rawRows.length} / ${totalGroups}`, color: '#10b981' },
                  { label: 'Active filters', val: filters.length, color: filters.length > 0 ? '#f59e0b' : '#4b5563' },
                  { label: 'Drill depth', val: drillPath.length, color: drillPath.length > 0 ? '#8b5cf6' : '#4b5563' },
                ].map(s2 => (
                  <div key={s2.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>{s2.label}</span>
                    <span style={{ color: s2.color, fontSize: 12, fontWeight: 700 }}>{s2.val}</span>
                  </div>
                ))}
                {governance?.latestVersion && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, color: '#8b5cf6', fontSize: 11 }}>
                    <GitBranch size={11} /> v{governance.latestVersion.id}: {governance.latestVersion.description || 'snapshot'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Main chart area ──────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Filter panel */}
            {showFilterPanel && s(
              <div style={{ padding: 16 }}>
                <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Filter size={13} color="#f59e0b" /> Filter Data
                  <span style={{ color: '#6b7280', fontSize: 11, fontWeight: 400 }}>— applied server-side before aggregation</span>
                </div>
                {/* Active filters */}
                {filters.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {filters.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 20, padding: '4px 10px 4px 12px' }}>
                        <span style={{ color: '#fcd34d', fontSize: 12 }}><code>{f.column}</code> {OPERATORS.find(o => o.v === f.operator)?.l} {f.value && <em>{f.value}</em>}</span>
                        <button onClick={() => removeFilter(i)} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 0, lineHeight: 1 }}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Add filter row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr auto', gap: 8, alignItems: 'center' }}>
                  <select value={filterDraft.column} onChange={e => { setFilterDraft(p => ({ ...p, column: e.target.value, value: '' })); loadDistinctValues(e.target.value); }}
                    style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12 }}>
                    <option value="">Column…</option>
                    {cols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={filterDraft.operator} onChange={e => setFilterDraft(p => ({ ...p, operator: e.target.value }))}
                    style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12 }}>
                    {OPERATORS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  {!['is_null', 'is_not_null'].includes(filterDraft.operator) && (
                    distinctValues.length > 0
                      ? <select value={filterDraft.value} onChange={e => setFilterDraft(p => ({ ...p, value: e.target.value }))}
                          style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12 }}>
                          <option value="">Select value…</option>
                          {distinctValues.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      : <input value={filterDraft.value} onChange={e => setFilterDraft(p => ({ ...p, value: e.target.value }))} placeholder="Value…"
                          style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12 }} />
                  )}
                  {['is_null', 'is_not_null'].includes(filterDraft.operator) && <div />}
                  <button onClick={addFilter} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'rgba(245,158,11,0.2)', color: '#fcd34d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    <Plus size={12} /> Add
                  </button>
                </div>
              </div>
            )}

            {/* Drill breadcrumbs */}
            {drillPath.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                <span style={{ color: '#8b5cf6', fontSize: 12, fontWeight: 700 }}>Drill-down:</span>
                <button onClick={() => setDrillPath([])} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12, padding: '2px 6px', borderRadius: 5 }}>
                  {activeDataset.name}
                </button>
                {drillPath.map((d, i) => (
                  <>
                    <ChevronRight key={`arrow-${i}`} size={12} color="#8b5cf6" />
                    <button key={`d-${i}`} onClick={() => popDrill(i + 1)} style={{ background: i === drillPath.length - 1 ? 'rgba(139,92,246,0.2)' : 'none', border: i === drillPath.length - 1 ? '1px solid rgba(139,92,246,0.3)' : 'none', color: '#c4b5fd', cursor: 'pointer', fontSize: 12, padding: '2px 8px', borderRadius: 5, fontWeight: i === drillPath.length - 1 ? 700 : 400 }}>
                      {d.label}
                    </button>
                  </>
                ))}
                <button onClick={() => setDrillPath([])} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}><X size={12} /></button>
              </div>
            )}

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 4 }}>
              {tabBtn('chart', 'Chart', 0)}
              {tabBtn('table', 'Data Table', rawRows.length)}
              {tabBtn('governance', 'Governance', govWarnings.length)}
              {tabBtn('export', 'Export & Embed', 0)}
            </div>

            {/* ── CHART TAB ────────────────────────────────────────── */}
            {activeTab === 'chart' && s(
              <div style={{ padding: 20 }}>
                {loading && (
                  <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
                    <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
                    <div style={{ fontSize: 13 }}>Running server-side aggregation…</div>
                  </div>
                )}
                {!loading && chartData && (
                  <div style={{ height: 420 }}>{renderChart()}</div>
                )}
                {!loading && !chartData && (
                  <div style={{ textAlign: 'center', padding: 80, color: '#4b5563' }}>
                    <BarChart3 size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                    <div style={{ fontSize: 13 }}>Select X Axis column to build chart</div>
                  </div>
                )}
                {!loading && chartData && drillKey && config.type === 'bar' && (
                  <div style={{ marginTop: 12, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
                    Click any bar to drill down by <strong style={{ color: '#8b5cf6' }}>{drillKey}</strong>
                  </div>
                )}
              </div>
            )}

            {/* ── DATA TABLE TAB ────────────────────────────────── */}
            {activeTab === 'table' && s(
              <div>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>
                    Showing {rawRows.length} of {totalGroups} groups — {(totalRows || 0).toLocaleString()} total rows processed server-side
                  </span>
                  <button onClick={exportCSV} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(99,102,241,0.3)', background: 'transparent', color: '#818cf8', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <FileDown size={12} /> Export CSV
                  </button>
                </div>
                <div style={{ overflowX: 'auto', maxHeight: 440 }}>
                  {rawRows.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>{Object.keys(rawRows[0]).map(h => <th key={h} style={{ padding: '9px 14px', textAlign: 'left', color: '#6b7280', background: '#0d0d1a', borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', fontWeight: 600 }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rawRows.map((row, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                            {Object.values(row).map((v, j) => (
                              <td key={j} style={{ padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#e2e8f0' }}>
                                {typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(v ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <div style={{ padding: 40, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>No data — build a chart first</div>}
                </div>
              </div>
            )}

            {/* ── GOVERNANCE TAB ────────────────────────────────── */}
            {activeTab === 'governance' && s(
              <div style={{ padding: 20 }}>
                {!governance ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#4b5563', fontSize: 13 }}>Loading governance data…</div>
                ) : (
                  <>
                    {/* Lineage provenance */}
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <GitBranch size={14} color="#8b5cf6" /> Data Provenance
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
                        {[
                          { label: 'Dataset', val: governance.datasetName, color: '#6366f1', icon: Database },
                          { label: 'Version', val: governance.latestVersion ? `v${governance.latestVersion.id}: ${governance.latestVersion.description || 'snapshot'}` : 'No versions', color: '#8b5cf6', icon: GitBranch },
                          { label: 'Total Rows', val: (governance.rowCount || 0).toLocaleString(), color: '#10b981', icon: BarChart3 },
                        ].map(item => (
                          <div key={item.label} style={{ background: '#0d0d1a', borderRadius: 10, padding: 14, border: `1px solid ${item.color}22` }}>
                            <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}><item.icon size={11} />{item.label}</div>
                            <div style={{ color: item.color, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.val}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ background: '#0d0d1a', borderRadius: 10, padding: 14, flex: 1, border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 5 }}>Downstream Usage</div>
                          <div style={{ color: '#e2e8f0', fontSize: 12 }}>{governance.queryCount} queries · {governance.reportCount} reports</div>
                        </div>
                        <div style={{ background: '#0d0d1a', borderRadius: 10, padding: 14, flex: 1, border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 5 }}>PII Exposure</div>
                          <div style={{ color: governance.piiColumns?.length > 0 ? '#f97316' : '#22c55e', fontSize: 12, fontWeight: 700 }}>
                            {governance.piiColumns?.length || 0} PII · {governance.maskedCount} masked
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Compliance warnings */}
                    {govWarnings.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <AlertTriangle size={13} color="#f97316" /> Compliance Warnings
                        </div>
                        {govWarnings.map((w, i) => (
                          <div key={i} style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '8px 12px', marginBottom: 6, color: '#fca5a5', fontSize: 12 }}>
                            ⚠ {w}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* PII column list */}
                    {governance.piiColumns?.length > 0 && (
                      <div>
                        <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Lock size={13} color="#f97316" /> PII Columns
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {governance.piiColumns.map(c => (
                            <div key={c.name} style={{ background: c.masked ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${c.masked ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 8, padding: '6px 12px' }}>
                              <div style={{ color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{c.name}</div>
                              <div style={{ color: c.masked ? '#6ee7b7' : '#fca5a5', fontSize: 10 }}>{c.masked ? `✓ ${c.maskType}` : '⚠ Unmasked'}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {govWarnings.length === 0 && governance.piiColumns?.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 30, color: '#22c55e' }}>
                        <CheckCircle2 size={28} style={{ margin: '0 auto 8px', display: 'block' }} />
                        <div style={{ fontSize: 13 }}>No governance issues detected — this dataset is safe to visualize and share</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── EXPORT & EMBED TAB ────────────────────────────── */}
            {activeTab === 'export' && s(
              <div style={{ padding: 20 }}>
                <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Export & Integration</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
                  {/* PNG */}
                  <div style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
                    <div style={{ color: '#10b981', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>PNG Image</div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>High-resolution chart image for presentations and reports</div>
                    <button onClick={downloadPNG} disabled={!chartData} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: chartData ? '#0f766e' : '#374151', color: 'white', cursor: chartData ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Download size={13} /> Download PNG
                    </button>
                  </div>
                  {/* CSV */}
                  <div style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
                    <div style={{ color: '#6366f1', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>CSV Data</div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>Aggregated chart data as CSV — {rawRows.length} rows</div>
                    <button onClick={exportCSV} disabled={!rawRows.length} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: rawRows.length ? 'rgba(99,102,241,0.2)' : '#374151', color: rawRows.length ? '#a5b4fc' : '#6b7280', cursor: rawRows.length ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileDown size={13} /> Export CSV
                    </button>
                  </div>
                  {/* Power BI */}
                  <div style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
                    <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Power BI JSON</div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>Power BI REST API compatible dataset definition — import directly</div>
                    <button onClick={downloadPowerBI} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(245,158,11,0.15)', color: '#fcd34d', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ExternalLink size={13} /> Export for Power BI
                    </button>
                  </div>
                  {/* Tableau */}
                  <div style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
                    <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Tableau</div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>Export as Tableau Workbook (.twb) or Data Source (.tds)</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => downloadTableau('twb')} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'rgba(59,130,246,0.15)', color: '#93c5fd', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        .twb Workbook
                      </button>
                      <button onClick={() => downloadTableau('tds')} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'rgba(59,130,246,0.1)', color: '#93c5fd', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        .tds Source
                      </button>
                    </div>
                  </div>
                  {/* Excel */}
                  <div style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
                    <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Excel (.xlsx)</div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>Full dataset exported as Excel workbook with all rows</div>
                    <button onClick={() => { if (activeDataset) window.open(`/api/export/dataset/${activeDataset.id}/excel`, '_blank'); }} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(34,197,94,0.15)', color: '#86efac', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Download size={13} /> Export Excel
                    </button>
                  </div>
                  {/* Embed */}
                  <div style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
                    <div style={{ color: '#8b5cf6', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Embed Code</div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>Save chart first, then copy iFrame embed code for external sites</div>
                    {savedCharts.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {savedCharts.slice(0, 3).map(c => (
                          <button key={c.id} onClick={() => copyEmbedCode(c.id)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.08)', color: '#c4b5fd', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {embedCopied ? <CheckCircle2 size={11} color="#22c55e" /> : <Copy size={11} />}
                          </button>
                        ))}
                      </div>
                    ) : <div style={{ color: '#4b5563', fontSize: 12 }}>Save a chart first to get embed code</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
