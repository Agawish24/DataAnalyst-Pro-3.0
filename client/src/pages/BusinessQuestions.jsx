import { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { Sparkles, Send, AlertTriangle, TrendingDown, TrendingUp, BarChart3, Code2, Lightbulb, ChevronDown, ChevronUp, Search, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

const SEVERITY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
const INTENT_ICONS = { isDropQuestion: TrendingDown, isGrowthQuestion: TrendingUp, isAnomalyQuestion: AlertTriangle, isTrendQuestion: BarChart3 };

const FindingCard = ({ finding }) => {
  const [open, setOpen] = useState(true);
  const color = SEVERITY_COLORS[finding.severity] || '#6366f1';
  return (
    <div style={{ border: `1px solid ${color}30`, borderLeft: `3px solid ${color}`, borderRadius: '0 10px 10px 0', padding: 14, marginBottom: 8, background: `${color}08` }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: `${color}20`, color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{finding.severity}</span>
          <span style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>{finding.title}</span>
        </div>
        {open ? <ChevronUp size={14} color="#6b7280" /> : <ChevronDown size={14} color="#6b7280" />}
      </div>
      {open && <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>{finding.detail}</p>}
    </div>
  );
};

export default function BusinessQuestions() {
  const { selectedDataset, datasets } = useData();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showNarrative, setShowNarrative] = useState(true);
  const inputRef = useRef();

  useEffect(() => {
    if (selectedDataset) {
      api.get(`/business-questions/suggestions/${selectedDataset.id}`).then(setSuggestions).catch(() => {});
      api.get('/business-questions').then(setHistory).catch(() => {});
    }
  }, [selectedDataset]);

  const ask = async (q = question) => {
    if (!q.trim()) return toast.error('Enter a question');
    if (!selectedDataset) return toast.error('Select a dataset first');
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post('/business-questions/analyze', { question: q, dataset_id: selectedDataset.id });
      setResult(res);
      setQuestion(q);
    } catch (err) { toast.error(err.response?.data?.error || 'Analysis failed'); }
    finally { setLoading(false); }
  };

  const copySQL = (sql) => { navigator.clipboard.writeText(sql); toast.success('SQL copied'); };

  const intentLabels = result ? Object.entries(result.intent || {}).filter(([, v]) => v).map(([k]) => k.replace('is', '').replace('Question', '')) : [];

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={22} color="#6366f1" /> Business Question Engine
        </h1>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>Ask any business question in plain English — get root-cause analysis, correlations, anomaly detection, and ready-to-run SQL</p>
      </div>

      {/* Input */}
      <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 16, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
            <input ref={inputRef} value={question} onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ask()}
              placeholder="e.g. Why did revenue drop in Q2? Which products are underperforming? What caused the sales spike?"
              style={{ width: '100%', padding: '14px 14px 14px 44px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f3f4f6', fontSize: 15, boxSizing: 'border-box' }} />
          </div>
          <button onClick={() => ask()} disabled={loading || !selectedDataset}
            style={{ padding: '14px 24px', background: loading ? 'rgba(99,102,241,0.4)' : '#6366f1', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 15, opacity: !selectedDataset ? 0.5 : 1 }}>
            {loading ? <><Zap size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Analyzing...</> : <><Send size={15} /> Analyze</>}
          </button>
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && !result && (
          <div style={{ marginTop: 14 }}>
            <div style={{ color: '#4b5563', fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Suggested questions</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {suggestions.slice(0, 6).map((s, i) => (
                <button key={i} onClick={() => { setQuestion(s); ask(s); }}
                  style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, color: '#9ca3af', cursor: 'pointer', fontSize: 13, transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.2)'; e.currentTarget.style.color = '#a5b4fc'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#9ca3af'; }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!selectedDataset && (
        <div style={{ textAlign: 'center', padding: 60, color: '#4b5563' }}>
          <Sparkles size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
          <p>Select a dataset from Data Import to start asking business questions</p>
        </div>
      )}

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          {/* Main Analysis */}
          <div>
            {/* Intent + Overview */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {intentLabels.map(l => (
                  <span key={l} style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{l}</span>
                ))}
                {result.targetMetric && <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '3px 12px', borderRadius: 20, fontSize: 12 }}>Metric: {result.targetMetric}</span>}
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                {[['Rows', result.dataOverview?.rows?.toLocaleString()], ['Numeric Cols', result.dataOverview?.numericColumns], ['Findings', result.findings?.length], ['Recommendations', result.recommendations?.length]].map(([label, val]) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 20 }}>{val}</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Findings */}
            {result.findings?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 10, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} color="#f59e0b" /> Findings ({result.findings.length})
                </h3>
                {result.findings.map((f, i) => <FindingCard key={i} finding={f} />)}
              </div>
            )}

            {/* Narrative */}
            {result.narrative && (
              <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <button onClick={() => setShowNarrative(!showNarrative)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#a5b4fc', fontWeight: 600, fontSize: 14, marginBottom: showNarrative ? 12 : 0, padding: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> AI Narrative</span>
                  {showNarrative ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showNarrative && (
                  <div style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                    {result.narrative.replace(/##\s+/g, '').replace(/###\s+/g, '').replace(/\*\*(.*?)\*\*/g, '$1')}
                  </div>
                )}
              </div>
            )}

            {/* SQL Queries */}
            {result.suggestedQueries?.length > 0 && (
              <div>
                <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 10, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Code2 size={14} color="#06b6d4" /> Suggested SQL Queries
                </h3>
                {result.suggestedQueries.map((q, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 500 }}>{q.label}</span>
                      <button onClick={() => copySQL(q.sql)} style={{ padding: '4px 10px', background: 'rgba(6,182,212,0.15)', border: 'none', borderRadius: 6, color: '#67e8f9', cursor: 'pointer', fontSize: 11 }}>Copy SQL</button>
                    </div>
                    <code style={{ color: '#a5b4fc', fontSize: 12, fontFamily: 'monospace', display: 'block', whiteSpace: 'pre-wrap' }}>{q.sql}</code>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar: Recommendations */}
          <div>
            {result.recommendations?.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
                <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 14, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lightbulb size={14} color="#fbbf24" /> Recommendations
                </h3>
                {result.recommendations.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, padding: '10px 12px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)', borderRadius: 8 }}>
                    <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.5 }}>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recent Questions */}
            {history.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 16 }}>
                <h3 style={{ color: '#6b7280', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Recent</h3>
                {history.slice(0, 8).map(h => (
                  <button key={h.id} onClick={() => ask(h.question)}
                    style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', marginBottom: 2 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <div style={{ color: '#9ca3af', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.question}</div>
                    <div style={{ color: '#4b5563', fontSize: 11 }}>{new Date(h.created_at).toLocaleDateString()}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
