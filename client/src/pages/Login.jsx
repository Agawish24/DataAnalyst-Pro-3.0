import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Database, Eye, EyeOff } from 'lucide-react';

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
          <p>Upload, clean, analyze and visualize your data with AI-powered insights</p>
          <div className="hero-features">
            <div className="feature-tag">📊 Interactive Charts</div>
            <div className="feature-tag">🤖 AI Assistant</div>
            <div className="feature-tag">🧹 Data Cleaning</div>
            <div className="feature-tag">📈 ML Analytics</div>
            <div className="feature-tag">💾 SQL Editor</div>
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
