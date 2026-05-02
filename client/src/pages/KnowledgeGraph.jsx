import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { RefreshCw, Search, Network, Database, Tag, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const card = { background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 };

const ENTITY_COLORS = {
  dataset: '#1e40af', customer: '#6366f1', product: '#10b981', region: '#3b82f6',
  time: '#f59e0b', financial: '#ef4444', employee: '#8b5cf6',
  order: '#ec4899', performance: '#14b8a6', identity: '#6b7280',
  category: '#f97316', attribute: '#4b5563',
};

const forceLayout = (nodes, edges, width, height, iterations = 80) => {
  const pos = {};
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    const r = Math.min(width, height) * 0.35;
    pos[n.id] = { x: width / 2 + r * Math.cos(angle), y: height / 2 + r * Math.sin(angle) };
  });

  for (let iter = 0; iter < iterations; iter++) {
    const forces = {};
    nodes.forEach(n => { forces[n.id] = { x: 0, y: 0 }; });

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos[nodes[i].id], b = pos[nodes[j].id];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const repStr = 6000 / (dist * dist);
        const fx = (dx / dist) * repStr, fy = (dy / dist) * repStr;
        forces[nodes[i].id].x += fx; forces[nodes[i].id].y += fy;
        forces[nodes[j].id].x -= fx; forces[nodes[j].id].y -= fy;
      }
    }

    // Attraction (edges)
    edges.forEach(e => {
      const a = pos[e.source], b = pos[e.target];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const ideal = e.type === 'joinable' ? 150 : 80;
      const attrStr = (dist - ideal) * 0.02;
      const fx = (dx / dist) * attrStr, fy = (dy / dist) * attrStr;
      forces[e.source].x += fx; forces[e.source].y += fy;
      forces[e.target].x -= fx; forces[e.target].y -= fy;
    });

    // Apply
    const dampen = 0.85 - iter / iterations * 0.5;
    nodes.forEach(n => {
      pos[n.id].x = Math.max(40, Math.min(width - 40, pos[n.id].x + forces[n.id].x * dampen));
      pos[n.id].y = Math.max(40, Math.min(height - 40, pos[n.id].y + forces[n.id].y * dampen));
    });
  }
  return pos;
};

