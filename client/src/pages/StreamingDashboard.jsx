import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Play, Pause, Wifi, WifiOff, RefreshCw, Trash2, Settings, Activity } from 'lucide-react';

const card = { background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 };
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];

const FEED_TYPES = [
  { id: 'sales', label: 'Sales Dashboard', icon: '💰', color: '#10b981' },
  { id: 'stock', label: 'Stock Market', icon: '📈', color: '#6366f1' },
  { id: 'iot', label: 'IoT Sensors', icon: '🌡️', color: '#f59e0b' },
  { id: 'marketing', label: 'Marketing', icon: '📣', color: '#ec4899' },
  { id: 'ecommerce', label: 'E-Commerce', icon: '🛒', color: '#8b5cf6' },
];

const MAX_POINTS = 60;

export default function StreamingDashboard() {
  const [feedType, setFeedType] = useState('sales');
  const [interval, setInterval_] = useState(1000);
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [stats, setStats] = useState({});
  const [eventCount, setEventCount] = useState(0);
  const esRef = useRef(null);
  const feedConfig = FEED_TYPES.find(f => f.id === feedType) || FEED_TYPES[0];

  const disconnect = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setConnected(false); setRunning(false);
  }, []);

  const connect = useCallback(() => {
    disconnect();
    const token = localStorage.getItem('token');
    const url = `/api/streaming/feed?type=${feedType}&interval=${interval}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const point = JSON.parse(e.data);
        if (point.type === 'connected') {
          setConnected(true);
          const keys = Object.keys(point).filter(k => !['type', 'feedType', 'intervalMs', 'ts', '_seq', '_type', 'timestamp'].includes(k));
          setMetrics(keys);
          setSelectedMetrics(keys.slice(0, 3));
          return;
        }
        const { _seq, _type, ...rest } = point;
        const ts = new Date().toLocaleTimeString('en', { hour12: false });
        setData(prev => {
          const next = [...prev, { ...rest, _ts: ts }];
          return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
        });
        setEventCount(prev => prev + 1);
        setStats(prev => {
          const updated = { ...prev };
          Object.entries(rest).forEach(([k, v]) => {
            if (typeof v === 'number') {
              const prev_v = updated[k];
              updated[k] = { current: v, prev: prev_v?.current ?? v, max: Math.max(prev_v?.max ?? v, v), min: Math.min(prev_v?.min ?? v, v) };
            }
          });
          return updated;
        });
      } catch {}
    };
    es.onerror = () => { setConnected(false); };
    setRunning(true);
  }, [feedType, interval, disconnect]);

  useEffect(() => { return () => disconnect(); }, [disconnect]);

  const toggleFeedType = (type) => {
    setFeedType(type);
    setData([]); setStats({}); setEventCount(0); setMetrics([]); setSelectedMetrics([]);
    if (running) disconnect();
  };

  const fmt = (v) => {
    if (typeof v !== 'number') return v;
    if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toFixed(2);
  };

  const delta = (metric) => {
    const s = stats[metric];
    if (!s || s.current === s.prev) return null;
    const pct = ((s.current - s.prev) / Math.abs(s.prev) * 100).toFixed(1);
    return { pct, up: s.current > s.prev };
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={24} color="#6366f1" /> Real-Time Streaming Dashboard
        </h1>
        <p style={{ color: '#6b7280', margin: 0 }}>Live data feeds with Server-Sent Events (SSE) — simulates Kafka/Kinesis-style real-time streams</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={card}>
            <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Feed Type</div>
            {FEED_TYPES.map(ft => (
              <button key={ft.id} onClick={() => toggleFeedType(ft.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 4, borderRadius: 8, border: `1px solid ${feedType === ft.id ? ft.color + '60' : 'transparent'}`, background: feedType === ft.id ? ft.color + '15' : 'transparent', cursor: 'pointer', color: feedType === ft.id ? ft.color : '#9ca3af', fontWeight: feedType === ft.id ? 600 : 400, fontSize: 13 }}>
                <span style={{ fontSize: 16 }}>{ft.icon}</span> {ft.label}
              </button>
            ))}
          </div>

          <div style={card}>
            <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Update Interval</div>
            {[['0.5s', 500], ['1s', 1000], ['2s', 2000], ['5s', 5000]].map(([label, ms]) => (
              <button key={ms} onClick={() => setInterval_(ms)}
                style={{ padding: '7px 12px', margin: '0 4px 4px 0', borderRadius: 6, border: `1px solid ${interval === ms ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: interval === ms ? 'rgba(99,102,241,0.15)' : 'transparent', color: interval === ms ? '#818cf8' : '#6b7280', cursor: 'pointer', fontSize: 12, fontWeight: interval === ms ? 600 : 400 }}>
                {label}
              </button>
            ))}
          </div>

          {metrics.length > 0 && (
            <div style={card}>
              <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Metrics</div>
              {metrics.map((m, i) => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedMetrics.includes(m)} onChange={e => {
                    setSelectedMetrics(prev => e.target.checked ? [...prev, m] : prev.filter(x => x !== m));
                  }} style={{ accentColor: COLORS[i % COLORS.length] }} />
                  <span style={{ color: '#d1d5db', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block' }} />
                    {m.replace(/_/g, ' ')}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={running ? disconnect : connect}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: running ? '#ef4444' : feedConfig.color, color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 }}>
              {running ? <><Pause size={16} /> Stop</> : <><Play size={16} /> Start</>}
            </button>
            <button onClick={() => { setData([]); setStats({}); setEventCount(0); }}
              style={{ padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#6b7280', cursor: 'pointer' }}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Main area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status bar */}
          <div style={{ ...card, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {connected ? <Wifi size={14} color="#10b981" /> : <WifiOff size={14} color="#6b7280" />}
                <span style={{ color: connected ? '#10b981' : '#6b7280', fontSize: 13, fontWeight: 600 }}>
                  {connected ? 'Live' : 'Disconnected'}
                </span>
                {connected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />}
              </div>
              <span style={{ color: '#4b5563', fontSize: 12 }}>|</span>
              <span style={{ color: '#9ca3af', fontSize: 13 }}>{feedConfig.icon} {feedConfig.label}</span>
              <span style={{ color: '#4b5563', fontSize: 12 }}>|</span>
              <span style={{ color: '#9ca3af', fontSize: 13 }}>{eventCount.toLocaleString()} events received</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: '#4b5563', fontSize: 12 }}>Buffer: {data.length}/{MAX_POINTS} points</span>
            </div>
          </div>

          {/* KPI cards */}
          {selectedMetrics.length > 0 && Object.keys(stats).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(selectedMetrics.length, 4)}, 1fr)`, gap: 12 }}>
              {selectedMetrics.slice(0, 4).map((m, i) => {
                const s = stats[m];
                const d = delta(m);
                return (
                  <div key={m} style={{ ...card, borderLeft: `3px solid ${COLORS[i % COLORS.length]}` }}>
                    <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>{m.replace(/_/g, ' ')}</div>
                    <div style={{ color: '#f3f4f6', fontSize: 24, fontWeight: 700 }}>{s ? fmt(s.current) : '—'}</div>
                    {d && (
                      <div style={{ color: d.up ? '#10b981' : '#ef4444', fontSize: 12, marginTop: 4 }}>
                        {d.up ? '▲' : '▼'} {Math.abs(d.pct)}%
                      </div>
                    )}
                    {s && <div style={{ color: '#4b5563', fontSize: 11, marginTop: 2 }}>max: {fmt(s.max)} · min: {fmt(s.min)}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Chart */}
          <div style={{ ...card, height: 300 }}>
            {data.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
                <Activity size={48} color="#374151" />
                <p style={{ color: '#6b7280', margin: 0 }}>Press Start to begin streaming live data</p>
                <p style={{ color: '#4b5563', fontSize: 12, margin: 0 }}>Architecture: SSE → Node.js → React (same pattern as Kafka consumer)</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="_ts" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={fmt} width={60} />
                  <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#9ca3af' }} itemStyle={{ color: '#d1d5db' }} formatter={(v) => fmt(v)} />
                  {selectedMetrics.map((m, i) => (
                    <Area key={m} type="monotone" dataKey={m} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length] + '15'} dot={false} strokeWidth={2} isAnimationActive={false} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Second chart for secondary metrics */}
          {selectedMetrics.length > 3 && data.length > 0 && (
            <div style={{ ...card, height: 200 }}>
              <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>Secondary Metrics</div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="_ts" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} width={50} />
                  <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                  {selectedMetrics.slice(3).map((m, i) => (
                    <Line key={m} type="monotone" dataKey={m} stroke={COLORS[(i + 3) % COLORS.length]} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Info banner */}
          <div style={{ padding: '10px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, color: '#818cf8', fontSize: 12 }}>
            <strong>Architecture note:</strong> This uses Server-Sent Events (SSE) — the same pattern used by Kafka consumers and Kinesis stream readers, just without the broker infrastructure. To connect a real Kafka/Kinesis feed, replace the mock generator on the server with a Kafka consumer (kafka-node) or Kinesis SDK reading from a stream.
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
