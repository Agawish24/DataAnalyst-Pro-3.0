import { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Play, History, Download, Code2, Clock, CheckCircle2, XCircle } from 'lucide-react';

const SAMPLE_QUERIES = [
  'SELECT * FROM dataset LIMIT 10',
  'SELECT COUNT(*) as total FROM dataset',
  'SELECT * FROM dataset ORDER BY row_index DESC LIMIT 20',
];

export default function SQLEditor() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [sql, setSql] = useState('SELECT * FROM dataset LIMIT 10');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('editor');
  const [tableInfo, setTableInfo] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => { fetchDatasets(); loadHistory(); }, []);

  useEffect(() => {
    if (activeDataset) {
      api.get(`/queries/tables/${activeDataset.id}`).then(r => setTableInfo(r.data)).catch(() => {});
    }
  }, [activeDataset]);

  const loadHistory = async () => {
    try {
      const res = await api.get('/queries/history');
      setHistory(res.data);
    } catch {}
  };

  const runQuery = async () => {
    if (!sql.trim()) return;
    setRunning(true); setError(null); setResults(null);
    try {
      const res = await api.post('/queries/execute', { sql, datasetId: activeDataset?.id });
      setResults(res.data);
      loadHistory();
    } catch (err) {
      setError(err.response?.data?.error || 'Query failed');
    } finally { setRunning(false); }
  };

  const handleKeyDown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); runQuery(); }
    if (e.key === 'Tab') { e.preventDefault(); const s = e.target.selectionStart, end = e.target.selectionEnd; setSql(sql.substring(0, s) + '  ' + sql.substring(end)); setTimeout(() => { textareaRef.current.selectionStart = textareaRef.current.selectionEnd = s + 2; }, 0); }
  };

  const exportResults = async () => {
    if (!results?.rows?.length) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/export/query/excel', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: results.rows, filename: 'query_results' })
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'query_results.xlsx'; a.click(); URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>SQL Editor</h2>
        <p className="text-muted">Write and execute SQL queries. Use <code>FROM dataset</code> to query your selected dataset.</p>
      </div>

      <div className="sql-layout">
        {/* Sidebar */}
        <div className="sql-sidebar">
          <div className="card">
            <h3 className="card-title">Dataset</h3>
            <div className="dataset-list-sm">
              {datasets.map(ds => (
                <div key={ds.id} className={`ds-item ${activeDataset?.id === ds.id ? 'active' : ''}`} onClick={() => selectDataset(ds)}>
                  <div className="ds-name">{ds.name}</div>
                  <div className="ds-meta">{ds.row_count?.toLocaleString()} rows</div>
                </div>
              ))}
            </div>
          </div>

          {tableInfo && (
            <div className="card">
              <h3 className="card-title">Columns</h3>
              <div className="column-list">
                {tableInfo.columns.map(col => (
                  <div key={col.column_name} className="col-item" onClick={() => setSql(prev => prev + ` "${col.column_name}"`)}>
                    <span className="col-name">{col.column_name}</span>
                    <span className="col-type">{col.data_type.replace('character varying', 'varchar').replace('timestamp without time zone', 'timestamp')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="card-title">Sample Queries</h3>
            {SAMPLE_QUERIES.map((q, i) => (
              <button key={i} className="sample-query" onClick={() => setSql(q)}>{q}</button>
            ))}
          </div>
        </div>

        {/* Editor + Results */}
        <div className="sql-main">
          <div className="card">
            <div className="sql-editor-header">
              <div className="editor-tabs">
                <button className={activeTab === 'editor' ? 'active' : ''} onClick={() => setActiveTab('editor')}>Editor</button>
                <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>History ({history.length})</button>
              </div>
              <div className="editor-actions">
                <button className="btn btn-primary" onClick={runQuery} disabled={running}>
                  <Play size={16} /> {running ? 'Running...' : 'Run  Ctrl+↵'}
                </button>
              </div>
            </div>

            {activeTab === 'editor' ? (
              <div className="sql-editor">
                <textarea
                  ref={textareaRef}
                  className="sql-textarea"
                  value={sql}
                  onChange={e => setSql(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="SELECT * FROM dataset LIMIT 10"
                  spellCheck={false}
                />
              </div>
            ) : (
              <div className="history-panel">
                {history.map(q => (
                  <div key={q.id} className="history-query" onClick={() => { setSql(q.sql_text); setActiveTab('editor'); }}>
                    <div className="hq-header">
                      {q.status === 'success' ? <CheckCircle2 size={14} className="text-success" /> : <XCircle size={14} className="text-danger" />}
                      <span className="hq-ds">{q.dataset_name || 'global'}</span>
                      <span className="hq-time"><Clock size={12} /> {q.execution_time_ms}ms</span>
                      <span className="hq-date">{new Date(q.created_at).toLocaleString()}</span>
                    </div>
                    <div className="hq-sql">{q.sql_text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Results */}
          {error && (
            <div className="card error-card">
              <XCircle size={18} /> <strong>Error:</strong> {error}
            </div>
          )}

          {results && (
            <div className="card">
              <div className="results-header">
                <div className="results-meta">
                  <CheckCircle2 size={16} className="text-success" />
                  <span>{results.rowCount} rows · {results.executionTime}ms</span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={exportResults}>
                  <Download size={14} /> Export Excel
                </button>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>{results.columns?.map(c => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {results.rows.map((row, i) => (
                      <tr key={i}>
                        {results.columns?.map(c => <td key={c}>{String(row[c] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
