import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { GitBranch, RotateCcw, Camera, GitCompare, Clock, Rows, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function VersionControl() {
  const { selectedDataset } = useData();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [comparingV1, setComparingV1] = useState('');
  const [comparingV2, setComparingV2] = useState('');
  const [comparison, setComparison] = useState(null);
  const [rollingBack, setRollingBack] = useState(null);

  const load = async () => {
    if (!selectedDataset) return;
    setLoading(true);
    try { setVersions(await api.get(`/versions/${selectedDataset.id}`)); }
    catch { toast.error('Failed to load versions'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [selectedDataset]);

  const createSnapshot = async () => {
    if (!selectedDataset) return;
    setCreating(true);
    try {
      await api.post(`/versions/${selectedDataset.id}/snapshot`, { summary: snapshotNote || undefined });
      toast.success('Snapshot created');
      setSnapshotNote('');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to create snapshot'); }
    finally { setCreating(false); }
  };

  const rollback = async (versionId, versionNum) => {
    if (!confirm(`Roll back to Version ${versionNum}? This will overwrite current data.`)) return;
    setRollingBack(versionId);
    try {
      await api.post(`/versions/${selectedDataset.id}/rollback/${versionId}`);
      toast.success(`Rolled back to Version ${versionNum}`);
      load();
    } catch { toast.error('Rollback failed'); }
    finally { setRollingBack(null); }
  };

  const compare = async () => {
    if (!comparingV1 || !comparingV2) return toast.error('Select two versions to compare');
    try {
      const res = await api.get(`/versions/${selectedDataset.id}/compare/${comparingV1}/${comparingV2}`);
      setComparison(res);
    } catch { toast.error('Comparison failed'); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4 }}>Version Control</h1>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>Track dataset changes, rollback to previous versions, and compare differences</p>
      </div>

      {!selectedDataset ? (
        <div style={{ textAlign: 'center', padding: 64, color: '#6b7280' }}>
          <GitBranch size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p>Select a dataset to manage its versions</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
          {/* Timeline */}
          <div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <GitBranch size={16} color="#6366f1" /> {selectedDataset.name} — Version History
              </div>
              {loading ? <p style={{ color: '#6b7280', textAlign: 'center', padding: 20 }}>Loading...</p> :
                versions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 30, color: '#4b5563' }}>
                    <Clock size={32} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                    <p style={{ fontSize: 14 }}>No versions saved yet. Create a snapshot to start tracking.</p>
                  </div>
                ) : (
                  <div>
                    {versions.map((v, i) => (
                      <div key={v.id} style={{ position: 'relative', paddingLeft: 32, paddingBottom: i < versions.length - 1 ? 20 : 0 }}>
                        {i < versions.length - 1 && <div style={{ position: 'absolute', left: 11, top: 24, width: 2, height: 'calc(100% - 8px)', background: 'rgba(255,255,255,0.08)' }} />}
                        <div style={{ position: 'absolute', left: 0, top: 8, width: 24, height: 24, borderRadius: '50%', background: i === 0 ? '#6366f1' : 'rgba(255,255,255,0.1)', border: `2px solid ${i === 0 ? '#6366f1' : 'rgba(255,255,255,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: i === 0 ? '#fff' : '#6b7280', fontSize: 10, fontWeight: 700 }}>{v.version_number}</span>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${i === 0 ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, padding: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ color: i === 0 ? '#a5b4fc' : '#d1d5db', fontWeight: 600, fontSize: 14 }}>
                                v{v.version_number} {i === 0 && <span style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontSize: 10, padding: '2px 8px', borderRadius: 10, marginLeft: 6 }}>LATEST</span>}
                              </div>
                              {v.change_summary && <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>{v.change_summary}</div>}
                              <div style={{ color: '#4b5563', fontSize: 12, marginTop: 4, display: 'flex', gap: 12 }}>
                                <span><Rows size={10} style={{ display: 'inline', marginRight: 4 }} />{(v.row_count || 0).toLocaleString()} rows</span>
                                <span><Clock size={10} style={{ display: 'inline', marginRight: 4 }} />{new Date(v.created_at).toLocaleString()}</span>
                                {v.creator_name && <span>by {v.creator_name}</span>}
                              </div>
                            </div>
                            {i > 0 && (
                              <button onClick={() => rollback(v.id, v.version_number)} disabled={!!rollingBack}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, color: '#fbbf24', cursor: 'pointer', fontSize: 12, opacity: rollingBack ? 0.5 : 1 }}>
                                <RotateCcw size={12} /> {rollingBack === v.id ? 'Rolling back...' : 'Rollback'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Compare */}
            {versions.length >= 2 && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
                <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <GitCompare size={16} color="#8b5cf6" /> Compare Versions
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                  <select value={comparingV1} onChange={e => setComparingV1(e.target.value)} style={{ flex: 1, padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
                    <option value="">Base version</option>
                    {versions.map(v => <option key={v.id} value={v.version_number}>v{v.version_number} — {v.change_summary || new Date(v.created_at).toLocaleDateString()}</option>)}
                  </select>
                  <span style={{ color: '#6b7280' }}>vs</span>
                  <select value={comparingV2} onChange={e => setComparingV2(e.target.value)} style={{ flex: 1, padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
                    <option value="">Compare with</option>
                    {versions.map(v => <option key={v.id} value={v.version_number}>v{v.version_number} — {v.change_summary || new Date(v.created_at).toLocaleDateString()}</option>)}
                  </select>
                  <button onClick={compare} style={{ padding: '9px 16px', background: '#8b5cf6', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Compare</button>
                </div>
                {comparison && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      {[['version1', 'v' + comparison.version1.version_number], ['version2', 'v' + comparison.version2.version_number]].map(([key, label]) => (
                        <div key={key} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12 }}>
                          <div style={{ color: '#a5b4fc', fontWeight: 600, marginBottom: 6 }}>{label}</div>
                          <div style={{ color: '#9ca3af', fontSize: 13 }}>{comparison[key].rowCount?.toLocaleString()} rows</div>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>{comparison[key].change_summary}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: comparison.rowDiff === 0 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', borderRadius: 8 }}>
                      <AlertTriangle size={14} color={comparison.rowDiff !== 0 ? '#f59e0b' : '#10b981'} />
                      <span style={{ color: comparison.rowDiff !== 0 ? '#fbbf24' : '#34d399', fontSize: 14 }}>
                        Row difference: {comparison.rowDiff > 0 ? '+' : ''}{comparison.rowDiff} rows
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Snapshot Panel */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
            <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Camera size={16} color="#10b981" /> Create Snapshot
            </div>
            <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 14 }}>Save the current state of <strong style={{ color: '#d1d5db' }}>{selectedDataset.name}</strong> as a restore point.</p>
            <input value={snapshotNote} onChange={e => setSnapshotNote(e.target.value)} placeholder="Describe this snapshot (optional)"
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }} />
            <button onClick={createSnapshot} disabled={creating}
              style={{ width: '100%', padding: 12, background: creating ? 'rgba(16,185,129,0.3)' : '#10b981', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Camera size={14} /> {creating ? 'Creating...' : 'Create Snapshot'}
            </button>
            <div style={{ marginTop: 14, padding: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8 }}>
              <div style={{ color: '#fbbf24', fontSize: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} /> Tip</div>
              <div style={{ color: '#9ca3af', fontSize: 12 }}>Create a snapshot before applying cleaning operations or recipes so you can revert if needed.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
