import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Sparkles, Play, Copy, Clock, ChevronRight, BarChart2, Lightbulb, AlertTriangle, Database, CheckCircle, ArrowRightCircle } from 'lucide-react';

export default function NLQuery() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState(false);

  useEffect(() => { fetchDatasets(); loadHistory(); loadExamples(); }, []);

  const loadHistory = async () => { try { const r = await api.get('/nl-to-sql/history'); setHistory(r.data); } catch {} };
  const loadExamples = async () => { try { const r = await api.get('/nl-to-sql/examples'); setExamples(r.data); } catch {} };

  const convert = async () => {
    if (!text.trim()) return toast.error('Enter a question first');
    setLoading(true); setResult(null); setQueryResult(null); setDismissedWarnings(false);
    try {
      const r = await api.post('/nl-to-sql/convert', { text, dataset_id: activeDataset?.id });
      setResult(r.data);
      const conf = Math.round(r.data.confidence * 100);
      if (r.data.schemaWarnings?.length) {
        toast(`Converted at ${conf}% confidence — schema note attached`, { icon: '⚠️' });
      } else {
        toast.success(`Converted with ${conf}% confidence`);
      }
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
  const confColor = (c) => c >= 0.85 ? '#10b981' : c >= 0.65 ? '#f59e0b' : '#ef4444';
  const confLabel = (c) => c >= 0.85 ? 'High confidence' : c >= 0.65 ? 'Medium confidence' : 'Low confidence';

  const groupCols = result?.detected?.groupCols || [];
  const hasWarnings = result?.schemaWarnings?.length > 0 && !dismissedWarnings;
  const canRunQuery = result && activeDataset && result.confidence >= 0.85;
  const datasetSuggestions = result?.datasetSuggestions || [];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={28} color="#8b5cf6" /> Natural Language to SQL
        </h1>
        <p style={{ color: '#9ca3af', margin: 0 }}>Type a question in plain English and get an instant SQL query</p>
      </div>

      {/* Dataset selector + schema pill */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>ACTIVE DATASET</label>
          <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))}
            style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', width: 300, fontSize: 14 }}>
            <option value="">Select a dataset...</option>
            {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {result?.schema && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8 }}>
            <Database size={13} color="#6366f1" />
            <span style={{ color: '#818cf8', fontSize: 12 }}>
              {result.schema.columns.length} columns · {result.schema.numeric.length} numeric · {result.schema.categorical.length} categorical · {result.schema.date.length} date
            </span>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ background: '#13131f', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Sparkles size={20} color="#8b5cf6" style={{ marginTop: 10, flexShrink: 0 }} />
          <textarea value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); convert(); } }}
            placeholder="Ask anything about your data... e.g. 'Show me total revenue by channel' or 'What is the average salary per department?'"
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
            <button key={i} onClick={() => setText(ex.text)}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: 'rgba(139,92,246,0.2)', color: '#8b5cf6', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{ex.category}</span>
              {ex.text}
            </button>
          ))}
        </div>
      </div>

      {/* Cross-dataset suggestion banner */}
      {datasetSuggestions.length > 0 && (
        <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <ArrowRightCircle size={16} color="#6366f1" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: '#818cf8', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Column found in another dataset</div>
              {datasetSuggestions.map((s, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>
                    "<span style={{ color: '#f59e0b', fontWeight: 600 }}>{s.term}</span>" is not in the active dataset — found in:
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {s.foundIn.map(f => (
                      <button key={f.id} onClick={() => { selectDataset(datasets.find(d => d.id === f.id)); toast.success(`Switched to ${f.name}`); }}
                        style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.15)', color: '#818cf8', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Database size={10} /> {f.name} <span style={{ color: '#6b7280' }}>({f.column})</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Schema warnings / refinement hints */}
      {hasWarnings && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ color: '#fbbf24', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Schema refinement suggestions</div>
                {result.schemaWarnings.map((w, i) => (
                  <div key={i} style={{ color: '#d97706', fontSize: 12, marginBottom: 2 }}>• {w}</div>
                ))}
                {result.schema?.categorical?.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: '#78716c', fontSize: 11 }}>Available columns:</span>
                    {result.schema.categorical.map(c => (
                      <button key={c} onClick={() => {
                        const newText = text.replace(/\bby\s+\S+/i, `by ${c}`);
                        setText(newText !== text ? newText : text + ` by ${c}`);
                      }}
                        style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', cursor: 'pointer', fontSize: 11 }}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => setDismissedWarnings(true)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: queryResult ? '1fr 1fr' : '1fr', gap: 20, marginBottom: 20 }}>
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#f3f4f6', fontWeight: 600 }}>Generated SQL</span>
                <span style={{ background: `${confColor(result.confidence)}18`, color: confColor(result.confidence), padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {result.confidence >= 0.85 ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
                  {Math.round(result.confidence * 100)}% · {confLabel(result.confidence)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => copy(result.sql)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#9ca3af', cursor: 'pointer', padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Copy size={12} /> Copy</button>
                {activeDataset && (
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <button onClick={runSQL} disabled={running || !canRunQuery}
                      title={!canRunQuery ? `Confidence ${Math.round(result.confidence * 100)}% — needs ≥85% to run automatically. Copy the SQL to run it manually.` : ''}
                      style={{ background: 'none', border: `1px solid ${canRunQuery ? '#10b981' : '#4b5563'}`, borderRadius: 6, color: canRunQuery ? '#10b981' : '#6b7280', cursor: (running || !canRunQuery) ? 'not-allowed' : 'pointer', padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, opacity: canRunQuery ? 1 : 0.6 }}>
                      <Play size={12} /> {running ? 'Running...' : 'Run Query'}
                    </button>
                    {!canRunQuery && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>≥85% required</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <pre style={{ padding: 16, margin: 0, color: '#86efac', fontSize: 13, fontFamily: 'Monaco, monospace', overflowX: 'auto', background: '#0d0d1a', lineHeight: 1.6 }}>{result.sql}</pre>

            {/* Detected intent chips */}
            {result.detected && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {result.detected.queryType && (
                  <span style={{ color: '#6b7280', fontSize: 11, background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4 }}>
                    {result.detected.queryType}
                  </span>
                )}
                {result.detected.aggFunc && (
                  <span style={{ color: '#6b7280', fontSize: 12 }}>Agg: <strong style={{ color: '#8b5cf6' }}>{result.detected.aggFunc}</strong></span>
                )}
                {result.detected.distributionCol && (
                  <span style={{ color: '#6b7280', fontSize: 12 }}>Split by: <strong style={{ color: '#ec4899' }}>{result.detected.distributionCol}</strong></span>
                )}
                {result.detected.aggCol && !result.detected.distributionCol && (
                  <span style={{ color: '#6b7280', fontSize: 12 }}>Column: <strong style={{ color: '#f59e0b' }}>{result.detected.aggCol}</strong></span>
                )}
                {groupCols.length > 0 && (
                  <span style={{ color: '#6b7280', fontSize: 12 }}>Group by: {groupCols.map((g, i) => (
                    <strong key={i} style={{ color: '#10b981' }}>{i > 0 ? ', ' : ''}{g}</strong>
                  ))}</span>
                )}
                {result.detected.timeUnit && (
                  <span style={{ color: '#6b7280', fontSize: 12 }}>Interval: <strong style={{ color: '#3b82f6' }}>{result.detected.timeUnit}</strong></span>
                )}
                {result.detected.limit && (
                  <span style={{ color: '#6b7280', fontSize: 12 }}>Limit: <strong style={{ color: '#3b82f6' }}>{result.detected.limit}</strong></span>
                )}
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
                    <tbody>{queryResult.rows.slice(0, 50).map((row, i) => (
                      <tr key={i}>{Object.values(row).map((v, j) => (
                        <td key={j} style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0' }}>
                          {v !== null ? String(v) : <span style={{ color: '#4b5563' }}>null</span>}
                        </td>
                      ))}</tr>
                    ))}</tbody>
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
            <div key={i} onClick={() => setText(h.natural_text)}
              style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div>
                <div style={{ color: '#e2e8f0', fontSize: 13 }}>{h.natural_text}</div>
                <div style={{ color: '#4b5563', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>{h.generated_sql?.slice(0, 80)}…</div>
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
