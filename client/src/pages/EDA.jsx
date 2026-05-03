import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { BarChart3, MessageSquare, AlertTriangle, Calendar } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

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

  const numericCols = summary ? Object.entries(summary).filter(([, v]) => v.type === 'numeric') : [];
  const categoricalCols = summary ? Object.entries(summary).filter(([, v]) => v.type === 'categorical') : [];
  const dateCols = summary ? Object.entries(summary).filter(([, v]) => v.type === 'date') : [];
  const emptyCols = summary ? Object.entries(summary).filter(([, v]) => v.type === 'empty') : [];

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

  const typeBadgeStyle = (type) => {
    const map = {
      numeric: { background: 'rgba(99,102,241,0.15)', color: '#818cf8' },
      categorical: { background: 'rgba(16,185,129,0.15)', color: '#34d399' },
      date: { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
      empty: { background: 'rgba(239,68,68,0.15)', color: '#f87171' },
    };
    return map[type] || { background: 'rgba(255,255,255,0.08)', color: '#9ca3af' };
  };

  const confCellBg = (val) => {
    if (val === null || val === undefined) return 'transparent';
    const abs = Math.abs(val);
    if (val > 0) return `rgba(99,102,241,${Math.min(abs, 0.85)})`;
    return `rgba(239,68,68,${Math.min(abs, 0.85)})`;
  };

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
          {/* Tab bar — add count badges */}
          <div className="eda-tabs">
            {[
              { key: 'summary', label: `Summary (${Object.keys(summary).length})` },
              { key: 'numeric', label: `Numeric (${numericCols.length})` },
              { key: 'categorical', label: `Categorical (${categoricalCols.length + dateCols.length})` },
              { key: 'correlation', label: 'Correlation' },
            ].map(t => (
              <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── SUMMARY TAB ── */}
          {activeTab === 'summary' && (
            <>
              {emptyCols.length > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, marginBottom: 16 }}>
                  <AlertTriangle size={15} color="#f87171" />
                  <span style={{ color: '#fca5a5', fontSize: 13 }}>
                    {emptyCols.length} column{emptyCols.length > 1 ? 's' : ''} with no data: {emptyCols.map(([c]) => c).join(', ')}
                  </span>
                </div>
              )}
              <div className="summary-grid">
                {Object.entries(summary).map(([col, info]) => {
                  const badge = typeBadgeStyle(info.type);
                  return (
                    <div key={col} className="summary-card">
                      <div className="sc-header">
                        <span className="sc-col">{col}</span>
                        <span className="type-badge" style={{ ...badge, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {info.type === 'date' && <Calendar size={10} />}
                          {info.type}
                        </span>
                      </div>

                      {info.type === 'numeric' && (
                        <div className="sc-stats">
                          <div className="sc-stat"><span>Count</span><strong>{info.count}</strong></div>
                          <div className="sc-stat"><span>Mean</span><strong>{info.mean}</strong></div>
                          <div className="sc-stat"><span>Median</span><strong>{info.median}</strong></div>
                          <div className="sc-stat"><span>Std</span><strong>{info.std}</strong></div>
                          <div className="sc-stat"><span>Min</span><strong>{info.min}</strong></div>
                          <div className="sc-stat"><span>Max</span><strong>{info.max}</strong></div>
                          <div className="sc-stat"><span>Outliers</span><strong>{info.outliers?.length ?? 0}</strong></div>
                          {info.missingPct > 0 && <div className="sc-stat"><span>Missing</span><strong style={{ color: '#f87171' }}>{info.missingPct}%</strong></div>}
                        </div>
                      )}

                      {info.type === 'categorical' && (
                        <div className="sc-stats">
                          <div className="sc-stat"><span>Count</span><strong>{info.count || 0}</strong></div>
                          <div className="sc-stat"><span>Unique</span><strong>{info.unique || 0}</strong></div>
                          {info.missingPct > 0 && <div className="sc-stat"><span>Missing</span><strong style={{ color: '#f87171' }}>{info.missingPct}%</strong></div>}
                          <div className="sc-stat full"><span>Top</span><strong>{info.topValues?.[0]?.value ?? '—'}</strong></div>
                        </div>
                      )}

                      {info.type === 'date' && (
                        <div className="sc-stats">
                          <div className="sc-stat"><span>Count</span><strong>{info.count}</strong></div>
                          <div className="sc-stat"><span>Unique</span><strong>{info.unique}</strong></div>
                          <div className="sc-stat full"><span>Min</span><strong style={{ fontSize: 11 }}>{info.min}</strong></div>
                          <div className="sc-stat full"><span>Max</span><strong style={{ fontSize: 11 }}>{info.max}</strong></div>
                        </div>
                      )}

                      {info.type === 'empty' && (
                        <div className="sc-stats">
                          <div className="sc-stat full" style={{ color: '#6b7280' }}>No data in this column</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── NUMERIC TAB ── */}
          {activeTab === 'numeric' && (
            numericCols.length === 0
              ? <div className="empty-state card"><BarChart3 size={36} /><p>No numeric columns found</p></div>
              : <div className="charts-grid">
                {numericCols.map(([col, info]) => (
                  <div key={col} className="chart-card">
                    <h4>{col} Distribution</h4>
                    <Bar data={getDistributionChart(col, info)} options={chartOptions} />
                    <div className="chart-stats">
                      <span>Skewness: {info.skewness ?? 'N/A'}</span>
                      <span>IQR: {info.iqr ?? 'N/A'}</span>
                      <span>Outliers: {info.outliers?.length ?? 0}</span>
                      {info.missingPct > 0 && <span style={{ color: '#f87171' }}>Missing: {info.missingPct}%</span>}
                    </div>
                  </div>
                ))}
              </div>
          )}

          {/* ── CATEGORICAL TAB (includes date cols) ── */}
          {activeTab === 'categorical' && (
            <div className="charts-grid">
              {[...categoricalCols, ...dateCols].map(([col, info]) => (
                <div key={col} className="chart-card">
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {info.type === 'date' && <Calendar size={13} color="#fbbf24" />}
                    {col} — Top Values
                  </h4>
                  <Bar data={getCategoryChart(info)} options={chartOptions} />
                  <div className="chart-stats">
                    <span>Unique: {info.unique}</span>
                    {info.type === 'date' && <span style={{ color: '#fbbf24' }}>date</span>}
                  </div>
                </div>
              ))}
              {categoricalCols.length + dateCols.length === 0 && (
                <div className="empty-state card"><p>No categorical columns found</p></div>
              )}
            </div>
          )}

          {/* ── CORRELATION TAB ── */}
          {activeTab === 'correlation' && (
            <div>
              {/* Narrative insights */}
              {correlation?.narratives?.length > 0 && (
                <div style={{ background: '#13131f', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <MessageSquare size={16} color="#8b5cf6" />
                    <span style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>Automated Insights</span>
                  </div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {correlation.narratives.map((n, i) => (
                      <li key={i} style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.5 }}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Legend */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: '#6b7280', fontSize: 12 }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(99,102,241,0.7)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />
                  Positive
                </span>
                <span style={{ color: '#6b7280', fontSize: 12 }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(239,68,68,0.7)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />
                  Negative
                </span>
                <span style={{ color: '#4b5563', fontSize: 11 }}>Date columns converted to epoch time for correlation</span>
              </div>

              {correlation?.columns?.length > 0
                ? (
                  <div className="card">
                    <h3 className="card-title">Correlation Matrix</h3>
                    <div className="correlation-grid">
                      <div className="corr-table-wrap">
                        <table className="corr-table">
                          <thead>
                            <tr>
                              <th></th>
                              {correlation.columns.map(c => <th key={c} title={c}>{c.length > 10 ? c.slice(0, 10) + '…' : c}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {correlation.columns.map(r => (
                              <tr key={r}>
                                <td><strong title={r}>{r.length > 12 ? r.slice(0, 12) + '…' : r}</strong></td>
                                {correlation.columns.map(c => {
                                  const val = correlation.matrix?.[r]?.[c];
                                  const display = val !== null && val !== undefined ? val.toFixed(2) : '—';
                                  const abs = Math.abs(val ?? 0);
                                  return (
                                    <td key={c}
                                      title={`${r} ↔ ${c}: ${display}`}
                                      style={{ background: confCellBg(val), color: abs > 0.5 ? '#fff' : 'inherit', fontWeight: r === c ? 700 : 400 }}>
                                      {display}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
                : (
                  <div className="empty-state card">
                    <BarChart3 size={36} />
                    <p>No numeric columns available for correlation</p>
                  </div>
                )}
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
