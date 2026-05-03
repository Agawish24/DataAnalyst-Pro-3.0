import { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  GitBranch, Database, FileText, Code2, Zap, RefreshCw, Shield, AlertTriangle,
  Eye, EyeOff, Sparkles, MessageSquare, Send, Trash2, Clock, User,
  CheckCircle2, XCircle, ChevronDown, ChevronRight, Activity, Lock,
  BarChart2, Search, X, Plus, TrendingUp, AlertCircle, Info
} from 'lucide-react';

// ── constants ──────────────────────────────────────────────────────────────
const NODE_STYLES = {
  dataset:  { color: '#6366f1', bg: 'rgba(99,102,241,0.18)', border: '#6366f1', icon: Database },
  query:    { color: '#10b981', bg: 'rgba(16,185,129,0.18)', border: '#10b981', icon: Code2 },
  report:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.18)', border: '#f59e0b', icon: FileText },
  version:  { color: '#8b5cf6', bg: 'rgba(139,92,246,0.18)', border: '#8b5cf6', icon: GitBranch },
  recipe:   { color: '#ec4899', bg: 'rgba(236,72,153,0.18)', border: '#ec4899', icon: Zap },
};
const EDGE_LABELS = {
  queried_by: 'queried by', included_in: 'used in', versioned_as: 'version snapshot',
  evolved_to: 'evolved to', transformed_by: 'transformed by', derived_from: 'derived from',
};
const SENSITIVITY_COLORS = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
};
const TABS = ['Graph', 'Columns', 'Impact', 'Governance', 'Narrative', 'Audit', 'Annotations'];

// ── layout algorithm ────────────────────────────────────────────────────────
const layout = (nodes) => {
  const typeOrder = ['dataset', 'version', 'recipe', 'query', 'report'];
  const groups = {};
  nodes.forEach(n => { const t = n.type || 'dataset'; if (!groups[t]) groups[t] = []; groups[t].push(n); });
  const positions = {};
  let col = 0;
  typeOrder.forEach(type => {
    if (!groups[type]) return;
    groups[type].forEach((n, i) => { positions[n.id] = { x: 130 + col * 210, y: 70 + i * 96 }; });
    col++;
  });
  return positions;
};

// ── GraphNode with governance badges ────────────────────────────────────────
function GraphNode({ node, x, y, selected, onClick, piiCols, annotationCounts }) {
  const style = NODE_STYLES[node.type] || NODE_STYLES.dataset;
  const hasPii = node.type === 'dataset' && piiCols > 0;
  const annotCount = annotationCounts?.[node.id] || 0;
  const w = 148, h = 46;
  return (
    <g onClick={() => onClick(node)} style={{ cursor: 'pointer' }}>
      {/* glow on select */}
      {selected && <rect x={x - w/2 - 4} y={y - h/2 - 4} width={w + 8} height={h + 8} rx={14} fill={style.color} opacity={0.15} />}
      <rect x={x - w/2} y={y - h/2} width={w} height={h} rx={10}
        fill={selected ? style.color : style.bg}
        stroke={style.color} strokeWidth={selected ? 2.5 : 1.5} />
      <text x={x} y={y + 2} textAnchor="middle" fontSize={11} fill={selected ? '#fff' : '#e2e8f0'} fontWeight={600}>
        {node.label?.length > 19 ? node.label.slice(0, 19) + '…' : node.label}
      </text>
      <text x={x} y={y + 15} textAnchor="middle" fontSize={9} fill={style.color} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {node.type}
      </text>
      {/* PII badge */}
      {hasPii && <g>
        <circle cx={x + w/2 - 2} cy={y - h/2 + 2} r={8} fill="#f97316" />
        <text x={x + w/2 - 2} y={y - h/2 + 6} textAnchor="middle" fontSize={7} fill="white" fontWeight={700}>PII</text>
      </g>}
      {/* Annotation badge */}
      {annotCount > 0 && <g>
        <circle cx={x - w/2 + 2} cy={y - h/2 + 2} r={8} fill="#8b5cf6" />
        <text x={x - w/2 + 2} y={y - h/2 + 6} textAnchor="middle" fontSize={7} fill="white" fontWeight={700}>{annotCount}</text>
      </g>}
    </g>
  );
}

