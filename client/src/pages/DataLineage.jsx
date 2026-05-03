import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { GitBranch, Database, FileText, Code2, Zap, RefreshCw } from 'lucide-react';

const NODE_STYLES = {
  dataset:  { color: '#6366f1', bg: 'rgba(99,102,241,0.15)', icon: Database },
  query:    { color: '#10b981', bg: 'rgba(16,185,129,0.15)', icon: Code2 },
  report:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: FileText },
  version:  { color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', icon: GitBranch },
  recipe:   { color: '#ec4899', bg: 'rgba(236,72,153,0.15)', icon: Zap },
};

const EDGE_LABELS = {
  queried_by: 'queried by', included_in: 'used in', versioned_as: 'version snapshot',
  evolved_to: 'evolved to', transformed_by: 'transformed by', derived_from: 'derived from',
};

function GraphNode({ node, x, y, selected, onClick }) {
  const style = NODE_STYLES[node.type] || NODE_STYLES.dataset;
  const Icon = style.icon;
  return (
    <g onClick={() => onClick(node)} style={{ cursor: 'pointer' }}>
      <rect x={x - 70} y={y - 22} width={140} height={44} rx={10}
        fill={selected ? style.color : style.bg}
        stroke={style.color} strokeWidth={selected ? 2.5 : 1.5} />
      <text x={x} y={y + 5} textAnchor="middle" fontSize={11} fill={selected ? '#fff' : '#e2e8f0'} fontWeight={600}>
        {node.label?.length > 18 ? node.label.slice(0, 18) + '…' : node.label}
      </text>
      <text x={x} y={y + 18} textAnchor="middle" fontSize={9} fill={style.color} style={{ textTransform: 'uppercase' }}>
        {node.type}
      </text>
    </g>
  );
}

function GraphEdge({ x1, y1, x2, y2, label }) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g>
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(99,102,241,0.7)" />
        </marker>
      </defs>
      <path d={`M${x1},${y1} Q${mx},${y1} ${x2},${y2}`} fill="none" stroke="rgba(99,102,241,0.4)" strokeWidth={1.5} markerEnd="url(#arr)" />
      <text x={mx} y={my - 6} textAnchor="middle" fontSize={9} fill="#6b7280">{EDGE_LABELS[label] || label}</text>
    </g>
  );
}

const layout = (nodes) => {
  const typeOrder = ['dataset', 'version', 'recipe', 'query', 'report'];
  const groups = {};
  nodes.forEach(n => { const t = n.type || 'dataset'; if (!groups[t]) groups[t] = []; groups[t].push(n); });
  const positions = {};
  let col = 0;
  typeOrder.forEach(type => {
    if (!groups[type]) return;
    groups[type].forEach((n, i) => {
      positions[n.id] = { x: 120 + col * 200, y: 80 + i * 90 };
    });
    col++;
  });
  return positions;
};

export default function DataLineage() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [lineage, setLineage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => { fetchDatasets(); }, []);
  useEffect(() => { if (activeDataset) load(); }, [activeDataset]);

  const load = async () => {
    setLoading(true); setSelected(null);
    try {
      const r = await api.get(`/lineage/${activeDataset.id}`);
      setLineage(r.data);
    } catch (e) { toast.error('Failed to load lineage'); }
    finally { setLoading(false); }
  };

  const positions = lineage ? layout(lineage.nodes) : {};
  const svgH = lineage ? Math.max(400, Object.values(positions).reduce((m, p) => Math.max(m, p.y + 100), 0)) : 400;
  const svgW = lineage ? Math.max(700, Object.values(positions).reduce((m, p) => Math.max(m, p.x + 150), 0)) : 700;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitBranch size={26} color="#8b5cf6" /> Data Lineage
        </h1>
        <p style={{ color: '#9ca3af', margin: 0 }}>Visualize how data flows from raw sources through queries, recipes, and into reports</p>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))}
          style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
          <option value="">Select a dataset...</option>
          {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {activeDataset && <button onClick={load} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><RefreshCw size={14} /> Refresh</button>}
        {/* Legend */}
        {lineage && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(NODE_STYLES).map(([type, s]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
              <span style={{ color: '#9ca3af', fontSize: 12, textTransform: 'capitalize' }}>{type}</span>
            </div>
          ))}
        </div>}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}><RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} /><div>Loading lineage graph...</div></div>}

      {lineage && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 280px' : '1fr', gap: 20 }}>
          {/* SVG graph */}
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'auto' }}>
            <svg width={svgW} height={svgH} style={{ minWidth: '100%' }}>
              {/* Edges */}
              {lineage.edges?.map((edge, i) => {
                const srcNode = lineage.nodes.find(n => n.id === edge.source);
                const tgtNode = lineage.nodes.find(n => n.id === edge.target);
                if (!srcNode || !tgtNode) return null;
                const p1 = positions[srcNode.id], p2 = positions[tgtNode.id];
                if (!p1 || !p2) return null;
                return <GraphEdge key={i} x1={p1.x + 70} y1={p1.y} x2={p2.x - 70} y2={p2.y} label={edge.type} />;
              })}
              {/* Nodes */}
              {lineage.nodes?.map(node => {
                const pos = positions[node.id];
                if (!pos) return null;
                return <GraphNode key={node.id} node={node} x={pos.x} y={pos.y} selected={selected?.id === node.id} onClick={setSelected} />;
              })}
            </svg>
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 16 }}>{selected.label}</div>
                  <div style={{ color: NODE_STYLES[selected.type]?.color || '#9ca3af', fontSize: 12, textTransform: 'uppercase', marginTop: 2 }}>{selected.type}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
              {selected.createdAt && <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>Created: {new Date(selected.createdAt).toLocaleDateString()}</div>}
              <div style={{ color: '#9ca3af', fontSize: 13 }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: '#f3f4f6' }}>Connected to:</div>
                {lineage.edges?.filter(e => e.source === selected.id || e.target === selected.id).map((e, i) => {
                  const other = lineage.nodes.find(n => n.id === (e.source === selected.id ? e.target : e.source));
                  return other ? (
                    <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: NODE_STYLES[other.type]?.color || '#6b7280', flexShrink: 0 }} />
                      <span style={{ color: '#e2e8f0', fontSize: 12 }}>{other.label}</span>
                      <span style={{ color: '#4b5563', fontSize: 11 }}>({EDGE_LABELS[e.type] || e.type})</span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Column lineage table */}
      {lineage?.columns?.length > 0 && (
        <div style={{ marginTop: 20, background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontWeight: 600 }}>Column-Level Lineage</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Column', 'Type', 'Origin', 'Transformations'].map(h => <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: '#9ca3af', background: '#0d0d1a', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>)}</tr></thead>
              <tbody>{lineage.columns.map(c => (
                <tr key={c.name}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0', fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }}>{c.type}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}><span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', padding: '2px 8px', borderRadius: 8, fontSize: 11 }}>{c.origin}</span></td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#9ca3af' }}>{c.transformations?.join(', ') || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {!lineage && !loading && !activeDataset && (
        <div style={{ background: '#13131f', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 12, padding: 80, textAlign: 'center' }}>
          <GitBranch size={60} color="#374151" style={{ margin: '0 auto 16px', display: 'block' }} />
          <p style={{ color: '#6b7280', fontSize: 16 }}>Select a dataset above to view its data lineage graph</p>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