export default function KnowledgeGraph() {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState({});
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef(null);
  const W = 900, H = 600;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/knowledge-graph/analyze');
      setGraphData(r.data);
      const pos = forceLayout(r.data.nodes, r.data.edges, W, H);
      setPositions(pos);
    } catch (e) { toast.error('Failed to build knowledge graph'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleNodes = graphData?.nodes.filter(n => {
    if (filter !== 'all' && n.type !== filter && n.entityType !== filter) return false;
    if (search && !n.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) || [];

  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = (graphData?.edges || []).filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

  const entityTypes = [...new Set((graphData?.nodes || []).filter(n => n.type === 'entity').map(n => n.entityType))];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Network size={24} color="#6366f1" /> Knowledge Graph & Semantic Layer
        </h1>
        <p style={{ color: '#6b7280', margin: 0 }}>Maps entity relationships across all your datasets — detects joinable tables, shared keys, and semantic clusters</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
        {/* Graph */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes..." style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px 8px 30px', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <select value={filter} onChange={e => setFilter(e.target.value)} style={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 12px', fontSize: 13 }}>
              <option value="all">All Nodes</option>
              <option value="dataset">Datasets only</option>
              {entityTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setZoom(z => Math.min(2, z + 0.2))} style={{ padding: '8px', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#9ca3af', cursor: 'pointer' }}><ZoomIn size={14} /></button>
              <button onClick={() => setZoom(z => Math.max(0.4, z - 0.2))} style={{ padding: '8px', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#9ca3af', cursor: 'pointer' }}><ZoomOut size={14} /></button>
              <button onClick={() => setZoom(1)} style={{ padding: '8px', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#9ca3af', cursor: 'pointer' }}><Maximize2 size={14} /></button>
            </div>
            <button onClick={load} style={{ padding: '8px 14px', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
            </button>
          </div>

          {/* SVG Graph */}
          <div style={{ ...card, padding: 0, overflow: 'hidden', position: 'relative' }}>
            {loading ? (
              <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                <RefreshCw size={32} color="#374151" style={{ animation: 'spin 1s linear infinite' }} />
                <p style={{ color: '#6b7280' }}>Analyzing dataset relationships...</p>
              </div>
            ) : (
              <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} style={{ cursor: 'default', background: '#0a0a14' }}>
                <defs>
                  <marker id="arr" viewBox="0 0 10 10" refX="8" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 3 L 0 6 z" fill="rgba(255,255,255,0.15)" />
                  </marker>
                  <marker id="arr-join" viewBox="0 0 10 10" refX="8" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 3 L 0 6 z" fill="#6366f1" />
                  </marker>
                </defs>

                {/* Grid */}
                {Array.from({ length: 10 }, (_, i) => (
                  <line key={`h${i}`} x1={0} y1={i * 60} x2={W} y2={i * 60} stroke="rgba(255,255,255,0.02)" />
                ))}

                {/* Edges */}
                <g style={{ transform: `scale(${zoom})`, transformOrigin: `${W / 2}px ${H / 2}px` }}>
                  {visibleEdges.map(e => {
                    const a = positions[e.source], b = positions[e.target];
                    if (!a || !b) return null;
                    const isJoin = e.type === 'joinable';
                    return (
                      <g key={e.id}>
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                          stroke={isJoin ? '#6366f1' : 'rgba(255,255,255,0.06)'}
                          strokeWidth={isJoin ? 2 : 1}
                          strokeDasharray={isJoin ? '6,3' : undefined}
                          markerEnd={isJoin ? 'url(#arr-join)' : 'url(#arr)'} />
                        {isJoin && (
                          <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} fill="#6366f1" fontSize={9} textAnchor="middle">{e.label?.replace('shared: ', '')}</text>
                        )}
                      </g>
                    );
                  })}

                  {/* Nodes */}
                  {visibleNodes.map(n => {
                    const pos = positions[n.id];
                    if (!pos) return null;
                    const isSelected = selected?.id === n.id;
                    const isDataset = n.type === 'dataset';
                    const r = isDataset ? 22 : Math.max(12, n.size || 14);
                    const color = n.color || ENTITY_COLORS[n.entityType] || '#6b7280';
                    return (
                      <g key={n.id} onClick={() => setSelected(selected?.id === n.id ? null : n)} style={{ cursor: 'pointer' }}>
                        <circle cx={pos.x} cy={pos.y} r={r + 4} fill={color} opacity={0.1} />
                        <circle cx={pos.x} cy={pos.y} r={r}
                          fill={isDataset ? '#1e3a8a' : color + '25'}
                          stroke={isSelected ? '#ffffff' : color}
                          strokeWidth={isSelected ? 2.5 : isDataset ? 2 : 1.5} />
                        {isDataset && <text x={pos.x} y={pos.y + 5} textAnchor="middle" fill="white" fontSize={12}>🗃️</text>}
                        <text x={pos.x} y={pos.y + r + 12} textAnchor="middle" fill={isDataset ? '#93c5fd' : '#d1d5db'}
                          fontSize={isDataset ? 11 : 9} fontWeight={isDataset ? 600 : 400}
                          style={{ pointerEvents: 'none' }}>
                          {n.label.length > 14 ? n.label.substring(0, 12) + '…' : n.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[['dataset', '#1e40af', '🗃️ Dataset'], ...Object.entries(ENTITY_COLORS).filter(([k]) => entityTypes.includes(k)).map(([k, c]) => [k, c, k.charAt(0).toUpperCase() + k.slice(1)])].map(([type, color, label]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }} onClick={() => setFilter(filter === type ? 'all' : type)}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, opacity: filter === 'all' || filter === type ? 1 : 0.3 }} />
                <span style={{ color: filter === type ? '#f3f4f6' : '#6b7280', fontSize: 11 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Stats */}
          {graphData?.stats && (
            <div style={card}>
              <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Graph Stats</div>
              {[
                ['Datasets', graphData.stats.totalDatasets],
                ['Entity Nodes', graphData.nodes?.filter(n => n.type === 'entity').length],
                ['Total Edges', graphData.stats.totalEdges],
                ['Joinable Pairs', graphData.stats.joinableDatasets],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>{label}</span>
                  <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13 }}>{val ?? 0}</span>
                </div>
              ))}
            </div>
          )}

          {/* Selected node detail */}
          {selected ? (
            <div style={card}>
              <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                {selected.type === 'dataset' ? '🗃️ Dataset' : '🏷️ Entity'}
              </div>
              <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{selected.label}</div>
              {selected.type === 'dataset' ? (
                <>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>{(selected.rowCount || 0).toLocaleString()} rows · {selected.columnCount || 0} columns</div>
                  <a href={`/sql?dataset=${selected.id?.replace('ds_', '')}`} style={{ display: 'block', marginTop: 10, padding: '8px 12px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', textDecoration: 'none', borderRadius: 8, fontSize: 12, textAlign: 'center' }}>Open in SQL Editor →</a>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ background: `${selected.color}20`, color: selected.color, padding: '2px 8px', borderRadius: 8, fontSize: 11 }}>{selected.entityType}</span>
                    <span style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af', padding: '2px 8px', borderRadius: 8, fontSize: 11 }}>{selected.dataType}</span>
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>Appears in {selected.datasets?.length || 1} dataset(s)</div>
                </>
              )}
            </div>
          ) : (
            <div style={{ ...card, textAlign: 'center', padding: 24 }}>
              <Network size={28} color="#374151" style={{ margin: '0 auto 8px', display: 'block' }} />
              <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>Click any node to see details</p>
            </div>
          )}

          {/* Joinable datasets */}
          {graphData?.stats?.sharedColumns?.length > 0 && (
            <div style={card}>
              <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Shared Columns (Joins)</div>
              {graphData.stats.sharedColumns.map(sc => (
                <div key={sc.name} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ color: '#f3f4f6', fontSize: 12, fontWeight: 600 }}>{sc.name}</div>
                  <div style={{ color: '#6b7280', fontSize: 11 }}>in {sc.datasets} datasets — joinable</div>
                </div>
              ))}
            </div>
          )}

          {/* Entity type distribution */}
          {graphData?.stats?.entityTypes && (
            <div style={card}>
              <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Entity Distribution</div>
              {Object.entries(graphData.stats.entityTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ENTITY_COLORS[type] || '#6b7280' }} />
                    <span style={{ color: '#9ca3af', fontSize: 12 }}>{type}</span>
                  </div>
                  <span style={{ color: '#f3f4f6', fontSize: 12, fontWeight: 600 }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
