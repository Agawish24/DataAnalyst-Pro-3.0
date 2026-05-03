import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Scatter, Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { FlaskConical, TrendingUp, Grid3x3, Tag, Clock } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

const COLORS = ['rgba(99,102,241,0.7)', 'rgba(239,68,68,0.7)', 'rgba(16,185,129,0.7)', 'rgba(245,158,11,0.7)', 'rgba(139,92,246,0.7)'];

export default function Analytics() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [activeModule, setActiveModule] = useState('regression');
  const [config, setConfig] = useState({ target: '', features: [], n_clusters: 3, model: 'linear', value_column: '', date_column: '', periods: 10, method: 'exponential' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { fetchDatasets(); }, []);

  const rawSchema = activeDataset?.schema || [];
  const schemaArr = Array.isArray(rawSchema)
    ? rawSchema
    : Object.entries(rawSchema).map(([name, type]) => ({ name, type: String(type) }));
  const numericCols = schemaArr.filter(c =>
    ['numeric','integer','float','double','decimal','number'].some(t => String(c.type).toLowerCase().includes(t))
  ).map(c => c.name);
  const allCols = schemaArr.map(c => c.name);

  const runAnalysis = async () => {
    if (!activeDataset) { toast.error('Select a dataset first'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      let res;
      if (activeModule === 'regression') res = await api.post(`/analytics/${activeDataset.id}/regression`, { target: config.target, features: config.features.length ? config.features : numericCols.filter(c => c !== config.target), model: config.model });
      else if (activeModule === 'clustering') res = await api.post(`/analytics/${activeDataset.id}/clustering`, { features: config.features.length ? config.features : numericCols, n_clusters: config.n_clusters });
      else if (activeModule === 'classification') res = await api.post(`/analytics/${activeDataset.id}/classification`, { target: config.target, features: config.features.length ? config.features : numericCols.filter(c => c !== config.target), model: config.model });
      else if (activeModule === 'forecast') res = await api.post(`/analytics/${activeDataset.id}/forecast`, { value_column: config.value_column, date_column: config.date_column, periods: config.periods, method: config.method });
      else if (activeModule === 'outliers') res = await api.get(`/analytics/${activeDataset.id}/outliers`);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed. Make sure the Python service is running.');
    } finally { setLoading(false); }
  };

  const modules = [
    { id: 'regression', icon: TrendingUp, label: 'Regression' },
    { id: 'clustering', icon: Grid3x3, label: 'Clustering' },
    { id: 'classification', icon: Tag, label: 'Classification' },
    { id: 'forecast', icon: Clock, label: 'Forecasting' },
    { id: 'outliers', icon: FlaskConical, label: 'Outlier Detection' },
  ];

  const renderResult = () => {
    if (!result) return null;
    if (activeModule === 'regression' && result.predictions) {
      const chartData = { datasets: [{ label: 'Actual vs Predicted', data: result.predictions.map(p => ({ x: p.actual, y: p.predicted })), backgroundColor: 'rgba(99,102,241,0.6)', pointRadius: 4 }] };
      return (
        <div>
          <div className="metrics-grid">
            <div className="metric-card"><div className="metric-val">{result.metrics?.r2_score}</div><div className="metric-lbl">R² Score</div></div>
            <div className="metric-card"><div className="metric-val">{result.metrics?.rmse}</div><div className="metric-lbl">RMSE</div></div>
            <div className="metric-card"><div className="metric-val">{result.train_size}</div><div className="metric-lbl">Train Size</div></div>
            <div className="metric-card"><div className="metric-val">{result.test_size}</div><div className="metric-lbl">Test Size</div></div>
          </div>
          <div style={{ height: '300px' }}>
            <Scatter data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9ca3af' } } }, scales: { x: { title: { display: true, text: 'Actual', color: '#9ca3af' }, ticks: { color: '#9ca3af' } }, y: { title: { display: true, text: 'Predicted', color: '#9ca3af' }, ticks: { color: '#9ca3af' } } } }} />
          </div>
          {result.coefficients && <div className="coeff-table"><h4>Coefficients</h4>{Object.entries(result.coefficients).map(([k,v]) => <div key={k} className="coeff-row"><span>{k}</span><strong>{v}</strong></div>)}</div>}
        </div>
      );
    }
    if (activeModule === 'clustering') {
      const sizes = result.cluster_sizes || {};
      const chartData = { labels: Object.keys(sizes).map(k => `Cluster ${k}`), datasets: [{ label: 'Size', data: Object.values(sizes), backgroundColor: COLORS, borderRadius: 6 }] };
      return (
        <div>
          <div className="metrics-grid">
            <div className="metric-card"><div className="metric-val">{result.n_clusters}</div><div className="metric-lbl">Clusters</div></div>
            <div className="metric-card"><div className="metric-val">{result.total_points || result.sample_points?.length}</div><div className="metric-lbl">Points</div></div>
            {result.inertia && <div className="metric-card"><div className="metric-val">{result.inertia?.toFixed(0)}</div><div className="metric-lbl">Inertia</div></div>}
          </div>
          <div style={{ height: '250px' }}><Bar data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#9ca3af' } }, x: { ticks: { color: '#9ca3af' } } } }} /></div>
        </div>
      );
    }
    if (activeModule === 'classification') {
      return (
        <div>
          <div className="metrics-grid">
            <div className="metric-card accent"><div className="metric-val">{(result.accuracy * 100).toFixed(1)}%</div><div className="metric-lbl">Accuracy</div></div>
            <div className="metric-card"><div className="metric-val">{result.classes?.length}</div><div className="metric-lbl">Classes</div></div>
            <div className="metric-card"><div className="metric-val">{result.sample_size}</div><div className="metric-lbl">Samples</div></div>
          </div>
          {result.feature_importance && (
            <div className="coeff-table"><h4>Feature Importance</h4>
              {Object.entries(result.feature_importance).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (
                <div key={k} className="coeff-row"><span>{k}</span><div className="importance-bar" style={{ width: `${v*100}%` }}></div><strong>{v}</strong></div>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (activeModule === 'forecast' && result.forecast) {
      const allPoints = [...(result.historical || []).map(h => ({ x: h.index, y: h.value, type: 'historical' })), ...result.forecast.map(f => ({ x: f.index, y: f.value, type: 'forecast' }))];
      const chartData = {
        datasets: [
          { label: 'Historical', data: (result.historical || []).map(h => ({ x: h.index, y: h.value })), borderColor: 'rgba(99,102,241,0.9)', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 },
          { label: 'Forecast', data: result.forecast.map(f => ({ x: f.index, y: f.value })), borderColor: 'rgba(245,158,11,0.9)', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.3, pointRadius: 4, borderDash: [5,5] }
        ]
      };
      return (
        <div style={{ height: '300px' }}>
          <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9ca3af' } } }, scales: { x: { ticks: { color: '#9ca3af' } }, y: { ticks: { color: '#9ca3af' } } } }} />
        </div>
      );
    }
    if (activeModule === 'outliers') {
      return (
        <div>
          <div className="metrics-grid">
            <div className="metric-card"><div className="metric-val">{result.total_points}</div><div className="metric-lbl">Total Points</div></div>
            <div className="metric-card accent"><div className="metric-val">{result.outliers_found}</div><div className="metric-lbl">Outliers Found</div></div>
            <div className="metric-card"><div className="metric-val">{result.outlier_percentage}%</div><div className="metric-lbl">Outlier Rate</div></div>
          </div>
        </div>
      );
    }
    return <pre className="result-json">{JSON.stringify(result, null, 2)}</pre>;
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Advanced Analytics</h2>
        <p className="text-muted">Machine learning, forecasting, and statistical analysis powered by Python</p>
      </div>

      <div className="card mb-4">
        <label className="form-label">Select Dataset</label>
        <div className="dataset-selector">
          {datasets.map(ds => (<button key={ds.id} className={`dataset-chip ${activeDataset?.id === ds.id ? 'active' : ''}`} onClick={() => selectDataset(ds)}>{ds.name}</button>))}
        </div>
      </div>

      <div className="analytics-layout">
        {/* Module tabs */}
        <div className="module-tabs">
          {modules.map(m => { const Icon = m.icon; return (
            <button key={m.id} className={`module-tab ${activeModule === m.id ? 'active' : ''}`} onClick={() => { setActiveModule(m.id); setResult(null); setError(null); }}>
              <Icon size={20} /><span>{m.label}</span>
            </button>
          ); })}
        </div>

        <div className="analytics-body">
          {/* Config */}
          <div className="card analytics-config">
            <h3 className="card-title">Configure {modules.find(m=>m.id===activeModule)?.label}</h3>
            {(activeModule === 'regression' || activeModule === 'classification') && (
              <>
                <div className="form-group">
                  <label>Target Column</label>
                  <select value={config.target} onChange={e => setConfig({...config, target: e.target.value})}>
                    <option value="">Select target...</option>
                    {(activeModule === 'regression' ? numericCols : allCols).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Model</label>
                  <select value={config.model} onChange={e => setConfig({...config, model: e.target.value})}>
                    {activeModule === 'regression' ? (
                      <><option value="linear">Linear Regression</option><option value="random_forest">Random Forest</option></>
                    ) : (
                      <><option value="random_forest">Random Forest</option><option value="logistic">Logistic Regression</option></>
                    )}
                  </select>
                </div>
              </>
            )}
            {activeModule === 'clustering' && (
              <div className="form-group">
                <label>Number of Clusters: {config.n_clusters}</label>
                <input type="range" min="2" max="10" value={config.n_clusters} onChange={e => setConfig({...config, n_clusters: parseInt(e.target.value)})} />
              </div>
            )}
            {activeModule === 'forecast' && (
              <>
                <div className="form-group">
                  <label>Value Column</label>
                  <select value={config.value_column} onChange={e => setConfig({...config, value_column: e.target.value})}>
                    <option value="">Select...</option>
                    {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Forecast Periods: {config.periods}</label>
                  <input type="range" min="3" max="30" value={config.periods} onChange={e => setConfig({...config, periods: parseInt(e.target.value)})} />
                </div>
                <div className="form-group">
                  <label>Method</label>
                  <select value={config.method} onChange={e => setConfig({...config, method: e.target.value})}>
                    <option value="exponential">Exponential Smoothing</option>
                    <option value="arima">ARIMA</option>
                  </select>
                </div>
              </>
            )}
            <button className="btn btn-primary btn-full" onClick={runAnalysis} disabled={loading || !activeDataset}>
              {loading ? 'Running Analysis...' : 'Run Analysis'}
            </button>
            {error && <div className="error-msg mt-2">{error}</div>}
          </div>

          {/* Results */}
          <div className="card analytics-results">
            {result ? (
              <><h3 className="card-title">Results</h3>{renderResult()}</>
            ) : (
              <div className="empty-state">
                <FlaskConical size={48} />
                <p>Configure and run an analysis to see results here</p>
                <p className="text-muted text-sm">Requires Python analytics service</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
