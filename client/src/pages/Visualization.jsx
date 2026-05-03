import { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, RadialLinearScale, Filler
} from 'chart.js';
import { Bar, Line, Pie, Doughnut, Scatter, Radar } from 'react-chartjs-2';
import { BarChart3, Download, Save, FileDown, Trash2, BookOpen } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, RadialLinearScale, Filler);

const CHART_TYPES = ['bar', 'line', 'pie', 'doughnut', 'scatter', 'radar'];
const PALETTES = {
  indigo: ['rgba(99,102,241,0.8)', 'rgba(139,92,246,0.8)', 'rgba(59,130,246,0.8)', 'rgba(6,182,212,0.8)', 'rgba(16,185,129,0.8)', 'rgba(245,158,11,0.8)', 'rgba(239,68,68,0.8)', 'rgba(236,72,153,0.8)'],
  warm: ['rgba(239,68,68,0.8)', 'rgba(245,158,11,0.8)', 'rgba(234,179,8,0.8)', 'rgba(236,72,153,0.8)', 'rgba(168,85,247,0.8)', 'rgba(99,102,241,0.8)', 'rgba(59,130,246,0.8)', 'rgba(16,185,129,0.8)'],
  cool: ['rgba(6,182,212,0.8)', 'rgba(59,130,246,0.8)', 'rgba(99,102,241,0.8)', 'rgba(139,92,246,0.8)', 'rgba(16,185,129,0.8)', 'rgba(52,211,153,0.8)', 'rgba(103,232,249,0.8)', 'rgba(167,243,208,0.8)'],
};

