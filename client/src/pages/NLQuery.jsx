import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Sparkles, Play, Copy, Clock, ChevronRight, BarChart2, Lightbulb } from 'lucide-react';

export default function NLQuery() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => { fetchDatasets(); loadHistory(); loadExamples(); }, []);

  const loadHistory = async () => { try { const r = await api.get('/nl-to-sql/history'); setHistory(r.data); } catch {} };
  const loadExamples = async () => { try { const r = await api.get('/nl-to-sql/examples'); setExamples(r.data); } catch {} };

  const convert = async () => {
    if (!text.trim()) return toast.error('Enter a question first');
    setLoading(true); setResult(null); setQueryResult(null);
    try {
      const r = await api.post('/nl-to-sql/convert', { text, dataset_id: activeDataset?.id });
      setResult(r.data);
      toast.success(`Converted with ${Math.round(r.data.confidence * 100)}% confidence`);
      loadHistory();
    } catch (e) { toast.error(e.response?.data?.error || 'Conversion failed'); }
    finally { setLoading(false); }
  };

  const runSQL = async () => {
    if (!result?.sql || !activeDataset) return toast.error('Select a dataset first');
    setRunning(true);
    try {
      const r = await api.post('/queries/execute', { sql: result.sql, datasetId: activeDataset.id });
      setQueryResult(r.data);
      toast.success(`${r.data.rowCount} rows returned`);
    } catch (e) { toast.error(e.response?.data?.error || 'Query failed'); }
    finally { setRunning(false); }
  };

  const copy = (t) => { navigator.clipboard.writeText(t); toast.success('Copied!'); };
  const confColor = (c) => c >= 0.8 ? '#10b981' : c >= 0.6 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={28} color="#8b5cf6" /> Natural Language to SQL
        </h1>
        <p style={{ color: '#9ca3af', margin: 0 }}>Type a question in plain English and get an instant SQL query</p>
      </div>

      {/* Dataset selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>ACTIVE DATASET</label>
        <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))}
          style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', width: 300, fontSize: 14 }}>
          <option value="">Select a dataset...</option>
          {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* Input */}
      <div style={{ background: '#13131f', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Sparkles size={20} color="#8b5cf6" style={{ marginTop: 10, flexShrink: 0 }} />
          <textarea value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); convert(); } }}
            placeholder="Ask anything about your data... e.g. 'Show me total revenue by region' or 'What is the average salary per department?'"
            rows={3}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#f3f4f6', fontSize: 16, resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ color: '#4b5563', fontSize: 12 }}>Press Enter to convert — Shift+Enter for new line</span>
          <button onClick={convert} disabled={loading}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: loading ? '#374151' : 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={15} /> {loading ? 'Converting...' : 'Convert to SQL'}
          </button>
        </div>
      </div>

      {/* Examples */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Lightbulb size={12} /> TRY AN EXAMPLE</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {examples.map((ex, i) => (
            <button key={i} onClick={() => { setText(ex.text); }}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: 'rgba(139,92,246,0.2)', color: '#8b5cf6', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{ex.category}</span>
              {ex.text}
            </button>
          ))}
        </div>
      </div>

      {/* Result */}
      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: queryResult ? '1fr 1fr' : '1fr', gap: 20, marginBottom: 20 }}>
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#f3f4f6', fontWeight: 600 }}>Generated SQL</span>
                <span style={{ background: `${confColor(result.confidence)}22`, color: confColor(result.confidence), padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                  {Math.round(result.confidence * 100)}% confidence
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => copy(result.sql)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#9ca3af', cursor: 'pointer', padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Copy size={12} /> Copy</button>
                {activeDataset && <button onClick={runSQL} disabled={running} style={{ background: 'none', border: '1px solid #10b981', borderRadius: 6, color: '#10b981', cursor: running ? 'not-allowed' : 'pointer', padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Play size={12} /> {running ? 'Running...' : 'Run Query'}</button>}
              </div>
            </div>
            <pre style={{ padding: 16, margin: 0, color: '#86efac', fontSize: 13, fontFamily: 'Monaco, monospace', overflowX: 'auto', background: '#0d0d1a', lineHeight: 1.6 }}>{result.sql}</pre>
            {result.detected && Object.values(result.detected).some(v => v) && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {result.detected.aggFunc && <span style={{ color: '#6b7280', fontSize: 12 }}>Agg: <strong style={{ color: '#8b5cf6' }}>{result.detected.aggFunc}</strong></span>}
                {result.detected.aggCol && <span style={{ color: '#6b7280', fontSize: 12 }}>Column: <strong style={{ color: '#f59e0b' }}>{result.detected.aggCol}</strong></span>}
                {result.detected.groupCol && <span style={{ color: '#6b7280', fontSize: 12 }}>Group by: <strong style={{ color: '#10b981' }}>{result.detected.groupCol}</strong></span>}
                {result.detected.limit && <span style={{ color: '#6b7280', fontSize: 12 }}>Limit: <strong style={{ color: '#3b82f6' }}>{result.detected.limit}</strong></span>}
              </div>
            )}
          </div>

          {queryResult && (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart2 size={16} color="#10b981" />
                <span style={{ color: '#f3f4f6', fontWeight: 600 }}>Query Results</span>
                <span style={{ color: '#6b7280', fontSize: 12 }}>{queryResult.rowCount} rows</span>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 300 }}>
                {queryResult.rows?.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr>{Object.keys(queryResult.rows[0]).map(k => <th key={k} style={{ padding: '8px 12px', textAlign: 'left', color: '#9ca3af', fontWeight: 600, background: '#0d0d1a', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>{k}</th>)}</tr></thead>
                    <tbody>{queryResult.rows.slice(0, 50).map((row, i) => <tr key={i}>{Object.values(row).map((v, j) => <td key={j} style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0' }}>{v !== null ? String(v) : <span style={{ color: '#4b5563' }}>null</span>}</td>)}</tr>)}</tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} color="#6b7280" />
            <span style={{ color: '#f3f4f6', fontWeight: 600 }}>Recent Queries</span>
          </div>
          {history.slice(0, 8).map((h, i) => (
            <div key={i} onClick={() => { setText(h.natural_text); }} style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div>
                <div style={{ color: '#e2e8f0', fontSize: 13 }}>{h.natural_text}</div>
                <div style={{ color: '#4b5563', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>{h.generated_sql?.slice(0, 80)}...</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ color: confColor(h.confidence), fontSize: 11, fontWeight: 600 }}>{Math.round((h.confidence || 0) * 100)}%</span>
                <ChevronRight size={14} color="#4b5563" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