// ── GraphEdge ───────────────────────────────────────────────────────────────
function GraphEdge({ x1, y1, x2, y2, label, highlighted }) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 20;
  const color = highlighted ? '#f59e0b' : 'rgba(99,102,241,0.4)';
  return (
    <g>
      <defs>
        <marker id={`arr-${highlighted ? 'hi' : 'lo'}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={color} />
        </marker>
      </defs>
      <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none"
        stroke={color} strokeWidth={highlighted ? 2 : 1.5}
        markerEnd={`url(#arr-${highlighted ? 'hi' : 'lo'})`}
        strokeDasharray={highlighted ? '6,3' : 'none'} />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 26} textAnchor="middle" fontSize={9} fill={highlighted ? '#f59e0b' : '#4b5563'}>
        {EDGE_LABELS[label] || label}
      </text>
    </g>
  );
}

// ── Sensitivity badge ─────────────────────────────────────────────────────
function SensiBadge({ s }) {
  if (!s) return null;
  return (
    <span style={{ background: `${SENSITIVITY_COLORS[s.level]}22`, color: SENSITIVITY_COLORS[s.level], border: `1px solid ${SENSITIVITY_COLORS[s.level]}44`, padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

// ── Risk bar ───────────────────────────────────────────────────────────────
function RiskBar({ score }) {
  const color = score >= 60 ? '#ef4444' : score >= 30 ? '#f97316' : '#22c55e';
  const label = score >= 60 ? 'High' : score >= 30 ? 'Medium' : 'Low';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#9ca3af', fontSize: 12 }}>Risk Score</span>
        <span style={{ color, fontWeight: 700, fontSize: 13 }}>{score}/100 — {label}</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────
export default function DataLineage() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [lineage, setLineage] = useState(null);
  const [impact, setImpact] = useState(null);
  const [governance, setGovernance] = useState(null);
  const [narrative, setNarrative] = useState('');
  const [annotations, setAnnotations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [impactLoading, setImpactLoading] = useState(false);
  const [govLoading, setGovLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('Graph');
  const [colSearch, setColSearch] = useState('');
  const [impactCol, setImpactCol] = useState('');
  const [annotText, setAnnotText] = useState('');
  const [annotType, setAnnotType] = useState('comment');
  const [annotLoading, setAnnotLoading] = useState(false);
  const [highlightedEdges, setHighlightedEdges] = useState(new Set());
  const [expandedAudit, setExpandedAudit] = useState(null);

  useEffect(() => { fetchDatasets(); }, []);
  useEffect(() => {
    if (activeDataset) { loadLineage(); setSelected(null); setNarrative(''); setImpact(null); setGovernance(null); }
  }, [activeDataset]);

  // load sub-data when switching tabs
  useEffect(() => {
    if (!activeDataset) return;
    if (activeTab === 'Impact' && !impact) loadImpact();
    if (activeTab === 'Governance' && !governance) loadGovernance();
    if (activeTab === 'Narrative' && !narrative) loadNarrative();
    if (activeTab === 'Annotations') loadAnnotations();
  }, [activeTab, activeDataset]);

  const loadLineage = async () => {
    setLoading(true); setSelected(null);
    try { const r = await api.get(`/lineage/${activeDataset.id}`); setLineage(r.data); }
    catch { toast.error('Failed to load lineage'); }
    finally { setLoading(false); }
  };

  const loadImpact = async (col = '') => {
    setImpactLoading(true);
    try {
      const r = await api.get(`/lineage/${activeDataset.id}/impact`, { params: col ? { column: col } : {} });
      setImpact(r.data);
    } catch { toast.error('Impact analysis failed'); }
    finally { setImpactLoading(false); }
  };

  const loadGovernance = async () => {
    setGovLoading(true);
    try { const r = await api.get(`/lineage/${activeDataset.id}/governance`); setGovernance(r.data); }
    catch { toast.error('Governance load failed'); }
    finally { setGovLoading(false); }
  };

  const loadNarrative = async () => {
    setNarrativeLoading(true);
    try {
      const summary = lineage ? `${lineage.nodes.length} nodes, ${lineage.edges.length} edges, ${lineage.columns.length} columns` : '';
      const r = await api.post(`/lineage/${activeDataset.id}/narrative`, { lineageSummary: summary });
      setNarrative(r.data.narrative);
    } catch { toast.error('Narrative generation failed'); }
    finally { setNarrativeLoading(false); }
  };

  const loadAnnotations = async () => {
    try { const r = await api.get(`/lineage/${activeDataset.id}/annotations`, { params: selected ? { nodeId: selected.id } : {} }); setAnnotations(r.data); }
    catch { setAnnotations([]); }
  };

  const addAnnotation = async () => {
    if (!annotText.trim()) return;
    setAnnotLoading(true);
    try {
      await api.post(`/lineage/${activeDataset.id}/annotations`, {
        nodeId: selected?.id || 'dataset', nodeLabel: selected?.label || activeDataset.name,
        content: annotText, annotationType: annotType,
      });
      setAnnotText(''); loadAnnotations(); toast.success('Annotation added');
    } catch { toast.error('Failed to add annotation'); }
    finally { setAnnotLoading(false); }
  };

  const deleteAnnotation = async (id) => {
    try { await api.delete(`/lineage/annotations/${id}`); loadAnnotations(); toast.success('Deleted'); }
    catch { toast.error('Failed'); }
  };

  const handleNodeClick = (node) => {
    setSelected(prev => prev?.id === node.id ? null : node);
    // Highlight edges connected to this node
    if (lineage) {
      const connected = new Set(lineage.edges.filter(e => e.source === node.id || e.target === node.id).map((_, i) => i));
      setHighlightedEdges(connected);
    }
  };

  // Compute graph layout
  const positions = lineage ? layout(lineage.nodes) : {};
  const svgH = lineage ? Math.max(420, Object.values(positions).reduce((m, p) => Math.max(m, p.y + 80), 0)) : 420;
  const svgW = lineage ? Math.max(760, Object.values(positions).reduce((m, p) => Math.max(m, p.x + 160), 0)) : 760;

  // PII column count for graph badges
  const piiColCount = lineage?.columns?.filter(c => c.pii).length || 0;

  // Annotation counts per node
  const annotCounts = annotations.reduce((acc, a) => { acc[a.node_id] = (acc[a.node_id] || 0) + 1; return acc; }, {});

  // Filtered columns
  const filteredCols = lineage?.columns?.filter(c => !colSearch || c.name.toLowerCase().includes(colSearch.toLowerCase())) || [];

  const card = (children, style = {}) => (
    <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, ...style }}>
      {children}
    </div>
  );

  const tabBtn = (label) => (
    <button key={label} onClick={() => setActiveTab(label)} style={{
      padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
      background: activeTab === label ? 'rgba(99,102,241,0.2)' : 'transparent',
      color: activeTab === label ? '#a5b4fc' : '#6b7280',
    }}>{label}</button>
  );

  const spinIcon = <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />;

  return (
    <div style={{ padding: 24, maxWidth: 1500, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitBranch size={24} color="#8b5cf6" /> Data Lineage
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(139,92,246,0.15)', color: '#a78bfa', marginLeft: 6 }}>Enterprise</span>
        </h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: 13 }}>Column-level lineage · Impact analysis · Governance · AI narratives · Collaboration</p>
      </div>

      {/* Controls bar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))}
          style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '9px 14px', fontSize: 13 }}>
          <option value="">Select a dataset…</option>
          {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {activeDataset && (
          <button onClick={loadLineage} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        )}
        {/* Legend */}
        {lineage && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 6 }}>
            {Object.entries(NODE_STYLES).map(([type, s]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                <span style={{ color: '#6b7280', fontSize: 11, textTransform: 'capitalize' }}>{type}</span>
              </div>
            ))}
            {piiColCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} />
                <span style={{ color: '#f97316', fontSize: 11 }}>PII ({piiColCount} cols)</span>
              </div>
            )}
          </div>
        )}
        {lineage && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <div style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: 12, fontWeight: 600 }}>
              {lineage.nodes.length} nodes
            </div>
            <div style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.1)', color: '#818cf8', fontSize: 12, fontWeight: 600 }}>
              {lineage.edges.length} edges
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      {lineage && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
          {TABS.map(tabBtn)}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          {spinIcon}
          <div style={{ marginTop: 12, fontSize: 13 }}>Building lineage graph…</div>
        </div>
      )}

      {/* Empty state */}
      {!lineage && !loading && !activeDataset && card(
        <div style={{ padding: 80, textAlign: 'center' }}>
          <GitBranch size={56} color="#374151" style={{ margin: '0 auto 16px', display: 'block' }} />
          <p style={{ color: '#6b7280', fontSize: 15, margin: '0 0 8px' }}>Select a dataset to explore its enterprise lineage graph</p>
          <p style={{ color: '#4b5563', fontSize: 13, margin: 0 }}>Column-level tracing · Impact analysis · PII governance · AI narratives</p>
        </div>
      )}

      {/* ── GRAPH TAB ─────────────────────────────────────────────────────── */}
      {lineage && !loading && activeTab === 'Graph' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 300px' : '1fr', gap: 16 }}>
          {card(
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 620 }}>
              <svg width={svgW} height={svgH} style={{ minWidth: '100%', display: 'block' }}>
                {lineage.edges?.map((edge, i) => {
                  const srcNode = lineage.nodes.find(n => n.id === edge.source);
                  const tgtNode = lineage.nodes.find(n => n.id === edge.target);
                  if (!srcNode || !tgtNode) return null;
                  const p1 = positions[srcNode.id], p2 = positions[tgtNode.id];
                  if (!p1 || !p2) return null;
                  const isHighlighted = selected && (edge.source === selected.id || edge.target === selected.id);
                  return <GraphEdge key={i} x1={p1.x + 74} y1={p1.y} x2={p2.x - 74} y2={p2.y} label={edge.type} highlighted={isHighlighted} />;
                })}
                {lineage.nodes?.map(node => {
                  const pos = positions[node.id];
                  if (!pos) return null;
                  return (
                    <GraphNode key={node.id} node={node} x={pos.x} y={pos.y}
                      selected={selected?.id === node.id} onClick={handleNodeClick}
                      piiCols={node.type === 'dataset' ? piiColCount : 0}
                      annotationCounts={annotCounts} />
                  );
                })}
              </svg>
            </div>
          )}

          {/* Node detail panel */}
          {selected && card(
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15 }}>{selected.label}</div>
                  <div style={{ color: NODE_STYLES[selected.type]?.color || '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{selected.type}</div>
                </div>
                <button onClick={() => { setSelected(null); setHighlightedEdges(new Set()); }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
              </div>
              {selected.createdAt && (
                <div style={{ color: '#4b5563', fontSize: 11, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Clock size={11} /> {new Date(selected.createdAt).toLocaleDateString()}
                </div>
              )}
              {selected.sql && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 5, fontWeight: 600 }}>SQL</div>
                  <div style={{ background: '#0d0d1a', borderRadius: 8, padding: 10, fontSize: 11, color: '#a5f3fc', fontFamily: 'monospace', lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }}>{selected.sql}</div>
                </div>
              )}
              <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>CONNECTIONS</div>
              {lineage.edges?.filter(e => e.source === selected.id || e.target === selected.id).map((e, i) => {
                const other = lineage.nodes.find(n => n.id === (e.source === selected.id ? e.target : e.source));
                const isSource = e.source === selected.id;
                return other ? (
                  <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: NODE_STYLES[other.type]?.color || '#6b7280', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#e2e8f0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{other.label}</div>
                      <div style={{ color: '#4b5563', fontSize: 10 }}>{isSource ? '→' : '←'} {EDGE_LABELS[e.type] || e.type}</div>
                    </div>
                  </div>
                ) : null;
              })}
              {/* Quick annotate */}
              <div style={{ marginTop: 16 }}>
                <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>QUICK NOTE</div>
                <textarea value={annotText} onChange={e => setAnnotText(e.target.value)} placeholder="Add note to this node…"
                  style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12, resize: 'vertical', minHeight: 60, boxSizing: 'border-box' }} />
                <button onClick={addAnnotation} disabled={!annotText.trim()} style={{ marginTop: 6, width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: annotText.trim() ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', color: annotText.trim() ? '#a5b4fc' : '#4b5563', cursor: annotText.trim() ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600 }}>
                  <Send size={12} style={{ marginRight: 5 }} /> Add Note
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── COLUMNS TAB ───────────────────────────────────────────────────── */}
      {lineage && !loading && activeTab === 'Columns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
              <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
              <input value={colSearch} onChange={e => setColSearch(e.target.value)} placeholder="Search columns…"
                style={{ width: '100%', paddingLeft: 32, background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '9px 9px 9px 32px', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>{filteredCols.length} columns · {lineage.columns?.filter(c => c.pii).length} PII</div>
          </div>
          {card(
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Column', 'Type', 'Sensitivity', 'Governance', 'Queries', 'Transformations', 'Compliance'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6b7280', background: '#0d0d1a', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCols.map((c, i) => (
                    <tr key={c.name} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0', fontWeight: 600, fontFamily: 'monospace' }}>
                        {c.name}
                        {c.pii && <Lock size={10} color="#f97316" style={{ marginLeft: 5, verticalAlign: 'middle' }} />}
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#6b7280', fontFamily: 'monospace', fontSize: 11 }}>{c.type}</td>
                      <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <SensiBadge s={c.sensitivity} />
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {c.maskType
                          ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f97316', fontSize: 11 }}><EyeOff size={11} /> {c.maskType}</span>
                          : c.pii
                            ? <span style={{ color: '#ef4444', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} /> Unmasked PII</span>
                            : <span style={{ color: '#22c55e', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={11} /> OK</span>}
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center', color: c.usedInQueries > 0 ? '#10b981' : '#4b5563', fontWeight: 600 }}>
                        {c.usedInQueries}
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#9ca3af', maxWidth: 200 }}>
                        {c.transformations?.length > 0
                          ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {c.transformations.slice(0, 2).map((t, ti) => (
                              <span key={ti} style={{ background: 'rgba(236,72,153,0.12)', color: '#f472b6', padding: '1px 6px', borderRadius: 8, fontSize: 10 }}>{t.recipe}: {t.action}</span>
                            ))}
                          </div>
                          : <span style={{ color: '#374151' }}>—</span>}
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {(c.complianceFlags || []).map((f, fi) => (
                            <span key={fi} style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', padding: '1px 6px', borderRadius: 8, fontSize: 10, border: '1px solid rgba(239,68,68,0.2)' }}>{f}</span>
                          ))}
                          {(c.complianceFlags?.length === 0 || !c.complianceFlags) && <span style={{ color: '#374151', fontSize: 11 }}>—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── IMPACT TAB ────────────────────────────────────────────────────── */}
      {lineage && !loading && activeTab === 'Impact' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Column selector for targeted impact */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={impactCol} onChange={e => { setImpactCol(e.target.value); loadImpact(e.target.value); }}
              style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '9px 14px', fontSize: 13 }}>
              <option value="">All columns (full impact)</option>
              {lineage.columns?.map(c => <option key={c.name} value={c.name}>{c.name} {c.pii ? '🔒' : ''}</option>)}
            </select>
            <button onClick={() => loadImpact(impactCol)} style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={13} /> Analyze Impact
            </button>
          </div>

          {impactLoading && <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>{spinIcon}<div style={{ marginTop: 10, fontSize: 13 }}>Running impact analysis…</div></div>}

          {impact && !impactLoading && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              {/* Risk score card */}
              {card(
                <div style={{ padding: 20 }}>
                  <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={15} color="#f59e0b" /> Impact Summary
                  </div>
                  <RiskBar score={impact.summary.riskScore} />
                  <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'Queries', val: impact.impactedQueries.length, color: '#10b981' },
                      { label: 'Reports', val: impact.impactedReports.length, color: '#f59e0b' },
                      { label: 'Recipes', val: impact.impactedRecipes.length, color: '#ec4899' },
                      { label: 'Critical', val: impact.summary.criticalCount, color: '#ef4444' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', background: `${s.color}11`, borderRadius: 8, padding: '10px 0', border: `1px solid ${s.color}22` }}>
                        <div style={{ color: s.color, fontSize: 22, fontWeight: 700 }}>{s.val}</div>
                        <div style={{ color: '#6b7280', fontSize: 11 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Impacted queries */}
              {card(
                <div style={{ padding: 20, maxHeight: 380, overflowY: 'auto' }}>
                  <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Code2 size={14} color="#10b981" /> Affected Queries ({impact.impactedQueries.length})
                  </div>
                  {impact.impactedQueries.length === 0
                    ? <div style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: 20 }}>No queries affected</div>
                    : impact.impactedQueries.map(q => (
                      <div key={q.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                          <span style={{ background: '#ef444422', color: '#fca5a5', padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>CRITICAL</span>
                          <span style={{ color: '#6b7280', fontSize: 10 }}>Query #{q.id}</span>
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.sql}</div>
                        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {q.columns.map(col => <span key={col} style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', padding: '1px 6px', borderRadius: 8, fontSize: 10 }}>{col}</span>)}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Impacted reports */}
              {card(
                <div style={{ padding: 20, maxHeight: 380, overflowY: 'auto' }}>
                  <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={14} color="#f59e0b" /> Affected Reports ({impact.impactedReports.length})
                  </div>
                  {impact.impactedReports.length === 0
                    ? <div style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: 20 }}>No reports affected</div>
                    : impact.impactedReports.map(r => (
                      <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ background: r.severity === 'critical' ? '#ef444422' : '#f59e0b22', color: r.severity === 'critical' ? '#fca5a5' : '#fcd34d', padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                            {r.severity.toUpperCase()}
                          </span>
                          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 11 }}>{r.reason}</div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── GOVERNANCE TAB ────────────────────────────────────────────────── */}
      {lineage && !loading && activeTab === 'Governance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {govLoading && <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>{spinIcon}</div>}
          {governance && !govLoading && (
            <>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  { label: 'Total Columns', val: governance.summary.total, color: '#6366f1', icon: Database },
                  { label: 'PII Columns', val: governance.summary.piiCount, color: '#f97316', icon: AlertTriangle },
                  { label: 'Masked', val: governance.summary.maskedCount, color: '#10b981', icon: EyeOff },
                  { label: 'Compliance Score', val: `${governance.summary.complianceScore}%`, color: governance.summary.complianceScore >= 80 ? '#22c55e' : governance.summary.complianceScore >= 50 ? '#f59e0b' : '#ef4444', icon: Shield },
                ].map(s => (
                  card(
                    <div key={s.label} style={{ padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ color: s.color, fontSize: 26, fontWeight: 700 }}>{s.val}</div>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>{s.label}</div>
                        </div>
                        <s.icon size={20} color={s.color} style={{ opacity: 0.6 }} />
                      </div>
                    </div>
                  )
                ))}
              </div>
              {governance.summary.unmaskedPii > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <AlertCircle size={16} color="#ef4444" />
                  <span style={{ color: '#fca5a5', fontSize: 13 }}><strong>{governance.summary.unmaskedPii} PII column{governance.summary.unmaskedPii > 1 ? 's' : ''}</strong> detected without masking rules. Apply data masking to maintain compliance.</span>
                </div>
              )}
              {card(
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>{['Column', 'Type', 'Sensitivity', 'Masking', 'Query Refs', 'Compliance Flags'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6b7280', background: '#0d0d1a', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600 }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {governance.columns.map((c, i) => (
                        <tr key={c.name} style={{ background: c.pii && !c.maskType ? 'rgba(239,68,68,0.04)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                          <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0', fontWeight: 600, fontFamily: 'monospace' }}>
                            {c.name} {c.pii && !c.maskType && <AlertTriangle size={10} color="#ef4444" style={{ verticalAlign: 'middle', marginLeft: 4 }} />}
                          </td>
                          <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#6b7280', fontFamily: 'monospace', fontSize: 11 }}>{c.type}</td>
                          <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}><SensiBadge s={c.sensitivity} /></td>
                          <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {c.maskType
                              ? <span style={{ color: '#10b981', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><EyeOff size={11} /> {c.maskType}</span>
                              : c.pii
                                ? <span style={{ color: '#ef4444', fontSize: 11 }}>⚠ None</span>
                                : <span style={{ color: '#4b5563', fontSize: 11 }}>—</span>}
                          </td>
                          <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center', color: c.queryReferenceCount > 0 ? '#818cf8' : '#4b5563', fontWeight: 600 }}>{c.queryReferenceCount}</td>
                          <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {(c.complianceFlags || []).map((f, fi) => <span key={fi} style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', padding: '1px 6px', borderRadius: 8, fontSize: 10, border: '1px solid rgba(239,68,68,0.2)' }}>{f}</span>)}
                              {!c.complianceFlags?.length && <span style={{ color: '#4b5563', fontSize: 11 }}>Clean</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── NARRATIVE TAB ─────────────────────────────────────────────────── */}
      {lineage && !loading && activeTab === 'Narrative' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {card(
            <div style={{ padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color="#8b5cf6" /> AI Lineage Narrative
                </div>
                <button onClick={loadNarrative} disabled={narrativeLoading} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: 'white', fontWeight: 700, cursor: narrativeLoading ? 'not-allowed' : 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {narrativeLoading ? <>{spinIcon} Generating…</> : <><Sparkles size={13} /> {narrative ? 'Regenerate' : 'Generate'}</>}
                </button>
              </div>
              {narrativeLoading && <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>{spinIcon}<div style={{ marginTop: 10, fontSize: 13 }}>Generating AI narrative…</div></div>}
              {narrative && !narrativeLoading && (
                <div style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: 24 }}>
                  <div style={{ color: '#c4b5fd', fontSize: 15, lineHeight: 1.75, fontStyle: 'italic' }}>"{narrative}"</div>
                </div>
              )}
              {!narrative && !narrativeLoading && (
                <div style={{ textAlign: 'center', padding: 40, color: '#4b5563' }}>
                  <Sparkles size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                  <div style={{ fontSize: 13 }}>Click Generate to create an AI narrative describing your data lineage</div>
                </div>
              )}
            </div>
          )}
          {/* Context cards */}
          {lineage && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'Flow', text: `${lineage.dataset.name} → ${lineage.nodes.filter(n => n.type === 'version').length} versions → ${lineage.nodes.filter(n => n.type === 'query').length} queries → ${lineage.nodes.filter(n => n.type === 'report').length} reports` },
                { label: 'Transformations', text: `${lineage.nodes.filter(n => n.type === 'recipe').length} recipes applied · ${lineage.columns?.filter(c => c.transformations?.length > 0).length} columns transformed` },
                { label: 'Governance', text: `${lineage.columns?.filter(c => c.pii).length} PII columns · ${lineage.columns?.filter(c => c.maskType).length} masked · ${lineage.columns?.filter(c => c.pii && !c.maskType).length} at risk` },
              ].map(s => card(
                <div key={s.label} style={{ padding: 16 }}>
                  <div style={{ color: '#8b5cf6', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.5 }}>{s.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AUDIT TAB ─────────────────────────────────────────────────────── */}
      {lineage && !loading && activeTab === 'Audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {lineage.auditTrail?.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: '#4b5563' }}>
              <Clock size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
              <div style={{ fontSize: 13 }}>No audit events recorded yet for this dataset</div>
            </div>
          )}
          {lineage.auditTrail?.map((entry, i) => (
            card(
              <div key={i} style={{ padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Activity size={15} color="#818cf8" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13, textTransform: 'capitalize' }}>{(entry.action || '').replace(/_/g, ' ')}</span>
                    <span style={{ color: '#4b5563', fontSize: 11 }}>{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</span>
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginBottom: entry.details ? 6 : 0 }}>
                    <User size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    {entry.user_name || 'System'} {entry.user_email ? `(${entry.user_email})` : ''}
                  </div>
                  {entry.details && Object.keys(entry.details).length > 0 && (
                    <div style={{ background: '#0d0d1a', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.details.sql || JSON.stringify(entry.details).slice(0, 120)}
                    </div>
                  )}
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* ── ANNOTATIONS TAB ───────────────────────────────────────────────── */}
      {lineage && !loading && activeTab === 'Annotations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Add annotation */}
          {card(
            <div style={{ padding: 20 }}>
              <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={15} color="#8b5cf6" /> Add Annotation
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 5 }}>NODE / SCOPE</label>
                  <select value={selected?.id || 'dataset'} onChange={() => {}}
                    style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '9px 12px', fontSize: 13 }}>
                    <option value="dataset">{activeDataset.name} (dataset)</option>
                    {lineage.nodes.filter(n => n.type !== 'dataset').map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 5 }}>TYPE</label>
                  <select value={annotType} onChange={e => setAnnotType(e.target.value)}
                    style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '9px 12px', fontSize: 13 }}>
                    <option value="comment">Comment</option>
                    <option value="approval">Approval Request</option>
                    <option value="issue">Issue / Flag</option>
                    <option value="insight">Insight</option>
                  </select>
                </div>
              </div>
              <textarea value={annotText} onChange={e => setAnnotText(e.target.value)}
                placeholder="Add your annotation, question, or approval request…"
                style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 12px', fontSize: 13, resize: 'vertical', minHeight: 80, boxSizing: 'border-box', marginBottom: 10 }} />
              <button onClick={addAnnotation} disabled={!annotText.trim() || annotLoading}
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: annotText.trim() ? 'linear-gradient(135deg,#8b5cf6,#6366f1)' : '#374151', color: 'white', fontWeight: 700, cursor: annotText.trim() ? 'pointer' : 'not-allowed', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                {annotLoading ? spinIcon : <><Send size={13} /> Add Annotation</>}
              </button>
            </div>
          )}
          {/* Annotation list */}
          {annotations.length === 0
            ? <div style={{ textAlign: 'center', padding: 40, color: '#4b5563' }}>
                <MessageSquare size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
                <div style={{ fontSize: 13 }}>No annotations yet. Be the first to annotate this lineage graph.</div>
              </div>
            : annotations.map(a => card(
              <div key={a.id} style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  {a.user_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>{a.user_name || 'Unknown'}</span>
                      <span style={{ background: a.annotation_type === 'issue' ? 'rgba(239,68,68,0.15)' : a.annotation_type === 'approval' ? 'rgba(16,185,129,0.15)' : a.annotation_type === 'insight' ? 'rgba(99,102,241,0.15)' : 'rgba(139,92,246,0.15)', color: a.annotation_type === 'issue' ? '#fca5a5' : a.annotation_type === 'approval' ? '#6ee7b7' : a.annotation_type === 'insight' ? '#a5b4fc' : '#c4b5fd', padding: '1px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: 'capitalize' }}>{a.annotation_type}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ color: '#4b5563', fontSize: 11 }}>{new Date(a.created_at).toLocaleDateString()}</span>
                      <button onClick={() => deleteAnnotation(a.id)} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 5 }}>On: {a.node_label || 'Dataset'}</div>
                  <div style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.5 }}>{a.content}</div>
                </div>
              </div>
            ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
