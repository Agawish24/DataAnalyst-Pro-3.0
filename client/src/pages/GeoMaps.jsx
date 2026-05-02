import { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Map, Plus, Trash2, Layers, RefreshCw } from 'lucide-react';

export default function GeoMaps() {
  const { datasets, fetchDatasets, activeDataset, selectDataset } = useData();
  const [layers, setLayers] = useState([]);
  const [activeLayer, setActiveLayer] = useState(null);
  const [layerData, setLayerData] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [columns, setColumns] = useState([]);
  const [mapError, setMapError] = useState(null);
  const [form, setForm] = useState({ name: '', lat_col: '', lng_col: '', value_col: '', layer_type: 'points' });
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => { fetchDatasets(); loadLayers(); }, []);
  useEffect(() => { if (activeDataset) loadColumns(); }, [activeDataset]);

  const loadLayers = async () => { try { const r = await api.get('/geo'); setLayers(r.data); } catch {} };
  const loadColumns = async () => {
    try {
      const r = await api.get(`/datasets/${activeDataset.id}`);
      const schema = r.data.schema || [];
      setColumns(Array.isArray(schema) ? schema.map(c => c.name) : Object.keys(schema));
    } catch {}
  };

  const createLayer = async () => {
    if (!form.name || !form.lat_col || !form.lng_col || !activeDataset) return toast.error('Name, lat/lng columns, and dataset required');
    try {
      await api.post('/geo', { ...form, dataset_id: activeDataset.id });
      toast.success('Layer created'); setShowAdd(false); setForm({ name: '', lat_col: '', lng_col: '', value_col: '', layer_type: 'points' }); loadLayers();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const loadLayerData = async (layer) => {
    setActiveLayer(layer); setLayerData(null);
    try {
      const r = await api.get(`/geo/${layer.id}/data`);
      setLayerData(r.data);
      renderMap(r.data);
    } catch (e) { toast.error(e.response?.data?.error || 'Could not load layer data'); }
  };

  const renderMap = (data) => {
    setMapError(null);
    setTimeout(async () => {
      if (!mapRef.current) return;
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }

        const features = data.geojson?.features || [];
        if (!features.length) { setMapError('No valid coordinates found in this layer'); return; }

        const lats = features.map(f => f.geometry.coordinates[1]);
        const lngs = features.map(f => f.geometry.coordinates[0]);
        const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
        const centerLng = (Math.max(...lngs) + Math.min(...lngs)) / 2;

        const map = L.map(mapRef.current).setView([centerLat, centerLng], 5);
        mapInstanceRef.current = map;

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '©OpenStreetMap ©CartoDB', maxZoom: 19,
        }).addTo(map);

        const values = features.map(f => f.properties?.value || 0).filter(v => v > 0);
        const maxVal = Math.max(...values, 1);

        features.forEach(f => {
          const [lng, lat] = f.geometry.coordinates;
          const val = f.properties?.value || 0;
          const intensity = val / maxVal;
          const color = `hsl(${240 - intensity * 240}, 80%, ${40 + intensity * 30}%)`;
          const radius = 4 + intensity * 10;
          L.circleMarker([lat, lng], { radius, color, fillColor: color, fillOpacity: 0.7, weight: 1 })
            .bindPopup(`Lat: ${lat.toFixed(4)}<br>Lng: ${lng.toFixed(4)}${val ? `<br>Value: ${val}` : ''}`)
            .addTo(map);
        });
      } catch (e) { setMapError('Leaflet map library could not be loaded. Showing data table instead.'); }
    }, 100);
  };

  const del = async (id) => {
    await api.delete(`/geo/${id}`); loadLayers(); if (activeLayer?.id === id) { setActiveLayer(null); setLayerData(null); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}><Map size={26} color="#10b981" /> Geospatial Maps</h1>
          <p style={{ color: '#9ca3af', margin: 0 }}>Visualize location data on interactive maps with customizable layers</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> New Layer
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, flex: 1, minHeight: 0 }}>
        {/* Layer panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600 }}>SAVED LAYERS ({layers.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {layers.length === 0 ? (
              <div style={{ background: '#13131f', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 10, padding: 24, textAlign: 'center' }}>
                <Layers size={28} color="#374151" style={{ margin: '0 auto 8px', display: 'block' }} />
                <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>No layers yet</p>
              </div>
            ) : layers.map(l => (
              <div key={l.id} onClick={() => loadLayerData(l)}
                style={{ background: '#13131f', border: `1px solid ${activeLayer?.id === l.id ? '#10b981' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: 12, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>{l.name}</div>
                    <div style={{ color: '#6b7280', fontSize: 11 }}>{l.dataset_name}</div>
                    <div style={{ color: '#4b5563', fontSize: 11 }}>{l.lat_col} / {l.lng_col}</div>
                    <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>{l.layer_type}</span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); del(l.id); }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 2 }}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Dataset selector for adding */}
          <div style={{ marginTop: 8 }}>
            <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>DATASET FOR NEW LAYER</label>
            <select value={activeDataset?.id || ''} onChange={e => selectDataset(datasets.find(d => d.id == e.target.value))}
              style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '8px 12px', fontSize: 13 }}>
              <option value="">Select...</option>{datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        {/* Map area */}
        <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', position: 'relative', minHeight: 480 }}>
          {!activeLayer ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
              <Map size={60} color="#374151" />
              <p style={{ color: '#6b7280', fontSize: 15 }}>Select a layer to view on the map</p>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#f3f4f6', fontWeight: 600 }}>{activeLayer.name}</span>
                {layerData && <span style={{ color: '#10b981', fontSize: 13 }}>{layerData.pointCount?.toLocaleString()} points</span>}
              </div>
              {mapError ? (
                <div style={{ padding: 24 }}>
                  <div style={{ color: '#f59e0b', marginBottom: 12, fontSize: 14 }}>⚠️ {mapError}</div>
                  {layerData?.geojson?.features?.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                        <thead><tr><th style={{ padding: '6px 10px', color: '#9ca3af', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Latitude</th><th style={{ padding: '6px 10px', color: '#9ca3af', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Longitude</th><th style={{ padding: '6px 10px', color: '#9ca3af', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Value</th></tr></thead>
                        <tbody>{layerData.geojson.features.slice(0, 50).map((f, i) => <tr key={i}><td style={{ padding: '5px 10px', color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{f.geometry.coordinates[1].toFixed(4)}</td><td style={{ padding: '5px 10px', color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{f.geometry.coordinates[0].toFixed(4)}</td><td style={{ padding: '5px 10px', color: '#10b981', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{f.properties?.value ?? '—'}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div ref={mapRef} style={{ width: '100%', height: 'calc(100% - 45px)', minHeight: 440 }} />
              )}
            </>
          )}
        </div>
      </div>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAdd(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: 480, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f3f4f6', marginTop: 0, marginBottom: 20 }}>New Geo Layer</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>LAYER NAME</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Store Locations"
                  style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }} /></div>
              {(['lat_col', 'lng_col', 'value_col']).map(f => (
                <div key={f}><label style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 6 }}>{f.replace('_', ' ').toUpperCase()} {f === 'value_col' ? '(optional)' : ''}</label>
                  <select value={form[f]} onChange={e => setForm(frm => ({ ...frm, [f]: e.target.value }))}
                    style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '10px 14px', fontSize: 14 }}>
                    <option value="">Select...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createLayer} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Create Layer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
