import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  Bot, Key, Send, Code2, Wand2, Bug, Zap, MessageSquare,
  ChevronDown, X, Check, ExternalLink, Copy, RotateCcw,
  Play, Settings, Trash2, FileCode, Sparkles, ChevronRight,
} from 'lucide-react';

const LANGUAGES = [
  'Python', 'JavaScript', 'TypeScript', 'SQL', 'R', 'Java', 'C', 'C++', 'C#',
  'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'Shell', 'YAML',
  'JSON', 'HTML', 'CSS', 'Markdown', 'GraphQL', 'Dockerfile', 'Terraform',
];

const ACTIONS = [
  { id: 'explain', label: 'Explain', icon: MessageSquare, color: '#6366f1', prompt: (code, lang) => `Explain this ${lang} code clearly and concisely:\n\`\`\`${lang.toLowerCase()}\n${code}\n\`\`\`` },
  { id: 'fix', label: 'Fix Bugs', icon: Bug, color: '#ef4444', prompt: (code, lang) => `Find and fix all bugs in this ${lang} code. Show the corrected version and explain what was wrong:\n\`\`\`${lang.toLowerCase()}\n${code}\n\`\`\`` },
  { id: 'optimize', label: 'Optimize', icon: Zap, color: '#f59e0b', prompt: (code, lang) => `Optimize this ${lang} code for performance and readability. Show the improved version with explanations:\n\`\`\`${lang.toLowerCase()}\n${code}\n\`\`\`` },
  { id: 'complete', label: 'Complete', icon: Wand2, color: '#10b981', prompt: (code, lang) => `Complete this ${lang} code — fill in the missing parts, stubs, and TODOs:\n\`\`\`${lang.toLowerCase()}\n${code}\n\`\`\`` },
  { id: 'review', label: 'Code Review', icon: Sparkles, color: '#8b5cf6', prompt: (code, lang) => `Do a thorough code review of this ${lang} code. Check for bugs, security issues, performance problems, and style:\n\`\`\`${lang.toLowerCase()}\n${code}\n\`\`\`` },
  { id: 'test', label: 'Write Tests', icon: Check, color: '#ec4899', prompt: (code, lang) => `Write comprehensive unit tests for this ${lang} code using appropriate testing frameworks:\n\`\`\`${lang.toLowerCase()}\n${code}\n\`\`\`` },
];

const card = { background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 };
const btn = (bg = '#6366f1', outline = false) => ({
  padding: '7px 14px', borderRadius: 8, border: outline ? `1px solid ${bg}40` : 'none',
  background: outline ? 'transparent' : bg, color: outline ? bg : 'white',
  cursor: 'pointer', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
});

function ModelBadge({ model, selected, configured, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
      borderRadius: 10, border: `1px solid ${selected ? model.color + '60' : 'rgba(255,255,255,0.08)'}`,
      background: selected ? model.color + '15' : 'transparent', cursor: 'pointer',
      width: '100%', textAlign: 'left', position: 'relative',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: configured ? '#10b981' : '#374151', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: selected ? model.color : '#d1d5db', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.name}</div>
        <div style={{ fontSize: 10, color: '#6b7280' }}>{model.badge} · {model.speed}</div>
      </div>
      {selected && <ChevronRight size={12} color={model.color} />}
    </button>
  );
}

