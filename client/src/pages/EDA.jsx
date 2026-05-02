import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { Bar, Scatter } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { BarChart3, TrendingUp, Activity } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

export default function EDA() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [summary, setSummary] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');

  useEffect(() => { fetchDatasets(); }, []);
  useEffect(() => { if (activeDataset) loadSummary(); }, [activeDataset]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/datasets/${activeDataset.id}/summary`);
      setSummary(res.data.summary);
      setCorrelation(res.data.correlation);
    } catch {} finally { setLoading(false); }
  };

  const numericCols = summary ? Object.entries(summary).filter(([,v]) => v.type === 'numeric') : [];
  const categoricalCols = summary ? Object.entries(summary).filter(([,v]) => v.type === 'categorical') : [];

  const getDistributionChart = (col, info) => ({
    labels: ['Min', 'Q1', 'Median', 'Mean', 'Q3', 'Max'],
    datasets: [{
      label: col,
      data: [info.min, info.q1, info.median, info.mean, info.q3, info.max],
      backgroundColor: ['rgba(99,102,241,0.7)', 'rgba(99,102,241,0.6)', 'rgba(99,102,241,0.8)', 'rgba(234,88,12,0.8)', 'rgba(99,102,241,0.6)', 'rgba(99,102,241,0.5)'],
      borderRadius: 6,
    }]
  });

  const getCategoryChart = (info) => ({
    labels: info.topValues.map(v => String(v.value).substring(0, 20)),
    datasets: [{
      label: 'Count',
      data: info.topValues.map(v => v.count),
      backgroundColor: 'rgba(99,102,241,0.7)',
      borderRadius: 6,
    }]
  });

  const chartOptions = { responsive: true, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } } };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Exploratory Data Analysis</h2>
        <p className="text-muted">Understand your data's distribution, statistics, and correlations</p>
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

      {loading && <div className="loading-overlay">Analyzing data...</div>}

      {summary && (
        <>
          <div className="eda-tabs">
            {['summary', 'numeric', 'categorical', 'correlation'].map(tab => (
              <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === 'summary' && (
            <div className="summary-grid">
              {Object.entries(summary).map(([col, info]) => (
                <div key={col} className="summary-card">
                  <div className="sc-header">
                    <span className="sc-col">{col}</span>
                    <span className={`type-badge ${info.type}`}>{info.type}</span>
                  </div>
                  {info.type === 'numeric' ? (
                    <div className="sc-stats">
                      <div className="sc-stat"><span>Mean</span><strong>{info.mean}</strong></div>
                      <div className="sc-stat"><span>Median</span><strong>{info.median}</strong></div>
                      <div className="sc-stat"><span>Std</span><strong>{info.std}</strong></div>
                      <div className="sc-stat"><span>Min</span><strong>{info.min}</strong></div>
                      <div className="sc-stat"><span>Max</span><strong>{info.max}</strong></div>
                      <div className="sc-stat"><span>Outliers</span><strong>{info.outliers?.length}</strong></div>
                    </div>
                  ) : (
                    <div className="sc-stats">
                      <div className="sc-stat"><span>Count</span><strong>{info.count}</strong></div>
                      <div className="sc-stat"><span>Unique</span><strong>{info.unique}</strong></div>
                      <div className="sc-stat full"><span>Top</span><strong>{info.topValues?.[0]?.value}</strong></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'numeric' && (
            <div className="charts-grid">
              {numericCols.map(([col, info]) => (
                <div key={col} className="chart-card">
                  <h4>{col} Distribution</h4>
                  <Bar data={getDistributionChart(col, info)} options={chartOptions} />
                  <div className="chart-stats">
                    <span>Skewness: {info.skewness}</span>
                    <span>IQR: {info.iqr}</span>
                    <span>Outliers: {info.outliers?.length}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'categorical' && (
            <div className="charts-grid">
              {categoricalCols.map(([col, info]) => (
                <div key={col} className="chart-card">
                  <h4>{col} — Top Values</h4>
                  <Bar data={getCategoryChart(info)} options={chartOptions} />
                  <div className="chart-stats"><span>Unique: {info.unique}</span></div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'correlation' && correlation?.columns?.length > 0 && (
            <div className="card">
              <h3 className="card-title">Correlation Matrix</h3>
              <div className="correlation-grid">
                <div className="corr-table-wrap">
                  <table className="corr-table">
                    <thead>
                      <tr>
                        <th></th>
                        {correlation.columns.map(c => <th key={c}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {correlation.columns.map(r => (
                        <tr key={r}>
                          <td><strong>{r}</strong></td>
                          {correlation.columns.map(c => {
                            const val = correlation.matrix?.[r]?.[c] ?? 0;
                            const abs = Math.abs(val);
                            const bg = val > 0 ? `rgba(99,102,241,${abs})` : `rgba(239,68,68,${abs})`;
                            return <td key={c} style={{ background: bg, color: abs > 0.5 ? '#fff' : 'inherit' }}>{val?.toFixed(2)}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!activeDataset && (
        <div className="empty-state card">
          <BarChart3 size={48} />
          <p>Select a dataset to begin EDA</p>
        </div>
      )}
    </div>
  );
}
