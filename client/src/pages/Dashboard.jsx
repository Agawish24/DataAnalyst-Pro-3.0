import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Upload, BarChart3, Code2, Bot, Database, TrendingUp, Clock, FileSpreadsheet } from 'lucide-react';

export default function Dashboard() {
  const { datasets, fetchDatasets, loading } = useData();
  const { user } = useAuth();
  const [queryHistory, setQueryHistory] = useState([]);
  const [stats, setStats] = useState({ totalRows: 0, totalQueries: 0 });

  useEffect(() => {
    fetchDatasets();
    api.get('/queries/history').then(r => setQueryHistory(r.data.slice(0, 5))).catch(() => {});
  }, []);

  useEffect(() => {
    const totalRows = datasets.reduce((s, d) => s + (d.row_count || 0), 0);
    setStats({ totalRows, totalQueries: queryHistory.length });
  }, [datasets, queryHistory]);

  const quickActions = [
    { to: '/import', icon: Upload, label: 'Import Dataset', color: 'blue', desc: 'CSV, Excel, JSON' },
    { to: '/sql', icon: Code2, label: 'SQL Editor', color: 'purple', desc: 'Query your data' },
    { to: '/visualization', icon: BarChart3, label: 'Visualize', color: 'green', desc: 'Charts & graphs' },
    { to: '/ai', icon: Bot, label: 'AI Assistant', color: 'orange', desc: 'Natural language' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Welcome back, {user?.name?.split(' ')[0]} 👋</h2>
          <p className="text-muted">Here's an overview of your data workspace</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue"><Database size={24} /></div>
          <div className="stat-info">
            <div className="stat-value">{datasets.length}</div>
            <div className="stat-label">Datasets</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><TrendingUp size={24} /></div>
          <div className="stat-info">
            <div className="stat-value">{stats.totalRows.toLocaleString()}</div>
            <div className="stat-label">Total Rows</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><Code2 size={24} /></div>
          <div className="stat-info">
            <div className="stat-value">{queryHistory.length}</div>
            <div className="stat-label">Recent Queries</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><FileSpreadsheet size={24} /></div>
          <div className="stat-info">
            <div className="stat-value">{datasets.reduce((s, d) => s + (d.column_count || 0), 0)}</div>
            <div className="stat-label">Total Columns</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section">
        <h3 className="section-title">Quick Actions</h3>
        <div className="quick-actions-grid">
          {quickActions.map(action => {
            const Icon = action.icon;
            return (
              <Link key={action.to} to={action.to} className={`quick-action-card ${action.color}`}>
                <Icon size={28} />
                <div>
                  <div className="qa-label">{action.label}</div>
                  <div className="qa-desc">{action.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="two-col-grid">
        {/* Recent Datasets */}
        <div className="section card">
          <div className="section-header">
            <h3 className="section-title">Recent Datasets</h3>
            <Link to="/import" className="btn btn-sm btn-secondary">View All</Link>
          </div>
          {loading ? (
            <div className="loading-state">Loading...</div>
          ) : datasets.length === 0 ? (
            <div className="empty-state">
              <Database size={40} />
              <p>No datasets yet</p>
              <Link to="/import" className="btn btn-primary btn-sm">Import Data</Link>
            </div>
          ) : (
            <div className="dataset-list">
              {datasets.slice(0, 5).map(ds => (
                <div key={ds.id} className="dataset-item">
                  <div className="dataset-icon"><FileSpreadsheet size={18} /></div>
                  <div className="dataset-info">
                    <div className="dataset-name">{ds.name}</div>
                    <div className="dataset-meta">{ds.row_count?.toLocaleString()} rows · {ds.column_count} cols · {ds.source}</div>
                  </div>
                  <Link to="/sql" className="btn btn-xs btn-outline">Query</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Queries */}
        <div className="section card">
          <div className="section-header">
            <h3 className="section-title">Recent Queries</h3>
          </div>
          {queryHistory.length === 0 ? (
            <div className="empty-state">
              <Code2 size={40} />
              <p>No queries yet</p>
              <Link to="/sql" className="btn btn-primary btn-sm">Open SQL Editor</Link>
            </div>
          ) : (
            <div className="query-list">
              {queryHistory.map(q => (
                <div key={q.id} className="query-item">
                  <div className={`query-status ${q.status}`}></div>
                  <div className="query-content">
                    <div className="query-sql">{q.sql_text.substring(0, 80)}...</div>
                    <div className="query-meta">
                      <Clock size={12} /> {new Date(q.created_at).toLocaleDateString()} · {q.execution_time_ms}ms
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