function KeyModal({ models, onClose, onSave }) {
  const [keys, setKeys] = useState({});
  const [saving, setSaving] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const save = async (modelId) => {
    if (!keys[modelId]?.trim()) return;
    setSaving(modelId);
    try {
      await api.post('/vibe-coding/keys', { modelId, apiKey: keys[modelId].trim() });
      toast.success('API key saved');
      setKeys(prev => ({ ...prev, [modelId]: '' }));
      onSave();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save key');
    } finally { setSaving(null); }
  };

  const remove = async (modelId) => {
    setDeleting(modelId);
    try {
      await api.delete(`/vibe-coding/keys/${modelId}`);
      toast.success('Key removed');
      onSave();
    } catch { toast.error('Failed to remove'); } finally { setDeleting(null); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ ...card, width: '100%', maxWidth: 620, maxHeight: '85vh', overflow: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f3f4f6' }}>API Keys — Free Models</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>All models have free tiers — click the link to get your key</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}><X size={20} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {models.map(model => (
            <div key={model.id} style={{ ...card, padding: 16, borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: model.configured ? '#10b981' : '#374151' }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: model.color }}>{model.name}</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', background: model.color + '20', color: model.color, borderRadius: 4, fontWeight: 600 }}>FREE</span>
                    {model.configured && <span style={{ fontSize: 10, padding: '2px 6px', background: '#10b98120', color: '#10b981', borderRadius: 4, fontWeight: 600 }}>CONFIGURED</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, maxWidth: 400 }}>{model.description}</div>
                </div>
                <a href={model.keyUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6366f1', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Get free key <ExternalLink size={11} />
                </a>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  placeholder={model.configured ? '••••••• (key saved — paste new to update)' : model.keyLabel}
                  value={keys[model.id] || ''}
                  onChange={e => setKeys(prev => ({ ...prev, [model.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && save(model.id)}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13, outline: 'none' }}
                />
                <button onClick={() => save(model.id)} disabled={!keys[model.id]?.trim() || saving === model.id}
                  style={{ ...btn(), opacity: !keys[model.id]?.trim() ? 0.4 : 1 }}>
                  {saving === model.id ? '...' : <><Check size={14} /> Save</>}
                </button>
                {model.configured && (
                  <button onClick={() => remove(model.id)} disabled={deleting === model.id}
                    style={{ ...btn('#ef4444'), opacity: 0.8 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: '#4b5563', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Key size={11} />
          Keys are encrypted with AES-256 and stored securely — never shared with third parties
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ msg }) {
  const [copied, setCopied] = useState(false);

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUser = msg.role === 'user';

  const renderInline = (text) => {
    const segments = [];
    let last = 0;
    const combined = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)]+)\))/g;
    let m;
    while ((m = combined.exec(text)) !== null) {
      if (m.index > last) segments.push(<span key={last}>{text.slice(last, m.index)}</span>);
      if (m[0].startsWith('**')) {
        segments.push(<strong key={m.index} style={{ color: '#f3f4f6' }}>{m[2]}</strong>);
      } else {
        segments.push(<a key={m.index} href={m[4]} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>{m[3]}</a>);
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) segments.push(<span key={last}>{text.slice(last)}</span>);
    return segments.length ? segments : text;
  };

  const renderContent = (text) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      const codeMatch = part.match(/```(\w*)\n?([\s\S]*?)```/);
      if (codeMatch) {
        const [, lang, code] = codeMatch;
        return (
          <div key={i} style={{ margin: '10px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{lang || 'code'}</span>
              <button onClick={() => copyCode(code.trim())} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#10b981' : '#6b7280', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Copy size={11} /> {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre style={{ margin: 0, padding: '12px 16px', background: '#0d0d1a', color: '#e2e8f0', fontSize: 12, lineHeight: 1.6, overflowX: 'auto', fontFamily: '"JetBrains Mono", "Fira Code", monospace', whiteSpace: 'pre' }}>
              {code.trim()}
            </pre>
          </div>
        );
      }
      if (!part) return null;
      return (
        <span key={i} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {part.split('\n').map((line, li, arr) => (
            <span key={li}>{renderInline(line)}{li < arr.length - 1 ? <br /> : null}</span>
          ))}
        </span>
      );
    });
  };

  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 0', borderBottom: `1px solid ${msg.isError ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)'}`, background: msg.isError ? 'rgba(245,158,11,0.05)' : 'transparent', borderRadius: msg.isError ? 8 : 0, paddingLeft: msg.isError ? 10 : 0 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: isUser ? '#6366f1' : msg.isError ? 'rgba(245,158,11,0.2)' : '#13131f', border: `1px solid ${msg.isError ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isUser ? <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>U</span> : <Bot size={16} color={msg.isError ? '#f59e0b' : '#6366f1'} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {msg.modelName && !isUser && (
          <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 6 }}>{msg.modelName}</div>
        )}
        {msg.isError && <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, marginBottom: 4 }}>⚠ Rate Limited</div>}
        <div style={{ color: isUser ? '#9ca3af' : msg.isError ? '#fcd34d' : '#d1d5db', fontSize: 13 }}>
          {renderContent(msg.content)}
        </div>
      </div>
    </div>
  );
}

