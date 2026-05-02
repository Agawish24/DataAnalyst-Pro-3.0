import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useData } from '../context/DataContext';
import toast from 'react-hot-toast';
import { Upload, FileSpreadsheet, Trash2, Eye, Download, CheckCircle2, XCircle } from 'lucide-react';
import api from '../api/client';

export default function DataImport() {
  const { datasets, fetchDatasets, uploadDataset, deleteDataset, selectDataset } = useData();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [customName, setCustomName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => { fetchDatasets(); }, []);

  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0) {
      setSelectedFile(accepted[0]);
      setCustomName(accepted[0].name.replace(/\.[^.]+$/, ''));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'], 'application/json': ['.json'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setProgress(0);
    try {
      const dataset = await uploadDataset(selectedFile, customName);
      toast.success(`"${dataset.name}" uploaded — ${dataset.row_count?.toLocaleString()} rows`);
      setSelectedFile(null);
      setCustomName('');
      setProgress(100);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async (ds) => {
    try {
      const res = await api.get(`/datasets/${ds.id}`);
      setPreview(res.data);
    } catch {
      toast.error('Failed to load preview');
    }
  };

  const handleDelete = async (ds) => {
    if (!confirm(`Delete "${ds.name}"? This cannot be undone.`)) return;
    try {
      await deleteDataset(ds.id);
      toast.success('Dataset deleted');
      if (preview?.id === ds.id) setPreview(null);
    } catch { toast.error('Delete failed'); }
  };

  const handleExport = (type, ds) => {
    const token = localStorage.getItem('token');
    const a = document.createElement('a');
    a.href = `/api/export/dataset/${ds.id}/${type}`;
    a.download = `${ds.name}.${type}`;
    document.body.appendChild(a);
    fetch(a.href, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        a.href = url; a.click(); URL.revokeObjectURL(url);
      });
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Data Import</h2>
        <p className="text-muted">Upload CSV, Excel, or JSON files for analysis</p>
      </div>

      <div className="two-col-grid">
        {/* Upload Panel */}
        <div className="card">
          <h3 className="card-title">Upload Dataset</h3>
          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'drag-active' : ''} ${selectedFile ? 'has-file' : ''}`}>
            <input {...getInputProps()} />
            {selectedFile ? (
              <div className="dropzone-file">
                <FileSpreadsheet size={40} className="text-primary" />
                <div className="file-name">{selectedFile.name}</div>
                <div className="file-size">{(selectedFile.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <div className="dropzone-placeholder">
                <Upload size={40} />
                <p>{isDragActive ? 'Drop the file here...' : 'Drag & drop a file here, or click to select'}</p>
                <p className="text-muted">Supports CSV, Excel (.xlsx/.xls), JSON · Max 50MB</p>
              </div>
            )}
          </div>

          {selectedFile && (
            <div className="upload-form">
              <div className="form-group">
                <label>Dataset Name</label>
                <input type="text" value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Enter a name..." />
              </div>
              <div className="upload-actions">
                <button className="btn btn-secondary" onClick={() => { setSelectedFile(null); setCustomName(''); }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                  {uploading ? 'Uploading...' : 'Upload Dataset'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Datasets List */}
        <div className="card">
          <h3 className="card-title">Uploaded Datasets ({datasets.length})</h3>
          {datasets.length === 0 ? (
            <div className="empty-state">
              <Upload size={40} />
              <p>No datasets uploaded yet</p>
            </div>
          ) : (
            <div className="datasets-list">
              {datasets.map(ds => (
                <div key={ds.id} className={`dataset-row ${preview?.id === ds.id ? 'selected' : ''}`}>
                  <div className="dataset-row-icon">
                    <FileSpreadsheet size={20} />
                  </div>
                  <div className="dataset-row-info" onClick={() => handlePreview(ds)}>
                    <div className="dataset-row-name">{ds.name}</div>
                    <div className="dataset-row-meta">
                      {ds.row_count?.toLocaleString()} rows · {ds.column_count} cols · {ds.source}
                    </div>
                  </div>
                  <div className="dataset-row-actions">
                    <button className="icon-btn" title="Preview" onClick={() => handlePreview(ds)}><Eye size={16} /></button>
                    <button className="icon-btn" title="Export CSV" onClick={() => handleExport('csv', ds)}><Download size={16} /></button>
                    <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(ds)}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="card mt-4">
          <div className="card-header">
            <h3 className="card-title">Preview: {preview.name}</h3>
            <div className="card-meta">
              {preview.row_count?.toLocaleString()} rows · {preview.column_count} columns · uploaded {new Date(preview.created_at).toLocaleDateString()}
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {preview.schema?.map(col => (
                    <th key={col.name}>
                      <div>{col.name}</div>
                      <span className={`type-badge ${col.type}`}>{col.type}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview?.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    {preview.schema?.map(col => (
                      <td key={col.name}>{String(row[col.name] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
