import { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Building2, Plus, Users, Trash2, Settings, Crown, UserPlus, Shield } from 'lucide-react';

const PLAN_COLORS = { free: '#6b7280', pro: '#6366f1', enterprise: '#f59e0b' };

export default function Workspaces() {
  const [workspaces, setWorkspaces] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ name: '', plan: 'free' });
  const [invite, setInvite] = useState({ email: '', role: 'member' });

  useEffect(() => { load(); }, []);

  const load = async () => { try { const r = await api.get('/workspaces'); setWorkspaces(r.data); } catch {} };
  const loadDetail = async (id) => { try { const r = await api.get(`/workspaces/${id}`); setDetail(r.data); } catch {} };

  const create = async () => {
    if (!form.name) return toast.error('Name required');
    try { await api.post('/workspaces', form); toast.success('Workspace created'); setShowCreate(false); setForm({ name: '', plan: 'free' }); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const inviteMember = async () => {
    if (!invite.email) return toast.error('Email required');
    try { await api.post(`/workspaces/${selected.id}/members`, invite); toast.success('Member invited'); setShowInvite(false); loadDetail(selected.id); }
    catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const removeMember = async (userId) => {
    try { await api.delete(`/workspaces/${selected.id}/members/${userId}`); loadDetail(selected.id); toast.success('Member removed'); }
    catch (e) { toast.error('Failed'); }
  };

  const del = async (id) => {
    if (!confirm('Delete this workspace?')) return;
    try { await api.delete(`/workspaces/${id}`); load(); if (selected?.id === id) { setSelected(null); setDetail(null); } toast.success('Deleted'); }
    catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}><Building2 size={26} color="#6366f1" /> Workspaces</h1>
          <p style={{ color: '#9ca3af', margin: 0 }}>Organize your team's data work into isolated workspaces</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> New Workspace
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', gap: 20 }}>
        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {workspaces.length === 0 ? (
            <div style={{ background: '#13131f', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 12, padding: 48, textAlign: 'center' }}>
              <Building2 size={48} color="#374151" style={{ margin: '0 auto 16px', display: 'block' }} />
              <p style={{ color: '#6b7280', margin: '0 0 16px' }}>No workspaces yet</p>
              <button onClick={() => setShowCreate(true)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontWeight: 600 }}>Create First Workspace</button>
            </div>
          ) : workspaces.map(ws => (
            <div key={ws.id} onClick={() => { setSelected(ws); loadDetail(ws.id); }}
              style={{ background: '#13131f', border: `1px solid ${selected?.id === ws.id ? '#6366f1' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: 18, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'white' }}>
                    {ws.name[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15 }}>{ws.name}</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>@{ws.slug?.slice(0, 20)}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <span style={{ background: `${PLAN_COLORS[ws.plan]}22`, color: PLAN_COLORS[ws.plan], fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, textTransform: 'uppercase' }}>{ws.plan}</span>
                      <span style={{ color: '#4b5563', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}><Users size={11} /> {ws.member_count} members</span>
                    </div>
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); del(ws.id); }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4, borderRadius: 6 }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        {selected && detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h2 style={{ color: '#f3f4f6', fontWeight: 700, margin: '0 0 4px', fontSize: 20 }}>{detail.name}</h2>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>Created {new Date(detail.created_at).toLocaleDateString()}</div>
                </div>
                <span style={{ background: `${PLAN_COLORS[detail.plan]}22`, color: PLAN_COLORS[detail.plan], padding: '4px 14px', borderRadius: 20, fontWeight: 700, textTransform: 'uppercase', fontSize: 12 }}>{detail.plan}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {[{ label: 'Members', value: detail.members?.length || 0, icon: Users }, { label: 'Plan', value: detail.plan, icon: Shield }, { label: 'Owner', value: detail.owner_name, icon: Crown }].map(({ label, value, icon: Icon }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                    <Icon size={18} color="#6366f1" style={{ margin: '0 auto 6px', display: 'block' }} />
                    <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 16 }}>{value}</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#f3f4f6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={16} color="#6366f1" /> Members ({detail.members?.length})</span>
                <button onClick={() => setShowInvite(true)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserPlus size={13} /> Invite
                </button>
              </div>
              {detail.members?.map(m => (
                <div key={m.user_id} style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>{m.name?.[0]?.toUpperCase()}</div>
                    <div>
                      <div style={{ color: '#e2e8f0', fontWeight: 500 }}>{m.name}</div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>{m.email}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{m.role}</span>
                    {m.role !== 'owner' && <button onClick={() => removeMember(m.user_id)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><Trash2 size={13} /></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCreate(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: 460, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f3f4f6', marginTop: 0, marginBottom: 20 }}>Create Workspace</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>WORKSPACE NAME</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sales Analytics Team"
                  style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }} /></div>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>PLAN</label>
                <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                  style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                  <option value="free">Free</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option>
                </select></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={create} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowInvite(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: 420, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f3f4f6', marginTop: 0, marginBottom: 20 }}>Invite Member</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>EMAIL</label>
                <input value={invite.email} onChange={e => setInvite(i => ({ ...i, email: e.target.value }))} placeholder="user@company.com"
                  style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }} /></div>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>ROLE</label>
                <select value={invite.role} onChange={e => setInvite(i => ({ ...i, role: e.target.value }))}
                  style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                  <option value="member">Member</option><option value="analyst">Analyst</option><option value="admin">Admin</option>
                </select></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInvite(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={inviteMember} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Invite</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
