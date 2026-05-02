import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import { FileText, Plus, Trash2, Download, RefreshCw, Sparkles, BarChart3, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

const Section = ({ title, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.04)', cursor: 'pointer' }}>
        <span style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>{title}</span>
        {open ? <ChevronUp size={14} color="#6b7280" /> : <ChevronDown size={14} color="#6b7280" />}
      </div>
      {open && <div style={{ padding: 16 }}>{children}</div>}
    </div>
  );
};

export default function Reports() {
  const { selectedDataset, datasets } = useData();
  const [reports, setReports] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', dataset_id: '', report_type: 'summary', include_sections: ['overview', 'quality', 'statistics', 'correlation'] });
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(null);

  const SECTIONS = ['overview', 'quality', 'statistics', 'correlation', 'sample'];

  const load = async () => {
    try { setReports(await api.get('/reports')); } catch {}
  };

  useEffect(() => { load(); if (selectedDataset) setForm(f => ({...f, dataset_id: String(selectedDataset.id), name: `${selectedDataset.name} Report`})); }, [selectedDataset]);

  const generate = async () => {
    if (!form.name.trim()) return toast.error('Report name required');
    setGenerating(true);
    try {
      const res = await api.post('/reports/generate', form);
      toast.success('Report generated with AI narrative');
      setShowCreate(false);
      load();
      setSelected(res);
    } catch { toast.error('Failed to generate report'); }
    finally { setGenerating(false); }
  };

  const del = async (id) => {
    if (!confirm('Delete this report?')) return;
    try { await api.delete(`/reports/${id}`); toast.success('Deleted'); load(); if (selected?.id === id) setSelected(null); } catch {}
  };

  const downloadReport = (report) => {
    const content = `# ${report.name}\n\nGenerated: ${new Date(report.created_at).toLocaleString()}\nDataset: ${report.dataset_name || '—'}\n\n${report.ai_narrative || ''}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${report.name}.txt`; a.click();
  };

  const toggleSection = (s) => setForm(f => ({
    ...f,
    include_sections: f.include_sections.includes(s) ? f.include_sections.filter(x => x !== s) : [...f.include_sections, s]
  }));

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6', marginBottom: 4 }}>Reports</h1>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Auto-generate data reports with AI-written narrative summaries</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
          <Plus size={14} /> Generate Report
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '280px 1fr' : '1fr', gap: 20 }}>
        {/* Left: list + create */}
        <div>
          {showCreate && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={16} color="#6366f1" /> New Report</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Report Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                    style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 4 }}>Dataset</label>
                  <select value={form.dataset_id} onChange={e => setForm(f => ({...f, dataset_id: e.target.value}))}
                    style={{ width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14 }}>
                    <option value="">— Select Dataset —</option>
                    {(datasets || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>Include Sections</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {SECTIONS.map(s => (
                      <button key={s} onClick={() => toggleSection(s)}
                        style={{ padding: '5px 12px', border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: 12, background: form.include_sections.includes(s) ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)', color: form.include_sections.includes(s) ? '#a5b4fc' : '#6b7280' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={generate} disabled={generating}
                    style={{ flex: 2, padding: '10px', background: generating ? 'rgba(99,102,241,0.4)' : '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {generating ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</> : <><Sparkles size={13} /> Generate</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Reports list */}
          {reports.map(r => (
            <div key={r.id} onClick={() => setSelected(r)} style={{ background: selected?.id === r.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selected?.id === r.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: 16, marginBottom: 8, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <FileText size={14} color="#6366f1" />
                  <span style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={e => { e.stopPropagation(); downloadReport(r); }} style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, color: '#9ca3af', cursor: 'pointer' }}><Download size={12} /></button>
                  <button onClick={e => { e.stopPropagation(); del(r.id); }} style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 6, color: '#f87171', cursor: 'pointer' }}><Trash2 size={12} /></button>
                </div>
              </div>
              <div style={{ color: '#6b7280', fontSize: 12, display: 'flex', gap: 8 }}>
                <span>{r.dataset_name || '—'}</span>
                <span>·</span>
                <span>{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
          {reports.length === 0 && !showCreate && (
            <div style={{ textAlign: 'center', padding: 40, color: '#4b5563' }}>
              <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontSize: 14 }}>No reports yet. Generate your first one.</p>
            </div>
          )}
        </div>

        {/* Report Detail */}
        {selected && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 20, marginBottom: 4 }}>{selected.name}</h2>
                <div style={{ color: '#6b7280', fontSize: 13, display: 'flex', gap: 12 }}>
                  <span><Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />{new Date(selected.created_at).toLocaleString()}</span>
                  {selected.dataset_name && <span><BarChart3 size={12} style={{ display: 'inline', marginRight: 4 }} />{selected.dataset_name}</span>}
                </div>
              </div>
              <button onClick={() => downloadReport(selected)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', fontSize: 13 }}>
                <Download size={13} /> Download
              </button>
            </div>

            {selected.ai_narrative && (
              <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: '#a5b4fc', fontWeight: 600, fontSize: 13 }}>
                  <Sparkles size={14} /> AI-Generated Narrative
                </div>
                <div style={{ color: '#d1d5db', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {selected.ai_narrative.replace(/##\s/g, '').replace(/\*\*(.*?)\*\*/g, '$1')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
