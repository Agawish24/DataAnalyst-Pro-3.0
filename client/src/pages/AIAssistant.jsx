import { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Bot, Send, Lightbulb, Database, Sparkles, User } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend);

const COLORS = ['rgba(99,102,241,0.8)', 'rgba(139,92,246,0.8)', 'rgba(59,130,246,0.8)', 'rgba(6,182,212,0.8)', 'rgba(16,185,129,0.8)', 'rgba(245,158,11,0.8)', 'rgba(239,68,68,0.8)'];

export default function AIAssistant() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'Hello! I\'m your AI data assistant. Select a dataset and ask me anything about your data — I\'ll translate your question into SQL and show you the results!', type: 'text' }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => { fetchDatasets(); }, []);

  useEffect(() => {
    if (activeDataset) {
      api.get(`/ai/suggestions/${activeDataset.id}`).then(r => setSuggestions(r.data.suggestions)).catch(() => {});
    }
  }, [activeDataset]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendQuery = async (query = input) => {
    if (!query.trim()) return;
    if (!activeDataset) { toast.error('Please select a dataset first'); return; }

    const userMsg = { role: 'user', content: query, type: 'text' };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/ai/query', { naturalLanguage: query, datasetId: activeDataset.id });
      const { generatedSQL, rows, visualization, rowCount } = res.data;

      const assistantMsg = {
        role: 'assistant',
        type: 'result',
        content: `Found ${rowCount} result${rowCount !== 1 ? 's' : ''}`,
        sql: generatedSQL,
        rows: rows.slice(0, 50),
        visualization,
        rowCount
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', type: 'error', content: err.response?.data?.error || 'Query failed. Please try a different question.' }]);
    } finally { setLoading(false); }
  };

  const renderViz = (msg) => {
    if (!msg.rows?.length || !msg.visualization) return null;
    const { type, xKey, yKey, labelKey, valueKey } = msg.visualization;
    if (type === 'table' || !xKey) return null;

    const labels = msg.rows.map(r => String(r[xKey] || r[labelKey] || ''));
    const data = msg.rows.map(r => parseFloat(r[yKey] || r[valueKey] || 0));
    const chartData = { labels, datasets: [{ label: yKey || 'Value', data, backgroundColor: COLORS, borderRadius: 6 }] };
    const opts = { responsive: true, plugins: { legend: { display: false } }, scales: ['pie','doughnut'].includes(type) ? {} : { y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } } };

    return (
      <div className="ai-chart" style={{ height: '200px', marginTop: '12px' }}>
        {type === 'bar' && <Bar data={chartData} options={opts} />}
        {type === 'line' && <Line data={chartData} options={opts} />}
        {type === 'pie' && <Pie data={chartData} options={opts} />}
        {type === 'doughnut' && <Doughnut data={chartData} options={opts} />}
      </div>
    );
  };

  return (
    <div className="page ai-page">
      <div className="page-header">
        <h2>AI Assistant</h2>
        <p className="text-muted">Ask questions in plain English — AI converts them to SQL and visualizations</p>
      </div>

      <div className="ai-layout">
        {/* Sidebar */}
        <div className="ai-sidebar">
          <div className="card">
            <h3 className="card-title">Select Dataset</h3>
            {datasets.map(ds => (
              <div key={ds.id} className={`ds-item ${activeDataset?.id === ds.id ? 'active' : ''}`} onClick={() => selectDataset(ds)}>
                <Database size={16} />
                <div>
                  <div className="ds-name">{ds.name}</div>
                  <div className="ds-meta">{ds.row_count?.toLocaleString()} rows</div>
                </div>
              </div>
            ))}
          </div>

          {suggestions.length > 0 && (
            <div className="card">
              <h3 className="card-title"><Lightbulb size={16} /> Suggestions</h3>
              {suggestions.map((s, i) => (
                <button key={i} className="suggestion-btn" onClick={() => sendQuery(s)}>
                  <Sparkles size={12} /> {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="card ai-chat-panel">
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                <div className="msg-avatar">
                  {msg.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}
                </div>
                <div className="msg-body">
                  {msg.type === 'text' && <p>{msg.content}</p>}
                  {msg.type === 'error' && <p className="text-danger">{msg.content}</p>}
                  {msg.type === 'result' && (
                    <div>
                      <p>{msg.content}</p>
                      {msg.sql && (
                        <div className="sql-block">
                          <code>{msg.sql}</code>
                        </div>
                      )}
                      {renderViz(msg)}
                      {msg.rows?.length > 0 && (
                        <div className="table-scroll mt-2">
                          <table className="data-table compact">
                            <thead>
                              <tr>{Object.keys(msg.rows[0]).map(c => <th key={c}>{c}</th>)}</tr>
                            </thead>
                            <tbody>
                              {msg.rows.slice(0, 10).map((row, ri) => (
                                <tr key={ri}>{Object.values(row).map((v, vi) => <td key={vi}>{String(v ?? '')}</td>)}</tr>
                              ))}
                            </tbody>
                          </table>
                          {msg.rowCount > 10 && <p className="text-muted text-sm mt-1">Showing 10 of {msg.rowCount} rows</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="chat-message assistant">
                <div className="msg-avatar"><Bot size={18} /></div>
                <div className="msg-body"><div className="typing-indicator"><span></span><span></span><span></span></div></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <input
              className="chat-input"
              type="text"
              placeholder={activeDataset ? `Ask about "${activeDataset.name}"...` : "Select a dataset first..."}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendQuery()}
              disabled={loading || !activeDataset}
            />
            <button className="btn btn-primary" onClick={() => sendQuery()} disabled={loading || !input.trim() || !activeDataset}>
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
