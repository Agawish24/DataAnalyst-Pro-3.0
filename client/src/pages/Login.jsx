import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Database, Eye, EyeOff, BarChart3, Bot, Wand2, Code2, Building2,
  Plug, Network, Globe, Lock, Zap, TrendingUp, Table2, Map, Download,
  Layers, Tag, Activity, Webhook, FlaskConical, Languages, Target,
  Cpu, Shield, Lightbulb, GitBranch, BookOpen, GitMerge,
} from 'lucide-react';

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form.name, form.email, form.password);
      }
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const demoLogin = async () => {
    setLoading(true);
    try {
      await login('demo@dataanalyst.com', 'demo123');
      navigate('/dashboard');
    } catch {
      toast.error('Demo account not available yet. Please register.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-hero">
          <Database size={48} className="hero-icon" />
          <h1>DataAnalyst Pro</h1>
          <p>Enterprise data analytics suite with 40+ AI-powered features</p>
          
          {/* Feature Grid */}
          <div style={{ marginTop: 32, maxWidth: 900 }}>
            {/* Data & Processing */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Data Management</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                {[
                  { icon: BarChart3, label: 'Import & Catalog' },
                  { icon: Wand2, label: 'Data Cleaning' },
                  { icon: GitBranch, label: 'Version Control' },
                  { icon: Plug, label: 'DB Connectors' },
                  { icon: Network, label: 'Data Lineage' },
                  { icon: Lock, label: 'Data Masking' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, textAlign: 'center', fontSize: 11, color: '#d1d5db', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <Icon size={16} color='#10b981' />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Analysis */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Analytics & Visualization</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                {[
                  { icon: Code2, label: 'SQL Editor' },
                  { icon: Languages, label: 'NL to SQL' },
                  { icon: FlaskConical, label: 'ML Analytics' },
                  { icon: Table2, label: 'Pivot Tables' },
                  { icon: Map, label: 'Geo Maps' },
                  { icon: Activity, label: 'Live Streaming' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, textAlign: 'center', fontSize: 11, color: '#d1d5db', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <Icon size={16} color='#3b82f6' />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* AI & Intelligence */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>AI & Intelligence</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                {[
                  { icon: Bot, label: 'AI Assistant' },
                  { icon: Lightbulb, label: 'Business Q&A' },
                  { icon: Cpu, label: 'AutoML' },
                  { icon: Target, label: 'Prescriptive' },
                  { icon: TrendingUp, label: 'Predictions' },
                  { icon: Layers, label: 'Knowledge Graph' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, textAlign: 'center', fontSize: 11, color: '#d1d5db', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <Icon size={16} color='#a78bfa' />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Enterprise */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Enterprise & Integrations</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                {[
                  { icon: Globe, label: 'Zoho CRM' },
                  { icon: Building2, label: 'Workspaces' },
                  { icon: Webhook, label: 'Webhooks' },
                  { icon: Download, label: 'PDF Export' },
                  { icon: Shield, label: '2FA Security' },
                  { icon: Tag, label: 'Annotations' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, textAlign: 'center', fontSize: 11, color: '#d1d5db', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <Icon size={16} color='#f59e0b' />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-form-wrapper">
        <div className="auth-card">
          <div className="auth-tabs">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign In</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Sign Up</button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" placeholder="John Doe" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
            )}
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="input-with-icon">
                <input type={showPw ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required minLength={6} />
                <button type="button" className="icon-btn" onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="auth-divider"><span>or</span></div>
          <button className="btn btn-secondary btn-full" onClick={demoLogin} disabled={loading}>
            Try Demo Account
          </button>
        </div>
      </div>
    </div>
  );
}
