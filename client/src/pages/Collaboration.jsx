import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { MessageSquare, Tag, Share2, Send, Trash2, CheckCircle, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

const timeAgo = (dt) => {
  const secs = Math.floor((Date.now() - new Date(dt)) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return new Date(dt).toLocaleDateString();
};

const Avatar = ({ name, size = 28 }) => {
  const colors = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444'];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  return <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>{name?.[0]?.toUpperCase() || '?'}</div>;
};

export default function Collaboration() {
  const { selectedDataset, datasets } = useData();
  const [activeTab, setActiveTab] = useState('comments');
  const [comments, setComments] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState('read');
  const [shareTarget, setShareTarget] = useState({ type: 'dataset', id: '' });
  const [newAnnotation, setNewAnnotation] = useState({ column_name: '', content: '', annotation_type: 'note' });
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);

  const dsId = selectedDataset?.id;

  const loadComments = async () => {
    if (!dsId) return;
    try { setComments((await api.get(`/collaboration/comments/dataset/${dsId}`)).data); } catch {}
  };

  const loadAnnotations = async () => {
    if (!dsId) return;
    try { setAnnotations((await api.get(`/collaboration/annotations/${dsId}`)).data); } catch {}
  };

  useEffect(() => { loadComments(); loadAnnotations(); }, [dsId]);

  const postComment = async (parentId = null) => {
    const content = parentId ? replyText : newComment;
    if (!content.trim() || !dsId) return;
    try {
      const c = await api.post('/collaboration/comments', { target_type: 'dataset', target_id: dsId, content, parent_id: parentId || undefined });
      if (parentId) {
        setComments(prev => prev.map(cm => cm.id === parentId ? { ...cm, replies: [...(cm.replies || []), c] } : cm));
        setReplyingTo(null); setReplyText('');
      } else {
        setComments(prev => [...prev, c]);
        setNewComment('');
      }
    } catch { toast.error('Failed to post'); }
  };

  const deleteComment = async (id) => {
    try { await api.delete(`/collaboration/comments/${id}`); loadComments(); } catch { toast.error('Failed to delete'); }
  };

  const resolveComment = async (id, resolved) => {
    try { await api.put(`/collaboration/comments/${id}`, { resolved }); loadComments(); } catch {}
  };

  const addAnnotation = async () => {
    if (!newAnnotation.content.trim() || !dsId) return;
    try {
      await api.post('/collaboration/annotations', { ...newAnnotation, dataset_id: dsId });
      toast.success('Annotation added');
      setShowAnnotationForm(false);
      setNewAnnotation({ column_name: '', content: '', annotation_type: 'note' });
      loadAnnotations();
    } catch { toast.error('Failed to add annotation'); }
  };

  const share = async () => {
    if (!shareEmail.trim()) return;
    try {
      await api.post('/collaboration/share', { resource_type: shareTarget.type, resource_id: shareTarget.id || dsId, shared_with_email: shareEmail, permission: sharePermission });
      toast.success(`Shared with ${shareEmail}`);
      setShareEmail('');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to share'); }
  };

  const ANNOTATION_COLORS = { note: '#6366f1', warning: '#f59e0b', error: '#ef4444', insight: '#10b981' };

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4 }}>Collaboration</h1>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>Comments, annotations, and sharing for datasets and dashboards</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4 }}>
        {[['comments', 'Comments', MessageSquare], ['annotations', 'Annotations', Tag], ['sharing', 'Sharing', Share2]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: activeTab === id ? '#6366f1' : 'transparent', color: activeTab === id ? '#fff' : '#9ca3af' }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {!selectedDataset && activeTab !== 'sharing' && (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
          <MessageSquare size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <p>Select a dataset to view collaboration activity</p>
        </div>
      )}

      {/* Comments */}
      {activeTab === 'comments' && selectedDataset && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder={`Add a comment on "${selectedDataset.name}"...`} rows={3}
                style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#f3f4f6', fontSize: 14, resize: 'vertical' }}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) postComment(); }} />
              <button onClick={() => postComment()} disabled={!newComment.trim()}
                style={{ padding: '0 18px', background: '#6366f1', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', opacity: !newComment.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Send size={14} /> Post
              </button>
            </div>
            <div style={{ color: '#4b5563', fontSize: 12, marginTop: 6 }}>Ctrl+Enter to submit</div>
          </div>

          {comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#4b5563' }}>No comments yet. Be the first!</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {comments.map(c => (
                <div key={c.id} style={{ background: c.resolved ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.04)', border: `1px solid ${c.resolved ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: 16, opacity: c.resolved ? 0.7 : 1 }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                    <Avatar name={c.user_name} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>{c.user_name}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: '#4b5563', fontSize: 12 }}>{timeAgo(c.created_at)}</span>
                          {c.resolved && <span style={{ color: '#10b981', fontSize: 11 }}>✓ Resolved</span>}
                          <button onClick={() => resolveComment(c.id, !c.resolved)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.resolved ? '#10b981' : '#6b7280', padding: 0 }}>
                            <CheckCircle size={14} />
                          </button>
                          <button onClick={() => deleteComment(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: 0 }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                      <p style={{ color: '#d1d5db', fontSize: 14, margin: '6px 0' }}>{c.content}</p>
                    </div>
                  </div>
                  {/* Replies */}
                  {(c.replies || []).map(r => (
                    <div key={r.id} style={{ marginLeft: 38, marginTop: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, display: 'flex', gap: 8 }}>
                      <Avatar name={r.user_name} size={22} />
                      <div>
                        <span style={{ color: '#a5b4fc', fontWeight: 600, fontSize: 13 }}>{r.user_name}</span>
                        <span style={{ color: '#4b5563', fontSize: 11, marginLeft: 8 }}>{timeAgo(r.created_at)}</span>
                        <p style={{ color: '#d1d5db', fontSize: 13, margin: '4px 0 0' }}>{r.content}</p>
                      </div>
                    </div>
                  ))}
                  {replyingTo === c.id ? (
                    <div style={{ marginLeft: 38, marginTop: 8, display: 'flex', gap: 8 }}>
                      <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Write a reply..." autoFocus
                        style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 13 }}
                        onKeyDown={e => e.key === 'Enter' && postComment(c.id)} />
                      <button onClick={() => postComment(c.id)} style={{ padding: '8px 14px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13 }}>Reply</button>
                      <button onClick={() => setReplyingTo(null)} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setReplyingTo(c.id)} style={{ marginLeft: 38, marginTop: 6, background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 12 }}>↩ Reply</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Annotations */}
      {activeTab === 'annotations' && selectedDataset && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowAnnotationForm(!showAnnotationForm)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
              <Plus size={14} /> Add Annotation
            </button>
          </div>
          {showAnnotationForm && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, marginBottom: 12 }}>
                <input value={newAnnotation.column_name} onChange={e => setNewAnnotation(a => ({...a, column_name: e.target.value}))} placeholder="Column name (optional)"
                  style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }} />
                <select value={newAnnotation.annotation_type} onChange={e => setNewAnnotation(a => ({...a, annotation_type: e.target.value}))}
                  style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', fontSize: 14 }}>
                  {['note', 'warning', 'error', 'insight'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input value={newAnnotation.content} onChange={e => setNewAnnotation(a => ({...a, content: e.target.value}))} placeholder="Annotation content..."
                  style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }} />
                <button onClick={addAnnotation} style={{ padding: '10px 18px', background: '#10b981', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          )}
          {annotations.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#4b5563' }}>No annotations yet</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {annotations.map(a => (
                <div key={a.id} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${ANNOTATION_COLORS[a.annotation_type] || '#6366f1'}30`, borderLeft: `3px solid ${ANNOTATION_COLORS[a.annotation_type] || '#6366f1'}`, borderRadius: '0 10px 10px 0', padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                      {a.column_name && <span style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>{a.column_name}</span>}
                      <span style={{ color: ANNOTATION_COLORS[a.annotation_type], fontSize: 12 }}>{a.annotation_type}</span>
                      <span style={{ color: '#4b5563', fontSize: 12 }}>{timeAgo(a.created_at)}</span>
                    </div>
                    <p style={{ color: '#d1d5db', fontSize: 14, margin: 0 }}>{a.content}</p>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>by {a.user_name}</span>
                  </div>
                  <button onClick={async () => { await api.delete(`/collaboration/annotations/${a.id}`); loadAnnotations(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563' }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sharing */}
      {activeTab === 'sharing' && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28 }}>
            <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 20 }}>Share Resource</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ color: '#9ca3af', fontSize: 13, display: 'block', marginBottom: 6 }}>Resource Type</label>
                <select value={shareTarget.type} onChange={e => setShareTarget(t => ({ ...t, type: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
                  <option value="dataset">Dataset</option>
                  <option value="dashboard">Dashboard</option>
                  <option value="report">Report</option>
                </select>
              </div>
              <div>
                <label style={{ color: '#9ca3af', fontSize: 13, display: 'block', marginBottom: 6 }}>User Email</label>
                <input value={shareEmail} onChange={e => setShareEmail(e.target.value)} placeholder="colleague@company.com"
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ color: '#9ca3af', fontSize: 13, display: 'block', marginBottom: 6 }}>Permission</label>
                <select value={sharePermission} onChange={e => setSharePermission(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
                  <option value="read">Read Only</option>
                  <option value="edit">Can Edit</option>
                  <option value="admin">Full Access</option>
                </select>
              </div>
              <button onClick={share} disabled={!shareEmail.trim()}
                style={{ padding: '12px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: !shareEmail.trim() ? 0.5 : 1 }}>
                Share Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ANNOTATION_COLORS = { note: '#6366f1', warning: '#f59e0b', error: '#ef4444', insight: '#10b981' };
