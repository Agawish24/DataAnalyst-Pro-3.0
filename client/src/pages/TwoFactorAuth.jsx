import { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Shield, ShieldCheck, ShieldOff, Smartphone, Key, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function TwoFactorAuth() {
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('status');

  useEffect(() => { loadStatus(); }, []);

  const loadStatus = async () => {
    try { const r = await api.get('/tfa/status'); setStatus(r.data); }
    catch {}
  };

  const startSetup = async () => {
    setLoading(true);
    try {
      const r = await api.post('/tfa/setup');
      setSetup(r.data); setStep('scan');
    } catch (e) { toast.error(e.response?.data?.error || 'Setup failed'); }
    finally { setLoading(false); }
  };

  const verify = async () => {
    if (!token || token.length !== 6) return toast.error('Enter the 6-digit code');
    setLoading(true);
    try {
      await api.post('/tfa/verify', { token });
      toast.success('2FA enabled successfully!'); setStep('status'); loadStatus(); setToken(''); setSetup(null);
    } catch (e) { toast.error(e.response?.data?.error || 'Invalid code'); }
    finally { setLoading(false); }
  };

  const disable = async () => {
    if (!confirm('Disable 2FA? Your account will be less secure.')) return;
    try { await api.delete('/tfa/disable'); toast.success('2FA disabled'); loadStatus(); }
    catch (e) { toast.error('Failed'); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={26} color="#6366f1" /> Two-Factor Authentication
        </h1>
        <p style={{ color: '#9ca3af', margin: 0 }}>Add an extra layer of security to your account using an authenticator app</p>
      </div>

      {/* Status card */}
      {status && step === 'status' && (
        <div style={{ background: '#13131f', border: `1px solid ${status.enabled ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 16, padding: 28, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
            {status.enabled ? <ShieldCheck size={48} color="#10b981" /> : <ShieldOff size={48} color="#6b7280" />}
            <div>
              <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 20 }}>
                {status.enabled ? '2FA is Enabled' : '2FA is Disabled'}
              </div>
              <div style={{ color: '#9ca3af', fontSize: 14, marginTop: 4 }}>
                {status.enabled ? `Enabled on ${new Date(status.setupAt).toLocaleDateString()}` : 'Your account is protected by password only'}
              </div>
            </div>
          </div>
          {status.enabled ? (
            <button onClick={disable} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldOff size={15} /> Disable 2FA
            </button>
          ) : (
            <button onClick={startSetup} disabled={loading}
              style={{ padding: '12px 28px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              {loading ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Shield size={16} />} Enable 2FA
            </button>
          )}
        </div>
      )}

      {/* Setup steps */}
      {step === 'scan' && setup && (
        <div>
          {/* Steps */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            {['Scan QR', 'Verify Code', 'Done'].map((s, i) => (
              <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? '#6366f1' : 'rgba(255,255,255,0.1)', color: i === 0 ? 'white' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: 13, fontWeight: 700 }}>{i + 1}</div>
                <div style={{ color: i === 0 ? '#f3f4f6' : '#6b7280', fontSize: 12 }}>{s}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, marginBottom: 20 }}>
            <h3 style={{ color: '#f3f4f6', fontWeight: 700, marginTop: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Smartphone size={20} color="#6366f1" /> Step 1: Scan QR Code</h3>
            <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 20 }}>Open your authenticator app (Google Authenticator, Authy, 1Password) and scan this QR code:</p>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <img src={setup.qrCode} alt="QR Code" style={{ border: '4px solid white', borderRadius: 12, maxWidth: 220 }} />
            </div>
            <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: 12 }}>
              <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>Manual entry key (if QR doesn't work):</div>
              <div style={{ fontFamily: 'monospace', color: '#818cf8', fontSize: 14, letterSpacing: 2 }}>{setup.secret}</div>
            </div>
          </div>

          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28 }}>
            <h3 style={{ color: '#f3f4f6', fontWeight: 700, marginTop: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Key size={20} color="#6366f1" /> Step 2: Enter Verification Code</h3>
            <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 16 }}>Enter the 6-digit code shown in your authenticator app to confirm setup:</p>
            <input value={token} onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" maxLength={6}
              style={{ width: '100%', background: '#0d0d1a', border: '2px solid rgba(99,102,241,0.3)', borderRadius: 10, color: '#f3f4f6', padding: '14px 18px', fontSize: 28, fontFamily: 'monospace', textAlign: 'center', letterSpacing: 8, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
              onKeyDown={e => e.key === 'Enter' && verify()} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setStep('status'); setSetup(null); setToken(''); }} style={{ flex: 1, padding: '12px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={verify} disabled={loading || token.length !== 6}
                style={{ flex: 2, padding: '12px 0', borderRadius: 8, border: 'none', background: token.length === 6 ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#374151', color: 'white', cursor: token.length === 6 ? 'pointer' : 'not-allowed', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={16} />} Verify & Enable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 24 }}>
        {[
          { icon: '📱', title: 'Authenticator App', desc: 'Use Google Authenticator, Authy, or 1Password to generate time-based codes' },
          { icon: '🔑', title: '6-Digit Code', desc: 'A new code is generated every 30 seconds — enter it at login' },
          { icon: '🛡️', title: 'TOTP Standard', desc: 'Uses industry-standard TOTP (RFC 6238) for maximum compatibility' },
        ].map(card => (
          <div key={card.title} style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
            <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{card.title}</div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>{card.desc}</div>
          </div>
        ))}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