const STORAGE_KEY = 'dap_saved_charts';

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function persistSaved(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

export default function Visualization() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [dataRows, setDataRows] = useState([]);
  const [config, setConfig] = useState({ type: 'bar', xKey: '', yKey: '', title: '', palette: 'indigo', aggregation: 'count', limit: 20 });
  const [chartData, setChartData] = useState(null);
  const [aggregatedRows, setAggregatedRows] = useState([]);
  const [savedCharts, setSavedCharts] = useState(loadSaved);
  const [showSaved, setShowSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef(null);

  useEffect(() => { fetchDatasets(); }, []);

  useEffect(() => {
    if (activeDataset) {
      api.get(`/datasets/${activeDataset.id}/data?limit=2000`).then(r => setDataRows(r.data.rows)).catch(() => {});
      const sArr = activeDataset.schema
        ? Object.entries(activeDataset.schema).map(([name, type]) => ({ name, type }))
        : [];
      if (sArr.length >= 2) {
        const numCol = sArr.find(c => c.type === 'numeric' || c.type === 'integer');
        const catCol = sArr.find(c => c.type !== 'numeric' && c.type !== 'integer');
        setConfig(prev => ({ ...prev, xKey: catCol?.name || sArr[0]?.name || '', yKey: numCol?.name || sArr[1]?.name || '' }));
      }
    }
  }, [activeDataset]);

  const buildChart = () => {
    if (!dataRows.length || !config.xKey) return;
    const { type, xKey, yKey, palette, aggregation, limit } = config;
    const colors = PALETTES[palette] || PALETTES.indigo;

    if (type === 'scatter') {
      const points = dataRows.filter(r => r[xKey] !== '' && r[yKey] !== '').slice(0, 500).map(r => ({ x: parseFloat(r[xKey]) || 0, y: parseFloat(r[yKey]) || 0 }));
      setChartData({ datasets: [{ label: `${xKey} vs ${yKey}`, data: points, backgroundColor: colors[0], pointRadius: 4 }] });
      setAggregatedRows(points.map(p => ({ [xKey]: p.x, [yKey]: p.y })));
      return;
    }

    const grouped = {};
    dataRows.forEach(row => {
      const key = String(row[xKey] || 'N/A').substring(0, 40);
      if (!grouped[key]) grouped[key] = { values: [], count: 0 };
      const val = parseFloat(row[yKey]);
      if (!isNaN(val)) grouped[key].values.push(val);
      grouped[key].count++;
    });

    let sorted = Object.entries(grouped).sort((a, b) => b[1].count - a[1].count).slice(0, parseInt(limit));
    const labels = sorted.map(([k]) => k);
    const data = sorted.map(([, v]) => {
      if (!yKey || v.values.length === 0) return v.count;
      if (aggregation === 'sum') return v.values.reduce((a, b) => a + b, 0);
      if (aggregation === 'avg') return +(v.values.reduce((a, b) => a + b, 0) / v.values.length).toFixed(4);
      if (aggregation === 'max') return Math.max(...v.values);
      if (aggregation === 'min') return Math.min(...v.values);
      return v.count;
    });

    const bgColors = labels.map((_, i) => colors[i % colors.length]);
    setChartData({ labels, datasets: [{ label: config.title || `${xKey} × ${yKey}`, data, backgroundColor: bgColors, borderColor: bgColors.map(c => c.replace('0.8)', '1)')), borderWidth: 1, borderRadius: type === 'bar' ? 6 : 0, fill: type === 'radar', tension: 0.4 }] });
    setAggregatedRows(labels.map((lbl, i) => ({ [xKey]: lbl, [yKey || 'count']: data[i] })));
  };

  useEffect(() => { if (dataRows.length && config.xKey) buildChart(); }, [dataRows, config]);

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true, labels: { color: '#9ca3af' } }, title: { display: !!config.title, text: config.title, color: '#f3f4f6' }, tooltip: { backgroundColor: '#1e1e2e', titleColor: '#f3f4f6', bodyColor: '#9ca3af' } },
    scales: ['pie','doughnut','radar'].includes(config.type) ? {} : {
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
      x: { grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 45 } }
    }
  };

  const renderChart = () => {
    if (!chartData) return null;
    const props = { ref: chartRef, data: chartData, options: chartOptions };
    switch (config.type) {
      case 'bar': return <Bar {...props} />;
      case 'line': return <Line {...props} />;
      case 'pie': return <Pie {...props} />;
      case 'doughnut': return <Doughnut {...props} />;
      case 'scatter': return <Scatter {...props} />;
      case 'radar': return <Radar {...props} />;
      default: return <Bar {...props} />;
    }
  };

  const saveChart = () => {
    if (!chartData) return toast.error('Build a chart first');
    const name = config.title || `${config.type} — ${config.xKey} × ${config.yKey || 'count'}`;
    const entry = {
      id: Date.now(),
      name,
      datasetId: activeDataset?.id,
      datasetName: activeDataset?.name,
      config: { ...config },
      savedAt: new Date().toISOString(),
    };
    const updated = [entry, ...savedCharts];
    setSavedCharts(updated);
    persistSaved(updated);
    toast.success(`Chart "${name}" saved`);
  };

  const loadChart = (entry) => {
    if (entry.datasetId !== activeDataset?.id) {
      const ds = datasets.find(d => d.id === entry.datasetId);
      if (ds) selectDataset(ds);
    }
    setConfig(entry.config);
    setShowSaved(false);
    toast.success('Chart configuration loaded');
  };

  const deleteSaved = (id) => {
    const updated = savedCharts.filter(c => c.id !== id);
    setSavedCharts(updated);
    persistSaved(updated);
  };

  const downloadPNG = () => {
    if (!chartRef.current) return toast.error('No chart to download');
    const canvas = chartRef.current.canvas;
    const link = document.createElement('a');
    const title = (config.title || `${config.type}-chart`).replace(/\s+/g, '_');
    link.download = `${title}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success('Chart downloaded as PNG');
  };

  const exportCSV = () => {
    if (!aggregatedRows.length) return toast.error('No data to export');
    const headers = Object.keys(aggregatedRows[0]);
    const rows = aggregatedRows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    const title = (config.title || `${config.type}-data`).replace(/\s+/g, '_');
    link.download = `${title}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`Exported ${aggregatedRows.length} rows as CSV`);
  };

  const cols = activeDataset?.schema
    ? (Array.isArray(activeDataset.schema) ? activeDataset.schema.map(c => c.name) : Object.keys(activeDataset.schema))
    : [];

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Visualization</h2>
          <p className="text-muted">Build interactive charts from your data</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSaved(s => !s)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: showSaved ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <BookOpen size={14} /> Saved {savedCharts.length > 0 && <span style={{ background: '#6366f1', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 11 }}>{savedCharts.length}</span>}
          </button>
          <button onClick={saveChart} disabled={!chartData}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: chartData ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#374151', color: 'white', cursor: chartData ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Save size={14} /> Save Chart
          </button>
          <button onClick={downloadPNG} disabled={!chartData}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: chartData ? '#0f766e' : '#374151', color: 'white', cursor: chartData ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Download size={14} /> PNG
          </button>
          <button onClick={exportCSV} disabled={!aggregatedRows.length}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: aggregatedRows.length ? '#065f46' : '#374151', color: 'white', cursor: aggregatedRows.length ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <FileDown size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Saved Charts Panel */}
      {showSaved && (
        <div className="card mb-4" style={{ borderColor: '#6366f144' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: '#f3f4f6', fontWeight: 600 }}>Saved Charts</h3>
            <span style={{ color: '#6b7280', fontSize: 12 }}>Click any chart to restore its configuration</span>
          </div>
          {savedCharts.length === 0 ? (
            <p style={{ color: '#6b7280', margin: 0, fontSize: 13 }}>No saved charts yet — configure a chart and click "Save Chart"</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
              {savedCharts.map(c => (
                <div key={c.id} style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => loadChart(c)}>
                    <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{c.name}</div>
                    <div style={{ color: '#6b7280', fontSize: 11 }}>{c.datasetName} · {c.config.type} · {new Date(c.savedAt).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => deleteSaved(c.id)} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4, flexShrink: 0 }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card mb-4">
        <label className="form-label">Select Dataset</label>
        <div className="dataset-selector">
          {datasets.map(ds => (
            <button key={ds.id} className={`dataset-chip ${activeDataset?.id === ds.id ? 'active' : ''}`} onClick={() => selectDataset(ds)}>
              {ds.name}
            </button>
          ))}
        </div>
      </div>

      {activeDataset ? (
        <div className="viz-layout">
          {/* Config Panel */}
          <div className="card viz-config">
            <h3 className="card-title">Chart Configuration</h3>
            <div className="form-group">
              <label>Chart Type</label>
              <div className="chart-type-grid">
                {CHART_TYPES.map(t => (
                  <button key={t} className={`chart-type-btn ${config.type === t ? 'active' : ''}`} onClick={() => setConfig({...config, type: t})}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>X Axis / Label</label>
              <select value={config.xKey} onChange={e => setConfig({...config, xKey: e.target.value})}>
                <option value="">Select column</option>
                {cols.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {config.type !== 'scatter' && (
              <div className="form-group">
                <label>Y Axis / Value</label>
                <select value={config.yKey} onChange={e => setConfig({...config, yKey: e.target.value})}>
                  <option value="">Count</option>
                  {cols.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            {config.yKey && config.type !== 'scatter' && (
              <div className="form-group">
                <label>Aggregation</label>
                <select value={config.aggregation} onChange={e => setConfig({...config, aggregation: e.target.value})}>
                  {['count','sum','avg','max','min'].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Color Palette</label>
              <div className="palette-grid">
                {Object.keys(PALETTES).map(p => (
                  <button key={p} className={`palette-btn ${config.palette === p ? 'active' : ''}`} onClick={() => setConfig({...config, palette: p})} style={{ background: PALETTES[p][0] }}>{p}</button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Max Items: {config.limit}</label>
              <input type="range" min="5" max="50" value={config.limit} onChange={e => setConfig({...config, limit: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Chart Title</label>
              <input type="text" placeholder="Optional title..." value={config.title} onChange={e => setConfig({...config, title: e.target.value})} />
            </div>

            {/* Inline action buttons in config panel too */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <button onClick={saveChart} disabled={!chartData}
                style={{ padding: '9px 0', borderRadius: 8, border: 'none', background: chartData ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#374151', color: 'white', cursor: chartData ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                <Save size={14} /> Save Chart
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={downloadPNG} disabled={!chartData}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: chartData ? '#10b981' : '#374151', cursor: chartData ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 13 }}>
                  <Download size={13} /> PNG
                </button>
                <button onClick={exportCSV} disabled={!aggregatedRows.length}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: aggregatedRows.length ? '#6366f1' : '#374151', cursor: aggregatedRows.length ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 13 }}>
                  <FileDown size={13} /> CSV
                </button>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="card viz-chart-panel">
            <div className="chart-container" style={{ height: '400px' }}>
              {chartData ? renderChart() : <div className="empty-state"><BarChart3 size={48} /><p>Configure chart settings</p></div>}
            </div>
            {aggregatedRows.length > 0 && (
              <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>Aggregated data — {aggregatedRows.length} rows</span>
                  <button onClick={exportCSV} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.4)', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <FileDown size={12} /> Export CSV
                  </button>
                </div>
                <div style={{ overflowX: 'auto', maxHeight: 180 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>{Object.keys(aggregatedRows[0]).map(h => <th key={h} style={{ padding: '5px 10px', textAlign: 'left', color: '#6b7280', background: '#0d0d1a', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {aggregatedRows.slice(0, 20).map((row, i) => (
                        <tr key={i}>{Object.values(row).map((v, j) => <td key={j} style={{ padding: '4px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#e2e8f0' }}>{v}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                  {aggregatedRows.length > 20 && <p style={{ color: '#4b5563', fontSize: 11, padding: '6px 10px', margin: 0 }}>… and {aggregatedRows.length - 20} more rows — Export CSV for full data</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="empty-state card">
          <BarChart3 size={48} />
          <p>Select a dataset to start visualizing</p>
        </div>
      )}
    </div>
  );
}
