import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { BarChart3, RefreshCw, AlertCircle, CheckCircle, TrendingUp, Hash, Type, Percent, Download } from 'lucide-react';
import toast from 'react-hot-toast';

const QualityBadge = ({ pct }) => {
  const color = pct === 0 ? '#10b981' : pct < 5 ? '#f59e0b' : '#ef4444';
  return <span style={{ color, fontWeight: 600 }}>{pct}%</span>;
};

const MiniBar = ({ value, max, color = '#6366f1' }) => (
  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 6, overflow: 'hidden', flex: 1, minWidth: 60 }}>
    <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
  </div>
);

export default function Profiling() {
  const { selectedDataset } = useData();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedCol, setSelectedCol] = useState(null);

  const loadProfile = async (refresh = false) => {
    if (!selectedDataset) return;
    setLoading(true);
    try {
      const url = refresh ? `/profiling/${selectedDataset.id}?refresh=1` : `/profiling/${selectedDataset.id}`;
      const data = await api.get(url);
      setProfile(data);
      if (!selectedCol && data.columns) setSelectedCol(Object.keys(data.columns)[0]);
      if (refresh) toast.success('Profile refreshed');
    } catch (err) { toast.error('Failed to load profile'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadProfile(); }, [selectedDataset]);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'columns', label: 'Columns' },
    { id: 'quality', label: 'Data Quality' },
    { id: 'correlation', label: 'Correlations' },
    { id: 'samples', label: 'Sample Data' },
  ];

  const numericCols = profile ? Object.entries(profile.columns || {}).filter(([,v]) => v.type === 'numeric') : [];
  const categoricalCols = profile ? Object.entries(profile.columns || {}).filter(([,v]) => v.type === 'categorical') : [];

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4 }}>Data Profiling</h1>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Automated dataset summaries, distributions, and quality reports</p>
        </div>
        <button onClick={() => loadProfile(true)} disabled={loading || !selectedDataset}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', opacity: (!selectedDataset || loading) ? 0.5 : 1 }}>
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Profiling...' : 'Refresh Profile'}
        </button>
      </div>

      {!selectedDataset ? (
        <div style={{ textAlign: 'center', padding: 64, color: '#6b7280' }}>
          <BarChart3 size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p>Select a dataset from Data Import to profile it</p>
        </div>
      ) : !profile ? (
        <div style={{ textAlign: 'center', padding: 64, color: '#6b7280' }}>
          {loading ? <p>Generating profile...</p> : <button onClick={() => loadProfile()} style={{ padding: '12px 24px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Generate Profile</button>}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ flex: 1, padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500,
                  background: activeTab === t.id ? '#6366f1' : 'transparent', color: activeTab === t.id ? '#fff' : '#9ca3af' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Overview */}
          {activeTab === 'overview' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
                {[
                  { label: 'Rows', value: profile.overview.rowCount?.toLocaleString(), icon: Hash, color: '#6366f1' },
                  { label: 'Columns', value: profile.overview.columnCount, icon: Type, color: '#8b5cf6' },
                  { label: 'Numeric Cols', value: profile.overview.numericColumns, icon: TrendingUp, color: '#06b6d4' },
                  { label: 'Categorical Cols', value: profile.overview.categoricalColumns, icon: Type, color: '#10b981' },
                  { label: 'Missing Values', value: `${profile.overview.missingPct}%`, icon: AlertCircle, color: profile.overview.missingPct > 5 ? '#ef4444' : '#f59e0b' },
                  { label: 'Duplicates', value: profile.overview.duplicates, icon: CheckCircle, color: profile.overview.duplicates > 0 ? '#f59e0b' : '#10b981' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Icon size={16} style={{ color }} />
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>{label}</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Columns */}
          {activeTab === 'columns' && (
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12, height: 'fit-content', maxHeight: 600, overflowY: 'auto' }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Numeric ({numericCols.length})</div>
                {numericCols.map(([col]) => (
                  <div key={col} onClick={() => setSelectedCol(col)} style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: selectedCol === col ? 'rgba(99,102,241,0.2)' : 'transparent', color: selectedCol === col ? '#a5b4fc' : '#d1d5db', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Hash size={12} /> {col}
                  </div>
                ))}
                <div style={{ fontSize: 12, color: '#6b7280', margin: '12px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Categorical ({categoricalCols.length})</div>
                {categoricalCols.map(([col]) => (
                  <div key={col} onClick={() => setSelectedCol(col)} style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: selectedCol === col ? 'rgba(99,102,241,0.2)' : 'transparent', color: selectedCol === col ? '#a5b4fc' : '#d1d5db', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Type size={12} /> {col}
                  </div>
                ))}
              </div>
              {selectedCol && profile.columns[selectedCol] && (
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24 }}>
                  <h3 style={{ color: '#f3f4f6', marginBottom: 16, fontSize: 18 }}>{selectedCol}</h3>
                  {profile.columns[selectedCol].type === 'numeric' ? (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                        {[['Mean', profile.columns[selectedCol].mean], ['Median', profile.columns[selectedCol].median], ['Std Dev', profile.columns[selectedCol].std],
                          ['Min', profile.columns[selectedCol].min], ['Max', profile.columns[selectedCol].max], ['Range', profile.columns[selectedCol].range],
                          ['Q1', profile.columns[selectedCol].q1], ['Q3', profile.columns[selectedCol].q3], ['IQR', profile.columns[selectedCol].iqr]].map(([label, val]) => (
                          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12 }}>
                            <div style={{ color: '#6b7280', fontSize: 12 }}>{label}</div>
                            <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 16 }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      {profile.columns[selectedCol].outliers?.length > 0 && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: 12 }}>
                          <div style={{ color: '#f87171', fontSize: 14, fontWeight: 600 }}>⚠ {profile.columns[selectedCol].outliers.length} outliers detected</div>
                          <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>Values: {profile.columns[selectedCol].outliers.slice(0, 10).join(', ')}{profile.columns[selectedCol].outliers.length > 10 ? '...' : ''}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12, flex: 1, textAlign: 'center' }}>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>Total Count</div>
                          <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 20 }}>{profile.columns[selectedCol].count}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12, flex: 1, textAlign: 'center' }}>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>Unique Values</div>
                          <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 20 }}>{profile.columns[selectedCol].unique}</div>
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Top Values</div>
                        {(profile.valueCounts?.[selectedCol] || profile.columns[selectedCol].topValues || []).slice(0, 10).map((item, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ color: '#d1d5db', fontSize: 13, width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</span>
                            <MiniBar value={item.count} max={(profile.valueCounts?.[selectedCol]?.[0]?.count || profile.columns[selectedCol].topValues?.[0]?.count || 1)} color="#6366f1" />
                            <span style={{ color: '#9ca3af', fontSize: 12, width: 40, textAlign: 'right' }}>{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quality */}
          {activeTab === 'quality' && profile.quality && (
            <div>
              <div style={{ display: 'grid', gap: 12 }}>
                {Object.entries(profile.quality.columns || {}).map(([col, info]) => (
                  <div key={col} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 200, color: '#f3f4f6', fontWeight: 500 }}>{col}</div>
                    <div style={{ flex: 1, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <span style={{ color: '#9ca3af', fontSize: 13 }}>Missing: <QualityBadge pct={info.missingPct || 0} /></span>
                      <span style={{ color: '#9ca3af', fontSize: 13 }}>Count: <span style={{ color: '#d1d5db' }}>{info.count}</span></span>
                      <span style={{ color: '#9ca3af', fontSize: 13 }}>Type: <span style={{ color: '#a5b4fc' }}>{info.dataType || 'mixed'}</span></span>
                    </div>
                    <div>{(info.missingPct || 0) === 0 ? <CheckCircle size={16} color="#10b981" /> : <AlertCircle size={16} color="#f59e0b" />}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Correlation */}
          {activeTab === 'correlation' && profile.correlation?.columns?.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 12px', color: '#6b7280', textAlign: 'left', width: 120 }}></th>
                    {profile.correlation.columns.map(c => <th key={c} style={{ padding: '8px 12px', color: '#9ca3af', transform: 'rotate(-45deg)', transformOrigin: 'bottom left', height: 80, whiteSpace: 'nowrap', fontSize: 11 }}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {profile.correlation.columns.map(row => (
                    <tr key={row}>
                      <td style={{ padding: '8px 12px', color: '#9ca3af', fontWeight: 500, fontSize: 12 }}>{row}</td>
                      {profile.correlation.columns.map(col => {
                        const val = profile.correlation.matrix?.[row]?.[col];
                        const abs = Math.abs(val || 0);
                        const bg = val === null ? 'transparent' : val > 0 ? `rgba(99,102,241,${abs * 0.8})` : `rgba(239,68,68,${abs * 0.8})`;
                        return <td key={col} style={{ padding: '8px 12px', textAlign: 'center', background: bg, color: abs > 0.5 ? '#fff' : '#9ca3af', borderRadius: 4, fontWeight: abs > 0.7 ? 700 : 400 }}>{val !== null ? val?.toFixed(2) : '—'}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Sample */}
          {activeTab === 'samples' && profile.sample?.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>{Object.keys(profile.sample[0]).map(h => <th key={h} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', color: '#9ca3af', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {profile.sample.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {Object.values(row).map((v, j) => <td key={j} style={{ padding: '10px 14px', color: '#d1d5db' }}>{String(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
