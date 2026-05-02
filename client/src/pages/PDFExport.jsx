import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { FileText, Download, Eye, RefreshCw, Sparkles, BarChart2 } from 'lucide-react';

export default function PDFExport() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [reports, setReports] = useState([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => { fetchDatasets(); loadReports(); }, []);
  useEffect(() => { if (activeDataset) setTitle(`${activeDataset.name} — Analytics Report`); }, [activeDataset]);

  const loadReports = async () => { try { const r = await api.get('/reports'); setReports(r.data); } catch {} };

  const generateDatasetReport = async (format = 'html') => {
    if (!activeDataset) return toast.error('Select a dataset first');
    setLoading(true);
    try {
      const r = await api.post(`/pdf/dataset/${activeDataset.id}`, { title: title || `${activeDataset.name} Report`, format });
      if (format === 'html') {
        const blob = new Blob([r.data], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${activeDataset.name}-report.html`; a.click();
        URL.revokeObjectURL(url);
        toast.success('Report downloaded');
      } else {
        setPreview(r.data.html);
        toast.success('Preview generated');
      }
    } catch (e) { toast.error(e.response?.data?.error || 'Generation failed'); }
    finally { setLoading(false); }
  };

  const downloadReport = async (report) => {
    try {
      const r = await api.get(`/pdf/report/${report.id}`, { responseType: 'text' });
      const blob = new Blob([r.data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${report.name}.html`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Downloaded');
    } catch (e) { toast.error('Download failed'); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}><FileText size={26} color="#f59e0b" /> Report Export</h1>
        <p style={{ color: '#9ca3af', margin: 0 }}>Generate professional HTML reports with statistics, AI narratives, and column summaries</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
        {/* Config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 }}>
            <div style={{ color: '#f3f4f6', fontWeight: 700, marginBottom: 16 }}>Generate Dataset Report</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>DATASET</label>
                <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))}
                  style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                  <option value="">Select...</option>{datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>REPORT TITLE</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Report title..."
                  style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button onClick={() => generateDatasetReport('preview')} disabled={loading || !activeDataset}
                  style={{ padding: '10px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#9ca3af', cursor: loading || !activeDataset ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
                  <Eye size={14} /> Preview
                </button>
                <button onClick={() => generateDatasetReport('html')} disabled={loading || !activeDataset}
                  style={{ padding: '10px 0', borderRadius: 8, border: 'none', background: loading || !activeDataset ? '#374151' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', cursor: loading || !activeDataset ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
                  {loading ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />} Download
                </button>
              </div>
            </div>
          </div>

          {/* Report contents info */}
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
            <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 14 }}>Report Contents</div>
            {[
              { icon: BarChart2, label: 'KPI Summary', desc: 'Row count, columns, missing values', color: '#6366f1' },
              { icon: Sparkles, label: 'AI Narrative', desc: 'AI-generated analysis if available', color: '#8b5cf6' },
              { icon: FileText, label: 'Numeric Stats', desc: 'Mean, median, std dev, min/max', color: '#10b981' },
              { icon: FileText, label: 'Categorical Summary', desc: 'Unique values, top categories', color: '#f59e0b' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                <item.icon size={15} color={item.color} style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{item.label}</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Saved reports */}
          {reports.length > 0 && (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontWeight: 600 }}>Saved Reports</div>
              {reports.slice(0, 8).map(r => (
                <div key={r.id} style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                    <div style={{ color: '#6b7280', fontSize: 11 }}>{new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => downloadReport(r)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.05)', color: '#f59e0b', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Download size={11} /> Export
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview panel */}
        <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', minHeight: 500 }}>
          {preview ? (
            <>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#f3f4f6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><Eye size={16} color="#f59e0b" /> Report Preview</span>
                <button onClick={() => generateDatasetReport('html')} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#f59e0b', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Download size={13} /> Download HTML
                </button>
              </div>
              <iframe srcDoc={preview} style={{ width: '100%', height: 600, border: 'none', background: '#f9fafb' }} title="Report Preview" />
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, minHeight: 500 }}>
              <FileText size={60} color="#374151" />
              <p style={{ color: '#6b7280', fontSize: 15 }}>Click Preview to see your report here</p>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
