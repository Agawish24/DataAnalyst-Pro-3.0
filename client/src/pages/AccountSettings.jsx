import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { User, Lock, Shield, Mail, Camera, Save, Eye, EyeOff, Crown, CheckCircle2, AlertCircle } from 'lucide-react';

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
  '#10b981', '#14b8a6', '#3b82f6', '#06b6d4', '#84cc16',
];

const card = {
  background: '#13131f', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: 24, marginBottom: 20,
};
const label = { color: '#9ca3af', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 };
const input = {
  width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
};
const btn = (variant = 'primary') => ({
  padding: '10px 22px', borderRadius: 8, fontWeight: 600, fontSize: 14,
  cursor: 'pointer', border: 'none', transition: 'opacity 0.15s',
  background: variant === 'primary' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.07)',
  color: '#fff',
});

export default function AccountSettings() {
  const { user, updateUser } = useAuth();

  const [profile, setProfile] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
    avatar_color: user?.avatar_color || '#6366f1',
  });

  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, newPass: false, confirm: false });
  const [forgotEmail, setForgotEmail] = useState(user?.email || '');
  const [resetToken, setResetToken] = useState('');
  const [newPwReset, setNewPwReset] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await api.put('/auth/profile', { name: profile.name, bio: profile.bio, avatar_color: profile.avatar_color });
      updateUser(res.data);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    } finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (!passwords.current || !passwords.newPass) return toast.error('Fill in all password fields');
    if (passwords.newPass !== passwords.confirm) return toast.error('New passwords do not match');
    if (passwords.newPass.length < 8) return toast.error('Password must be at least 8 characters');
    setChangingPw(true);
    try {
      await api.put('/auth/password', { currentPassword: passwords.current, newPassword: passwords.newPass });
      toast.success('Password changed successfully');
      setPasswords({ current: '', newPass: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally { setChangingPw(false); }
  };

  const sendForgotPassword = async () => {
    if (!forgotEmail) return;
    try {
      const res = await api.post('/auth/forgot-password', { email: forgotEmail });
      setResetSent(true);
      if (res.data.resetToken) {
        setResetToken(res.data.resetToken);
      }
      toast.success('Reset instructions sent');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send reset email');
    }
  };

  const doResetPassword = async () => {
    if (!resetToken || !newPwReset) return toast.error('Enter token and new password');
    if (newPwReset.length < 8) return toast.error('Password must be at least 8 characters');
    try {
      await api.post('/auth/reset-password', { token: resetToken, newPassword: newPwReset });
      toast.success('Password reset! Please log in again.');
      setResetSent(false); setResetToken(''); setNewPwReset('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reset failed — token may be expired');
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Password', icon: Lock },
    { id: 'reset', label: 'Reset Password', icon: Mail },
  ];

  const initials = (profile.name || user?.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <User size={24} color="#6366f1" /> Account Settings
        </h1>
        <p style={{ color: '#6b7280', margin: 0 }}>Manage your profile, security, and preferences</p>
      </div>

      {/* Role badge */}
      <div style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: profile.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 17 }}>{user?.name}</div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>{user?.email}</div>
          <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
            <span style={{ background: user?.role === 'admin' ? 'rgba(251,191,36,0.15)' : 'rgba(99,102,241,0.15)', color: user?.role === 'admin' ? '#fbbf24' : '#818cf8', fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              {user?.role === 'admin' && <Crown size={10} />}
              {user?.role === 'admin' ? 'Administrator' : 'Analyst'}
            </span>
            {user?.email_verified && (
              <span style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={10} /> Verified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s', background: activeTab === t.id ? 'rgba(99,102,241,0.2)' : 'transparent', color: activeTab === t.id ? '#a5b4fc' : '#6b7280' }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* PROFILE TAB */}
      {activeTab === 'profile' && (
        <div style={card}>
          <h3 style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15, margin: '0 0 20px' }}>Profile Information</h3>

          <div style={{ marginBottom: 18 }}>
            <span style={label}>Display Name</span>
            <input style={input} value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="Your full name" />
          </div>

          <div style={{ marginBottom: 18 }}>
            <span style={label}>Email Address</span>
            <div style={{ position: 'relative' }}>
              <input style={{ ...input, color: '#6b7280', cursor: 'not-allowed' }} value={user?.email} readOnly />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontSize: 11 }}>Cannot be changed</span>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <span style={label}>Bio</span>
            <textarea style={{ ...input, height: 80, resize: 'vertical' }} value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} placeholder="A short bio about yourself…" />
          </div>

          <div style={{ marginBottom: 24 }}>
            <span style={label}>Avatar Color</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {AVATAR_COLORS.map(color => (
                <button key={color} onClick={() => setProfile(p => ({ ...p, avatar_color: color }))}
                  style={{ width: 36, height: 36, borderRadius: '50%', background: color, border: profile.avatar_color === color ? '3px solid #fff' : '3px solid transparent', cursor: 'pointer', outline: profile.avatar_color === color ? `2px solid ${color}` : 'none', transition: 'all 0.15s' }}>
                  {profile.avatar_color === color && <span style={{ color: '#fff', fontSize: 16 }}>✓</span>}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: profile.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: '#fff' }}>{initials}</div>
              <span style={{ color: '#6b7280', fontSize: 13 }}>Preview of your avatar</span>
            </div>
          </div>

          <button onClick={saveProfile} disabled={saving} style={btn()}>
            <Save size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      )}

      {/* PASSWORD TAB */}
      {activeTab === 'security' && (
        <div style={card}>
          <h3 style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15, margin: '0 0 6px' }}>Change Password</h3>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 20px' }}>Your new password must be at least 8 characters.</p>

          {['current', 'newPass', 'confirm'].map((field, i) => (
            <div key={field} style={{ marginBottom: 16 }}>
              <span style={label}>{['Current Password', 'New Password', 'Confirm New Password'][i]}</span>
              <div style={{ position: 'relative' }}>
                <input type={showPw[field] ? 'text' : 'password'} style={{ ...input, paddingRight: 44 }}
                  value={passwords[field]} onChange={e => setPasswords(p => ({ ...p, [field]: e.target.value }))}
                  placeholder={['Enter current password', 'Enter new password', 'Confirm new password'][i]} />
                <button onClick={() => setShowPw(p => ({ ...p, [field]: !p[field] }))}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                  {showPw[field] ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          ))}

          {passwords.newPass && passwords.confirm && passwords.newPass !== passwords.confirm && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
              <AlertCircle size={14} /> Passwords do not match
            </div>
          )}
          {passwords.newPass && passwords.confirm && passwords.newPass === passwords.confirm && passwords.newPass.length >= 8 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontSize: 13, marginBottom: 12 }}>
              <CheckCircle2 size={14} /> Passwords match
            </div>
          )}

          <button onClick={changePassword} disabled={changingPw} style={btn()}>
            <Lock size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {changingPw ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      )}

      {/* RESET PASSWORD TAB */}
      {activeTab === 'reset' && (
        <div style={card}>
          <h3 style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15, margin: '0 0 6px' }}>Reset Password</h3>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 20px' }}>
            Request a reset link. In production this sends an email — in demo mode the token is shown directly below.
          </p>

          <div style={{ marginBottom: 16 }}>
            <span style={label}>Email Address</span>
            <input style={input} value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="your@email.com" type="email" />
          </div>
          <button onClick={sendForgotPassword} style={{ ...btn('secondary'), marginBottom: 20 }}>
            <Mail size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Send Reset Link
          </button>

          {resetSent && (
            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ color: '#10b981', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Reset link generated!</div>
              {resetToken ? (
                <>
                  <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 8 }}>Demo mode — token shown here (in production this would be emailed):</div>
                  <div style={{ background: '#0d0d1a', borderRadius: 6, padding: '8px 12px', color: '#a5b4fc', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{resetToken}</div>
                </>
              ) : (
                <div style={{ color: '#6b7280', fontSize: 13 }}>Check your email for the reset link.</div>
              )}
            </div>
          )}

          {resetSent && (
            <>
              <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Enter Reset Token + New Password</div>
              <div style={{ marginBottom: 12 }}>
                <span style={label}>Reset Token</span>
                <input style={input} value={resetToken} onChange={e => setResetToken(e.target.value)} placeholder="Paste token here" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <span style={label}>New Password</span>
                <input type="password" style={input} value={newPwReset} onChange={e => setNewPwReset(e.target.value)} placeholder="Minimum 8 characters" />
              </div>
              <button onClick={doResetPassword} style={btn()}>
                <Shield size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Reset Password
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
