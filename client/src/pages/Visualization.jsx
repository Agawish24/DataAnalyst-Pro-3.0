import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, RadialLinearScale, Filler
} from 'chart.js';
import { Bar, Line, Pie, Doughnut, Scatter, Radar } from 'react-chartjs-2';
import { BarChart3, Download, Plus } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, RadialLinearScale, Filler);

const CHART_TYPES = ['bar', 'line', 'pie', 'doughnut', 'scatter', 'radar'];
const PALETTES = {
  indigo: ['rgba(99,102,241,0.8)', 'rgba(139,92,246,0.8)', 'rgba(59,130,246,0.8)', 'rgba(6,182,212,0.8)', 'rgba(16,185,129,0.8)', 'rgba(245,158,11,0.8)', 'rgba(239,68,68,0.8)', 'rgba(236,72,153,0.8)'],
  warm: ['rgba(239,68,68,0.8)', 'rgba(245,158,11,0.8)', 'rgba(234,179,8,0.8)', 'rgba(236,72,153,0.8)', 'rgba(168,85,247,0.8)', 'rgba(99,102,241,0.8)', 'rgba(59,130,246,0.8)', 'rgba(16,185,129,0.8)'],
  cool: ['rgba(6,182,212,0.8)', 'rgba(59,130,246,0.8)', 'rgba(99,102,241,0.8)', 'rgba(139,92,246,0.8)', 'rgba(16,185,129,0.8)', 'rgba(52,211,153,0.8)', 'rgba(103,232,249,0.8)', 'rgba(167,243,208,0.8)'],
};

export default function Visualization() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [dataRows, setDataRows] = useState([]);
  const [config, setConfig] = useState({ type: 'bar', xKey: '', yKey: '', title: '', palette: 'indigo', aggregation: 'count', limit: 20 });
  const [chartData, setChartData] = useState(null);
  const [savedCharts, setSavedCharts] = useState([]);
  const [loading, setLoading] = useState(false);

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
      return;
    }

    // Aggregate data
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
      if (aggregation === 'avg') return v.values.reduce((a, b) => a + b, 0) / v.values.length;
      if (aggregation === 'max') return Math.max(...v.values);
      if (aggregation === 'min') return Math.min(...v.values);
      return v.count;
    });

    const bgColors = labels.map((_, i) => colors[i % colors.length]);
    setChartData({ labels, datasets: [{ label: config.title || `${xKey} × ${yKey}`, data, backgroundColor: bgColors, borderColor: bgColors.map(c => c.replace('0.8)', '1)')), borderWidth: 1, borderRadius: type === 'bar' ? 6 : 0, fill: type === 'radar', tension: 0.4 }] });
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
    const props = { data: chartData, options: chartOptions };
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

  const cols = activeDataset?.schema ? Object.keys(activeDataset.schema) : [];

  return (
    <div className="page">
      <div className="page-header">
        <h2>Visualization</h2>
        <p className="text-muted">Build interactive charts from your data</p>
      </div>

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
          </div>

          {/* Chart */}
          <div className="card viz-chart-panel">
            <div className="chart-container" style={{ height: '400px' }}>
              {chartData ? renderChart() : <div className="empty-state"><BarChart3 size={48} /><p>Configure chart settings</p></div>}
            </div>
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