export default function VibeCoding() {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [language, setLanguage] = useState('Python');
  const [code, setCode] = useState('# Start typing your code here...\n\ndef hello(name):\n    return f"Hello, {name}!"\n\nprint(hello("World"))');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [showLangDrop, setShowLangDrop] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const loadModels = useCallback(async () => {
    try {
      const r = await api.get('/vibe-coding/models');
      setModels(r.data);
      if (!selectedModel) {
        const first = r.data.find(m => m.configured) || r.data[0];
        setSelectedModel(first);
      } else {
        setSelectedModel(prev => r.data.find(m => m.id === prev?.id) || prev);
      }
    } catch {}
  }, [selectedModel]);

  useEffect(() => { loadModels(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async (userText, action = 'chat') => {
    if (!userText.trim() || loading) return;
    if (!selectedModel) return toast.error('Select a model first');

    const userMsg = { role: 'user', content: userText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const payload = newMessages.map(m => ({ role: m.role, content: m.content }));
      const r = await api.post('/vibe-coding/chat', {
        modelId: selectedModel.id,
        messages: payload,
        language,
        action,
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: r.data.response,
        modelName: r.data.model,
      }]);
    } catch (e) {
      const data = e.response?.data || {};
      if (data.rateLimited) {
        const secs = data.retryAfter || 60;
        toast.error(`Rate limit hit — wait ${secs}s then retry, or switch to Llama 3.1 8B (higher limits)`, { duration: Math.min(secs * 1000, 12000) });
        setMessages(prev => [...prev.slice(0, -1), {
          role: 'assistant',
          content: `⚠️ **Rate limit reached** — the model is temporarily throttled.\n\nPlease wait **${secs} seconds** and try again, or switch to **Llama 3.1 8B** (30k TPM limit vs 12k for 70B) in the model list on the left.\n\nGroq free tier: [upgrade at console.groq.com/settings/billing](https://console.groq.com/settings/billing)`,
          isError: true,
        }]);
      } else {
        const err = data.error || 'Request failed';
        if (data.needsKey) {
          setShowKeys(true);
        }
        toast.error(err);
        setMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const runAction = (action) => {
    if (!code.trim() || code === '# Start typing your code here...') {
      return toast.error('Add some code first');
    }
    sendMessage(action.prompt(code, language), action.id);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const applyCodeFromLastResponse = () => {
    const lastAI = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAI) return toast.error('No AI response yet');
    const match = lastAI.content.match(/```[\w]*\n?([\s\S]*?)```/);
    if (match) {
      setCode(match[1].trim());
      toast.success('Code applied to editor');
    } else {
      toast.error('No code block found in last response');
    }
  };

  const currentModel = selectedModel ? models.find(m => m.id === selectedModel.id) : null;

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto', height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showKeys && (
        <KeyModal models={models} onClose={() => setShowKeys(false)} onSave={() => { setShowKeys(false); loadModels(); }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bot size={26} color="#6366f1" /> Vibe Coding
          </h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: 13 }}>
            AI-powered coding assistant — switch between 6 free models, all supporting every programming language
          </p>
        </div>
        <button onClick={() => setShowKeys(true)} style={{ ...btn('transparent', true), borderColor: 'rgba(255,255,255,0.15)', color: '#9ca3af', gap: 6 }}>
          <Key size={14} /> Manage API Keys
        </button>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr 420px', gap: 16, minHeight: 0 }}>

        {/* Left: Model selector */}
        <div style={{ ...card, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 1, padding: '4px 4px 8px' }}>
            AI Models
          </div>
          {models.map(model => (
            <ModelBadge
              key={model.id}
              model={model}
              selected={selectedModel?.id === model.id}
              configured={model.configured}
              onClick={() => setSelectedModel(model)}
            />
          ))}

          <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Language
            </div>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowLangDrop(!showLangDrop)} style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.03)', cursor: 'pointer', color: '#d1d5db', fontSize: 12,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileCode size={12} />{language}</span>
                <ChevronDown size={12} color="#6b7280" />
              </button>
              {showLangDrop && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#1e1e2e',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, zIndex: 100,
                  maxHeight: 200, overflowY: 'auto', marginBottom: 4,
                }}>
                  {LANGUAGES.map(l => (
                    <button key={l} onClick={() => { setLanguage(l); setShowLangDrop(false); }} style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px',
                      background: language === l ? 'rgba(99,102,241,0.2)' : 'transparent',
                      color: language === l ? '#818cf8' : '#9ca3af', border: 'none', cursor: 'pointer', fontSize: 12,
                    }}>{l}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {currentModel && (
            <div style={{ padding: 10, background: currentModel.color + '10', border: `1px solid ${currentModel.color}30`, borderRadius: 8, marginTop: 8 }}>
              <div style={{ fontSize: 10, color: currentModel.color, fontWeight: 700, marginBottom: 4 }}>{currentModel.name}</div>
              <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.5 }}>{currentModel.description}</div>
              <div style={{ fontSize: 10, color: '#4b5563', marginTop: 4 }}>{currentModel.context} · {currentModel.speed}</div>
            </div>
          )}
        </div>

        {/* Center: Code editor */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Code2 size={16} color="#6366f1" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db' }}>Code Editor</span>
              <span style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderRadius: 4 }}>{language}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={applyCodeFromLastResponse} style={{ ...btn('transparent', true), borderColor: 'rgba(255,255,255,0.1)', color: '#6b7280', fontSize: 11 }}>
                <RotateCcw size={12} /> Apply AI Code
              </button>
              <button onClick={() => setCode('')} style={{ ...btn('transparent', true), borderColor: 'rgba(255,255,255,0.1)', color: '#6b7280', fontSize: 11 }}>
                <Trash2 size={12} /> Clear
              </button>
            </div>
          </div>

          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1, background: '#0d0d1a', color: '#e2e8f0', border: 'none', outline: 'none',
              padding: 20, fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
              fontSize: 13, lineHeight: 1.7, resize: 'none', tabSize: 2,
            }}
            onKeyDown={e => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const s = e.target.selectionStart;
                const end = e.target.selectionEnd;
                const newVal = code.substring(0, s) + '  ' + code.substring(end);
                setCode(newVal);
                setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2; }, 0);
              }
            }}
          />

          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            {ACTIONS.map(action => (
              <button key={action.id} onClick={() => runAction(action)} disabled={loading} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                borderRadius: 8, border: `1px solid ${action.color}40`,
                background: action.color + '12', color: action.color, cursor: 'pointer',
                fontWeight: 600, fontSize: 12, opacity: loading ? 0.5 : 1,
              }}>
                <action.icon size={13} /> {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: AI Chat */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bot size={16} color="#6366f1" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db' }}>AI Chat</span>
              {currentModel && (
                <span style={{ fontSize: 10, padding: '2px 6px', background: currentModel.color + '20', color: currentModel.color, borderRadius: 4, fontWeight: 600 }}>
                  {currentModel.name}
                </span>
              )}
            </div>
            <button onClick={() => setMessages([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: 4 }}>
              <Trash2 size={14} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
            {messages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={28} color="#6366f1" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#9ca3af', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Ready to code with AI</div>
                  <div style={{ color: '#4b5563', fontSize: 12, lineHeight: 1.6 }}>
                    Write code in the editor, then use the action buttons or chat below
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                  {[
                    'Write a function to parse CSV data',
                    'Create a REST API with Express',
                    'Explain how async/await works',
                    'Fix the bugs in my code',
                  ].map(s => (
                    <button key={s} onClick={() => sendMessage(s)} style={{
                      padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.02)', color: '#6b7280', cursor: 'pointer',
                      fontSize: 12, textAlign: 'left',
                    }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)
            )}
            {loading && (
              <div style={{ display: 'flex', gap: 10, padding: '12px 0' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={16} color="#6366f1" />
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', paddingTop: 6 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: `bounce 1s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            {!currentModel?.configured && (
              <div style={{ padding: '8px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, marginBottom: 10, fontSize: 12, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Key size={13} />
                <span>No API key for <strong>{currentModel?.name || 'selected model'}</strong> — </span>
                <button onClick={() => setShowKeys(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 12, fontWeight: 600, padding: 0 }}>Add free key</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your code… (Enter to send, Shift+Enter for newline)"
                disabled={loading}
                rows={3}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, padding: '10px 14px', color: '#f3f4f6', fontSize: 13,
                  resize: 'none', outline: 'none', lineHeight: 1.5,
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              />
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading} style={{
                padding: '10px 14px', borderRadius: 10, border: 'none',
                background: loading || !input.trim() ? '#374151' : '#6366f1',
                color: 'white', cursor: loading || !input.trim() ? 'default' : 'pointer',
                flexShrink: 0,
              }}>
                <Send size={16} />
              </button>
            </div>
            <div style={{ fontSize: 10, color: '#374151', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>Enter to send · Shift+Enter for new line</span>
              <span>{messages.length} messages</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
