import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Plus, Trash2, Save, LayoutDashboard, Move, Eye, Edit3 } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend);

const WIDGET_TYPES = [
  { id: 'stat', label: 'Stat Card', icon: '📊' },
  { id: 'bar', label: 'Bar Chart', icon: '📊' },
  { id: 'line', label: 'Line Chart', icon: '📈' },
  { id: 'pie', label: 'Pie Chart', icon: '🥧' },
  { id: 'table', label: 'Data Table', icon: '📋' },
  { id: 'text', label: 'Text Block', icon: '📝' },
];

const COLORS = ['rgba(99,102,241,0.8)', 'rgba(139,92,246,0.8)', 'rgba(59,130,246,0.8)', 'rgba(6,182,212,0.8)', 'rgba(16,185,129,0.8)', 'rgba(245,158,11,0.8)', 'rgba(239,68,68,0.8)'];

const mockData = (type, title) => {
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const data = labels.map(() => Math.floor(Math.random() * 100) + 20);
  return { labels, datasets: [{ label: title, data, backgroundColor: COLORS, borderColor: COLORS, borderRadius: 6, tension: 0.4 }] };
};

export default function DashboardBuilder() {
  const [dashboards, setDashboards] = useState([]);
  const [activeDash, setActiveDash] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [editMode, setEditMode] = useState(true);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [newWidget, setNewWidget] = useState({ type: 'bar', title: 'My Chart', content: '', size: 'medium' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadDashboards(); }, []);

  const loadDashboards = async () => {
    try {
      const res = await api.get('/dashboards');
      setDashboards(res.data);
    } catch {}
  };

  const createDashboard = async () => {
    const name = prompt('Dashboard name:');
    if (!name) return;
    try {
      const res = await api.post('/dashboards', { name, widgets: [] });
      setDashboards(prev => [res.data, ...prev]);
      selectDashboard(res.data);
      toast.success('Dashboard created');
    } catch { toast.error('Failed to create'); }
  };

  const selectDashboard = (dash) => {
    setActiveDash(dash);
    setWidgets(dash.widgets || []);
  };

  const addWidget = () => {
    const widget = { id: Date.now(), ...newWidget, data: newWidget.type !== 'text' && newWidget.type !== 'stat' ? mockData(newWidget.type, newWidget.title) : null };
    setWidgets(prev => [...prev, widget]);
    setShowAddWidget(false);
    setNewWidget({ type: 'bar', title: 'My Chart', content: '', size: 'medium' });
  };

  const removeWidget = (id) => setWidgets(prev => prev.filter(w => w.id !== id));

  const saveDashboard = async () => {
    if (!activeDash) return;
    setSaving(true);
    try {
      await api.put(`/dashboards/${activeDash.id}`, { widgets });
      toast.success('Dashboard saved');
    } catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  const deleteDashboard = async (id) => {
    if (!confirm('Delete this dashboard?')) return;
    try {
      await api.delete(`/dashboards/${id}`);
      setDashboards(prev => prev.filter(d => d.id !== id));
      if (activeDash?.id === id) { setActiveDash(null); setWidgets([]); }
      toast.success('Deleted');
    } catch { toast.error('Delete failed'); }
  };

  const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } } };
  const pieOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#9ca3af' } } } };

  const renderWidget = (w) => {
    const sizeClass = { small: 'w-small', medium: 'w-medium', large: 'w-large', full: 'w-full' }[w.size] || 'w-medium';
    return (
      <div key={w.id} className={`dashboard-widget ${sizeClass}`}>
        <div className="widget-header">
          <span className="widget-title">{w.title}</span>
          {editMode && <button className="icon-btn danger" onClick={() => removeWidget(w.id)}><Trash2 size={14} /></button>}
        </div>
        <div className="widget-body">
          {w.type === 'text' && <p className="widget-text">{w.content || 'Text content here...'}</p>}
          {w.type === 'stat' && <div className="stat-widget"><div className="stat-big">{Math.floor(Math.random() * 10000).toLocaleString()}</div><div className="stat-label">{w.content || 'Total'}</div></div>}
          {w.type === 'bar' && w.data && <div style={{ height: '180px' }}><Bar data={w.data} options={chartOpts} /></div>}
          {w.type === 'line' && w.data && <div style={{ height: '180px' }}><Line data={w.data} options={chartOpts} /></div>}
          {w.type === 'pie' && w.data && <div style={{ height: '180px' }}><Pie data={w.data} options={pieOpts} /></div>}
          {w.type === 'table' && (
            <div className="table-scroll">
              <table className="data-table compact">
                <thead><tr><th>Column A</th><th>Column B</th><th>Value</th></tr></thead>
                <tbody>{[1,2,3,4].map(i => <tr key={i}><td>Item {i}</td><td>Cat {i}</td><td>{i * 23}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dashboard Builder</h2>
        <p className="text-muted">Create custom dashboards with drag-and-drop widgets</p>
      </div>

      <div className="builder-layout">
        {/* Sidebar */}
        <div className="card builder-sidebar">
          <div className="sidebar-section">
            <div className="section-header">
              <h3 className="card-title">My Dashboards</h3>
              <button className="btn btn-sm btn-primary" onClick={createDashboard}><Plus size={14} /></button>
            </div>
            {dashboards.length === 0 ? (
              <div className="empty-state-sm"><p>No dashboards yet</p></div>
            ) : (
              dashboards.map(d => (
                <div key={d.id} className={`dash-item ${activeDash?.id === d.id ? 'active' : ''}`} onClick={() => selectDashboard(d)}>
                  <LayoutDashboard size={16} />
                  <span>{d.name}</span>
                  <button className="icon-btn danger ml-auto" onClick={e => { e.stopPropagation(); deleteDashboard(d.id); }}><Trash2 size={12} /></button>
                </div>
              ))
            )}
          </div>

          {activeDash && editMode && (
            <div className="sidebar-section">
              <h3 className="card-title">Add Widget</h3>
              <div className="widget-types-grid">
                {WIDGET_TYPES.map(wt => (
                  <button key={wt.id} className={`widget-type-btn ${newWidget.type === wt.id ? 'active' : ''}`} onClick={() => setNewWidget({...newWidget, type: wt.id})}>
                    <span>{wt.icon}</span><span>{wt.label}</span>
                  </button>
                ))}
              </div>
              <div className="form-group">
                <label>Widget Title</label>
                <input value={newWidget.title} onChange={e => setNewWidget({...newWidget, title: e.target.value})} placeholder="Title..." />
              </div>
              <div className="form-group">
                <label>Size</label>
                <select value={newWidget.size} onChange={e => setNewWidget({...newWidget, size: e.target.value})}>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="full">Full Width</option>
                </select>
              </div>
              {(newWidget.type === 'text' || newWidget.type === 'stat') && (
                <div className="form-group">
                  <label>Content</label>
                  <input value={newWidget.content} onChange={e => setNewWidget({...newWidget, content: e.target.value})} placeholder="Content..." />
                </div>
              )}
              <button className="btn btn-primary btn-full" onClick={addWidget}><Plus size={16} /> Add Widget</button>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="builder-canvas">
          {activeDash ? (
            <>
              <div className="canvas-toolbar">
                <h3>{activeDash.name}</h3>
                <div className="toolbar-actions">
                  <button className={`btn btn-sm ${editMode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setEditMode(!editMode)}>
                    {editMode ? <><Edit3 size={14}/> Editing</> : <><Eye size={14}/> Preview</>}
                  </button>
                  <button className="btn btn-sm btn-success" onClick={saveDashboard} disabled={saving}>
                    <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
              <div className="dashboard-grid">
                {widgets.length === 0 ? (
                  <div className="canvas-empty">
                    <LayoutDashboard size={48} />
                    <p>Add widgets from the sidebar to build your dashboard</p>
                  </div>
                ) : (
                  widgets.map(renderWidget)
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <LayoutDashboard size={64} />
              <p>Select or create a dashboard to get started</p>
              <button className="btn btn-primary" onClick={createDashboard}><Plus size={16} /> New Dashboard</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
