import { useState, useRef } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Code2, Play, CheckCircle2, AlertTriangle, XCircle, Lightbulb, Copy, FileCode, RefreshCw, BookOpen } from 'lucide-react';

const LANGS = [
  { id: 'sql', label: 'SQL', color: '#3b82f6', icon: '🗄️', placeholder: 'SELECT * FROM dataset WHERE...' },
  { id: 'python', label: 'Python', color: '#f59e0b', icon: '🐍', placeholder: 'import pandas as pd\ndf = pd.read_csv("data.csv")\n...' },
  { id: 'r', label: 'R', color: '#10b981', icon: '📊', placeholder: 'library(tidyverse)\ndf <- read_csv("data.csv")\n...' },
];

const sev = { error: { icon: XCircle, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' }, warning: { icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }, info: { icon: Lightbulb, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' } };

export default function SyntaxHelper() {
  const [lang, setLang] = useState('sql');
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const textRef = useRef(null);

  const analyze = async () => {
    if (!code.trim()) return toast.error('Enter some code first');
    setLoading(true);
    try {
      const r = await api.post('/syntax-helper/analyze', { code, language: lang });
      setResult(r.data);
      if (r.data.isClean) toast.success('No issues found — code looks clean!');
      else toast(`Found ${r.data.errorCount} issue${r.data.errorCount !== 1 ? 's' : ''}`, { icon: '⚠️' });
    } catch (e) { toast.error(e.response?.data?.error || 'Analysis failed'); }
    finally { setLoading(false); }
  };

  const loadTemplates = async () => {
    const r = await api.get(`/syntax-helper/templates/${lang}`);
    setTemplates(r.data);
    setShowTemplates(true);
  };

  const loadHistory = async () => {
    const r = await api.get('/syntax-helper/history');
    setHistory(r.data);
    setShowHistory(true);
  };

  const applyFix = () => {
    if (result?.fixedCode) { setCode(result.fixedCode); toast.success('Fixed code applied!'); }
  };

  const copy = (text) => { navigator.clipboard.writeText(text); toast.success('Copied!'); };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') { e.preventDefault(); const s = textRef.current; const start = s.selectionStart, end = s.selectionEnd; const newCode = code.slice(0, start) + '  ' + code.slice(end); setCode(newCode); setTimeout(() => { s.selectionStart = s.selectionEnd = start + 2; }, 0); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') analyze();
  };

  const currentLang = LANGS.find(l => l.id === lang);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px' }}>Syntax Helper</h1>
        <p style={{ color: '#9ca3af', margin: 0 }}>Detect and fix syntax errors in SQL, Python, and R with intelligent suggestions</p>
      </div>

      {/* Language selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {LANGS.map(l => (
          <button key={l.id} onClick={() => { setLang(l.id); setResult(null); }}
            style={{ padding: '8px 20px', borderRadius: 8, border: `2px solid ${lang === l.id ? l.color : 'rgba(255,255,255,0.1)'}`, background: lang === l.id ? `${l.color}22` : 'rgba(255,255,255,0.04)', color: lang === l.id ? l.color : '#9ca3af', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{l.icon}</span> {l.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={loadTemplates} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <BookOpen size={14} /> Templates
        </button>
        <button onClick={loadHistory} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCw size={14} /> History
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Editor */}
        <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Code2 size={16} color={currentLang.color} />
              <span style={{ color: currentLang.color, fontWeight: 600, fontSize: 14 }}>{currentLang.label} Editor</span>
              <span style={{ color: '#4b5563', fontSize: 12 }}>Ctrl+Enter to analyze</span>
            </div>
            <button onClick={() => copy(code)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <Copy size={12} /> Copy
            </button>
          </div>
          <textarea ref={textRef} value={code} onChange={e => setCode(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={currentLang.placeholder}
            style={{ width: '100%', minHeight: 380, background: '#0d0d1a', color: '#e2e8f0', fontFamily: 'Monaco, Menlo, "Courier New", monospace', fontSize: 13, lineHeight: 1.6, padding: 16, border: 'none', outline: 'none', resize: 'vertical', boxSizing: 'border-box', tabSize: 2 }} />
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 10 }}>
            <button onClick={analyze} disabled={loading}
              style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: loading ? '#374151' : `linear-gradient(135deg, ${currentLang.color}, ${currentLang.color}cc)`, color: 'white', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {loading ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Play size={15} /> Analyze Code</>}
            </button>
            {result?.fixedCode && (
              <button onClick={applyFix} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #10b981', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={15} /> Apply Fix
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Status bar */}
            <div style={{ background: result.isClean ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${result.isClean ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
              {result.isClean ? <CheckCircle2 size={20} color="#10b981" /> : <XCircle size={20} color="#ef4444" />}
              <div>
                <div style={{ color: result.isClean ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                  {result.isClean ? 'No Issues Found' : `${result.errorCount} Issue${result.errorCount !== 1 ? 's' : ''} Detected`}
                </div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>{result.language.toUpperCase()} • {result.errors.length} errors, {result.suggestions.length} suggestions</div>
              </div>
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>Issues & Fixes</div>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {result.errors.map((e, i) => {
                    const s = sev[e.type] || sev.warning;
                    const Icon = s.icon;
                    return (
                      <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: s.bg }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <Icon size={15} color={s.color} style={{ flexShrink: 0, marginTop: 2 }} />
                          <div>
                            <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{e.message}</div>
                            {e.fix && <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 3 }}>Fix: {e.fix}</div>}
                            {e.line && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>Line {e.line}</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Suggestions */}
            {result.suggestions.length > 0 && (
              <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#f3f4f6', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lightbulb size={14} color="#f59e0b" /> Best Practice Suggestions
                </div>
                {result.suggestions.map((s, i) => (
                  <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 8 }}>
                    <span style={{ color: '#f59e0b', fontSize: 13 }}>→</span>
                    <span style={{ color: '#9ca3af', fontSize: 13 }}>{s}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Fixed code preview */}
            {result.fixedCode && (
              <div style={{ background: '#13131f', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: '#10b981', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} /> Auto-Fixed Code</span>
                  <button onClick={() => copy(result.fixedCode)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Copy size={12} /> Copy</button>
                </div>
                <pre style={{ padding: 16, margin: 0, color: '#86efac', fontSize: 12, fontFamily: 'Monaco, monospace', overflowX: 'auto', maxHeight: 200, overflowY: 'auto' }}>{result.fixedCode}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Templates modal */}
      {showTemplates && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowTemplates(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 18 }}>{currentLang.label} Templates</span>
              <button onClick={() => setShowTemplates(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {templates.map((t, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{t.name}</span>
                    <button onClick={() => { setCode(t.code); setShowTemplates(false); }} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${currentLang.color}`, background: 'transparent', color: currentLang.color, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Use</button>
                  </div>
                  <pre style={{ padding: 12, margin: 0, color: '#9ca3af', fontSize: 11, fontFamily: 'Monaco, monospace', overflowX: 'auto' }}>{t.code}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {showHistory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowHistory(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 18 }}>Analysis History</span>
              <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: 20 }}>
              {history.length === 0 ? <p style={{ color: '#6b7280', textAlign: 'center' }}>No analysis history yet</p> : history.map((h, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }} onClick={() => { setLang(h.language); setCode(h.code); setShowHistory(false); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: currentLang.color, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>{h.language}</span>
                    <span style={{ color: '#4b5563', fontSize: 11 }}>{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  <pre style={{ color: '#9ca3af', fontSize: 11, fontFamily: 'monospace', margin: 0, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>{h.code?.slice(0, 200)}</pre>
                  <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>{h.errors?.length || 0} issues found</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
