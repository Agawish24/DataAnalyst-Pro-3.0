import { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  Play, History, Download, Clock, CheckCircle2, XCircle,
  Terminal, Info, ChevronRight,
} from 'lucide-react';

const SAMPLE_QUERIES = [
  { label: 'Select all rows', sql: 'SELECT * FROM dataset LIMIT 10' },
  { label: 'Count rows', sql: 'SELECT COUNT(*) AS total FROM dataset' },
  { label: 'Column stats', sql: 'SELECT COUNT(*) AS total,\n       COUNT(DISTINCT *) AS approx_unique\nFROM dataset' },
  { label: 'EXPLAIN query', sql: 'EXPLAIN SELECT * FROM dataset LIMIT 10' },
  { label: 'Show search_path', sql: 'SHOW search_path' },
  { label: 'Set timeout', sql: 'SET statement_timeout = 30000' },
  { label: 'Session info', sql: "SELECT current_database(), current_user, version()" },
  { label: 'Recent queries', sql: 'SELECT id, sql_text, execution_time_ms, status\nFROM queries\nORDER BY created_at DESC\nLIMIT 20' },
];

const CMD_COLORS = {
  SELECT: '#10b981', WITH: '#10b981', EXPLAIN: '#06b6d4',
  SHOW: '#a78bfa', SET: '#f59e0b', BEGIN: '#6366f1',
  COMMIT: '#6366f1', ROLLBACK: '#ef4444', SAVEPOINT: '#8b5cf6',
  TABLE: '#10b981', VALUES: '#10b981',
};

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
    try { const res = await api.get('/queries/history'); setHistory(res.data); } catch {}
  };

  const runQuery = async () => {
    if (!sql.trim()) return;
    if (!activeDataset && /\bfrom\s+dataset\b/i.test(sql)) {
      return setError('No dataset selected — click a dataset in the left sidebar first, then run your query.');
    }
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = e.target.selectionStart, end = e.target.selectionEnd;
      setSql(sql.substring(0, s) + '  ' + sql.substring(end));
      setTimeout(() => {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = s + 2;
      }, 0);
    }
  };

  const insertCol = (colName) => {
    const ta = textareaRef.current;
    const insert = `"${colName}"`;
    if (ta) {
      const start = ta.selectionStart, end = ta.selectionEnd;
      const newSql = sql.substring(0, start) + insert + sql.substring(end);
      setSql(newSql);
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + insert.length; ta.focus(); }, 0);
    } else {
      setSql(prev => prev + ' ' + insert);
    }
  };

  const exportResults = async () => {
    if (!results?.rows?.length) return toast.error('No rows to export');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/export/query/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: results.rows, filename: 'query_results' }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'query_results.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
  };

  const cmd = results?.command?.toUpperCase() || '';
  const cmdColor = CMD_COLORS[cmd] || '#6b7280';
  const hasRows = results?.rows?.length > 0;
  const isCommandOnly = results && !hasRows && results.rowCount === 0 && cmd && cmd !== 'SELECT';

  return (
    <div className="page">
      <div className="page-header">
        <h2>SQL Editor</h2>
        <p className="text-muted">
          Supports SELECT, WITH, EXPLAIN, SHOW, SET, BEGIN/COMMIT and more.
          Use <code>FROM dataset</code> to query your active dataset. <kbd>Ctrl+↵</kbd> to run.
        </p>
      </div>

      <div className="sql-layout">
        {/* ── Sidebar ── */}
        <div className="sql-sidebar">
          <div className="card">
            <h3 className="card-title">Dataset</h3>
            <div className="dataset-list-sm">
              {datasets.map(ds => (
                <div
                  key={ds.id}
                  className={`ds-item ${activeDataset?.id === ds.id ? 'active' : ''}`}
                  onClick={() => selectDataset(ds)}
                >
                  <div className="ds-name">{ds.name}</div>
                  <div className="ds-meta">{ds.row_count?.toLocaleString()} rows</div>
                </div>
              ))}
            </div>
          </div>

          {tableInfo && (
            <div className="card">
              <h3 className="card-title">Columns — {tableInfo.tableName}</h3>
              <div className="column-list">
                {tableInfo.columns.map(col => (
                  <div
                    key={col.column_name}
                    className="col-item"
                    title={`Click to insert "${col.column_name}"`}
                    onClick={() => insertCol(col.column_name)}
                  >
                    <span className="col-name">{col.column_name}</span>
                    <span className="col-type">
                      {col.data_type
                        .replace('character varying', 'varchar')
                        .replace('timestamp without time zone', 'timestamp')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="card-title">Sample Queries</h3>
            {SAMPLE_QUERIES.map((q, i) => (
              <button
                key={i}
                className="sample-query"
                onClick={() => setSql(q.sql)}
                title={q.sql}
              >
                <ChevronRight size={11} style={{ flexShrink: 0 }} />
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Editor + Results ── */}
        <div className="sql-main">
          <div className="card">
            <div className="sql-editor-header">
              <div className="editor-tabs">
                <button
                  className={activeTab === 'editor' ? 'active' : ''}
                  onClick={() => setActiveTab('editor')}
                >
                  <Terminal size={13} /> Editor
                </button>
                <button
                  className={activeTab === 'history' ? 'active' : ''}
                  onClick={() => setActiveTab('history')}
                >
                  <History size={13} /> History ({history.length})
                </button>
              </div>
              <div className="editor-actions">
                <button className="btn btn-primary" onClick={runQuery} disabled={running}>
                  <Play size={14} /> {running ? 'Running…' : 'Run  Ctrl+↵'}
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
                  autoCorrect="off"
                  autoCapitalize="off"
                />
              </div>
            ) : (
              <div className="history-panel">
                {history.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#4b5563' }}>No query history yet</div>
                ) : history.map(q => (
                  <div
                    key={q.id}
                    className="history-query"
                    onClick={() => { setSql(q.sql_text); setActiveTab('editor'); }}
                  >
                    <div className="hq-header">
                      {q.status === 'success'
                        ? <CheckCircle2 size={14} className="text-success" />
                        : <XCircle size={14} className="text-danger" />}
                      <span className="hq-ds">{q.dataset_name || 'global'}</span>
                      {q.execution_time_ms != null && (
                        <span className="hq-time"><Clock size={12} /> {q.execution_time_ms}ms</span>
                      )}
                      <span className="hq-date">{new Date(q.created_at).toLocaleString()}</span>
                    </div>
                    <div className="hq-sql">{q.sql_text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="card error-card">
              <XCircle size={18} /> <strong>Error:</strong> {error}
            </div>
          )}

          {/* Results: command-only (SET / ROLLBACK / etc.) */}
          {isCommandOnly && (
            <div className="card" style={{ borderLeft: `3px solid ${cmdColor}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={18} color={cmdColor} />
                <div>
                  <span style={{ color: cmdColor, fontWeight: 700, fontSize: 14 }}>{cmd}</span>
                  <span style={{ color: '#9ca3af', marginLeft: 10, fontSize: 13 }}>
                    Command executed successfully in {results.executionTime}ms
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Results: rows (SELECT / SHOW / EXPLAIN) */}
          {results && hasRows && (
            <div className="card">
              <div className="results-header">
                <div className="results-meta">
                  <CheckCircle2 size={16} className="text-success" />
                  <span style={{ color: cmdColor, fontWeight: 700, marginRight: 6 }}>{cmd || 'SELECT'}</span>
                  <span>
                    {results.rowCount} row{results.rowCount !== 1 ? 's' : ''} · {results.executionTime}ms
                  </span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={exportResults}>
                  <Download size={14} /> Export Excel
                </button>
              </div>

              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      {results.columns?.map(c => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.map((row, i) => (
                      <tr key={i}>
                        {results.columns?.map(c => (
                          <td key={c}>{row[c] != null ? String(row[c]) : <span style={{ color: '#4b5563' }}>null</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {results.rowCount >= 1000 && (
                <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Info size={13} color="#f59e0b" />
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>Result capped at 1,000 rows. Add a LIMIT clause to narrow the results.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
