import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FileCheck, Plus, Trash2, Play, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const token = () => localStorage.getItem('token');
const ax = () => ({ headers: { Authorization: `Bearer ${token()}` } });
const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 16 };

const RULE_TYPES = [
  { value: 'required_column', label: 'Required Column', hasColumn: true },
  { value: 'not_null', label: 'Not Null', hasColumn: true },
  { value: 'value_range', label: 'Value Range', hasColumn: true },
  { value: 'unique', label: 'Unique Values', hasColumn: true },
  { value: 'allowed_values', label: 'Allowed Values', hasColumn: true },
  { value: 'row_count', label: 'Row Count', hasColumn: false },
  { value: 'schema_match', label: 'Schema Match', hasColumn: false },
];

const SEVERITY_ICON = { error: XCircle, warning: AlertTriangle, info: CheckCircle };
const SEVERITY_COLOR = { error: '#ef4444', warning: '#f59e0b', info: '#6b7280' };

export default function DataContracts() {
  const { datasets, activeDataset, selectDataset } = useData();
  const [contracts, setContracts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [rules, setRules] = useState([]);
  const [validating, setValidating] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [expandedContract, setExpandedContract] = useState(null);
  const [selectedContractId, setSelectedContractId] = useState(null);

  const fetchContracts = async () => {
    try { const r = await axios.get(`${API}/contracts`, ax()); setContracts(r.data); } catch {}
  };

  useEffect(() => { fetchContracts(); }, []);

  const addRule = () => setRules(r => [...r, { type: 'required_column', column: '', params: {} }]);
  const removeRule = i => setRules(r => r.filter((_, j) => j !== i));
  const updateRule = (i, key, val) => setRules(r => r.map((rr, j) => j === i ? { ...rr, [key]: val } : rr));
  const updateParam = (i, key, val) => setRules(r => r.map((rr, j) => j === i ? { ...rr, params: { ...rr.params, [key]: val } } : rr));

  const create = async () => {
    if (!newName.trim()) return toast.error('Contract name required');
    if (!rules.length) return toast.error('Add at least one rule');
    try {
      await axios.post(`${API}/contracts`, { name: newName, description: newDesc, dataset_id: activeDataset?.id, rules }, ax());
      toast.success('Contract created');
      setCreating(false); setNewName(''); setNewDesc(''); setRules([]);
      fetchContracts();
    } catch (e) { toast.error(e.response?.data?.error || 'Create failed'); }
  };

  const deleteContract = async (id) => {
    try {
      await axios.delete(`${API}/contracts/${id}`, ax());
      toast.success('Deleted'); fetchContracts();
      if (selectedContractId === id) { setSelectedContractId(null); setValidationResult(null); }
    } catch (e) { toast.error(e.response?.data?.error || 'Delete failed'); }
  };

  const validate = async (contractId) => {
    if (!activeDataset) return toast.error('Select a dataset to validate against');
    setValidating(contractId);
    setValidationResult(null);
    try {
      const r = await axios.post(`${API}/contracts/${contractId}/validate`, { dataset_id: activeDataset.id }, ax());
      setValidationResult(r.data);
      setSelectedContractId(contractId);
      fetchContracts();
      toast[r.data.passed ? 'success' : 'error'](r.data.passed ? `✅ Contract passed (score: ${r.data.score}%)` : `❌ ${r.data.errors} error(s) found`);
    } catch (e) { toast.error(e.response?.data?.error || 'Validation failed'); }
    finally { setValidating(null); }
  };

  const scoreColor = s => s >= 80 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#06b6d4,#6366f1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileCheck size={20} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Data Contracts</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Define schema expectations and validate datasets against contracts</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Left — contracts list */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>Contracts ({contracts.length})</span>
            <button onClick={() => setCreating(!creating)}
              style={{ padding: '5px 12px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, color: '#a5b4fc', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={12} /> New
            </button>
          </div>

          {creating && (
            <div style={card}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Contract name*"
                style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13, marginBottom: 8 }} />
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)"
                style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13, marginBottom: 12 }} />

              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Rules</span>
                <button onClick={addRule} style={{ padding: '3px 8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 5, color: '#10b981', fontSize: 11, cursor: 'pointer' }}>+ Add Rule</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                {rules.map((rule, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <select value={rule.type} onChange={e => updateRule(i, 'type', e.target.value)}
                        style={{ flex: 1, background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 6px', color: '#9ca3af', fontSize: 11 }}>
                        {RULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <button onClick={() => removeRule(i)} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 5, color: '#ef4444', cursor: 'pointer', padding: '4px 6px' }}><Trash2 size={10} /></button>
                    </div>
                    {RULE_TYPES.find(t => t.value === rule.type)?.hasColumn && (
                      <input value={rule.column} onChange={e => updateRule(i, 'column', e.target.value)} placeholder="Column name"
                        style={{ width: '100%', background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '3px 6px', color: '#9ca3af', fontSize: 11, marginBottom: 4 }} />
                    )}
                    {rule.type === 'not_null' && <input type="number" step="0.01" max="1" min="0" value={rule.params?.max_null_rate ?? 0} onChange={e => updateParam(i, 'max_null_rate', parseFloat(e.target.value))} placeholder="Max null rate (0-1)"
                      style={{ width: '100%', background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '3px 6px', color: '#9ca3af', fontSize: 11 }} />}
                    {rule.type === 'value_range' && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="number" value={rule.params?.min ?? ''} onChange={e => updateParam(i, 'min', parseFloat(e.target.value))} placeholder="Min"
                          style={{ flex: 1, background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '3px 6px', color: '#9ca3af', fontSize: 11 }} />
                        <input type="number" value={rule.params?.max ?? ''} onChange={e => updateParam(i, 'max', parseFloat(e.target.value))} placeholder="Max"
                          style={{ flex: 1, background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '3px 6px', color: '#9ca3af', fontSize: 11 }} />
                      </div>
                    )}
                    {rule.type === 'allowed_values' && <input value={(rule.params?.values || []).join(',')} onChange={e => updateParam(i, 'values', e.target.value.split(',').map(s => s.trim()))} placeholder="val1,val2,val3"
                      style={{ width: '100%', background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '3px 6px', color: '#9ca3af', fontSize: 11 }} />}
                    {rule.type === 'row_count' && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="number" value={rule.params?.min ?? ''} onChange={e => updateParam(i, 'min', parseInt(e.target.value))} placeholder="Min rows"
                          style={{ flex: 1, background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '3px 6px', color: '#9ca3af', fontSize: 11 }} />
                        <input type="number" value={rule.params?.max ?? ''} onChange={e => updateParam(i, 'max', parseInt(e.target.value))} placeholder="Max rows"
                          style={{ flex: 1, background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '3px 6px', color: '#9ca3af', fontSize: 11 }} />
                      </div>
                    )}
                    {rule.type === 'schema_match' && <input value={(rule.params?.columns || []).join(',')} onChange={e => updateParam(i, 'columns', e.target.value.split(',').map(s => s.trim()))} placeholder="col1,col2,col3"
                      style={{ width: '100%', background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '3px 6px', color: '#9ca3af', fontSize: 11 }} />}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={create} style={{ flex: 1, padding: '8px', background: 'rgba(99,102,241,0.3)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 7, color: '#a5b4fc', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Save Contract</button>
                <button onClick={() => { setCreating(false); setRules([]); }} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#6b7280', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contracts.map(c => (
              <div key={c.id} style={{ background: selectedContractId === c.id ? 'rgba(6,182,212,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedContractId === c.id ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{typeof c.rules === 'string' ? JSON.parse(c.rules).length : c.rules?.length} rules · {c.dataset_name || 'No dataset'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {c.last_score != null && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${scoreColor(c.last_score)}22`, color: scoreColor(c.last_score) }}>{c.last_score}%</span>}
                    <button onClick={() => validate(c.id)} disabled={validating === c.id}
                      style={{ padding: '4px 10px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: '#10b981', fontSize: 11, cursor: 'pointer' }}>
                      {validating === c.id ? '…' : <Play size={10} />}
                    </button>
                    <button onClick={() => deleteContract(c.id)} style={{ padding: '4px 6px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 6, color: '#ef4444', cursor: 'pointer' }}><Trash2 size={10} /></button>
                  </div>
                </div>
              </div>
            ))}
            {!contracts.length && <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 20 }}>No contracts yet. Create one to get started.</p>}
          </div>
        </div>

        {/* Right — validation results */}
        <div>
          {/* Dataset selector for validation */}
          <div style={card}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Dataset to Validate Against</label>
            <select value={activeDataset?.id || ''} onChange={e => selectDataset(parseInt(e.target.value))}
              style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13 }}>
              <option value="">Select dataset…</option>
              {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>Select a dataset, then click ▶ on a contract to validate it.</p>
          </div>

          {validationResult && (
            <>
              {/* Score banner */}
              <div style={{ ...card, background: validationResult.passed ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${validationResult.passed ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {validationResult.passed ? <CheckCircle size={28} color="#10b981" /> : <XCircle size={28} color="#ef4444" />}
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: validationResult.passed ? '#10b981' : '#ef4444' }}>
                        {validationResult.passed ? 'Contract Passed' : `${validationResult.errors} Error${validationResult.errors !== 1 ? 's' : ''} Found`}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{validationResult.contract} → {validationResult.dataset} ({validationResult.rows_checked?.toLocaleString()} rows checked)</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: scoreColor(validationResult.score) }}>{validationResult.score}%</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>compliance</div>
                  </div>
                </div>
              </div>

              {/* Checks */}
              <div style={card}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>Check Results ({validationResult.checks?.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {validationResult.checks?.map((ch, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: ch.passed ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', borderRadius: 7, border: `1px solid ${ch.passed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
                      {ch.passed ? <CheckCircle size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 11, color: '#6b7280', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 3, marginRight: 6 }}>{ch.rule}</span>
                        {ch.column && <span style={{ fontSize: 11, color: '#a78bfa', marginRight: 6 }}>"{ch.column}"</span>}
                        <span style={{ fontSize: 12, color: '#d1d5db' }}>{ch.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Violations */}
              {validationResult.violations?.length > 0 && (
                <div style={card}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>⚠️ Violations ({validationResult.violations.length})</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {validationResult.violations.map((v, i) => {
                      const Icon = SEVERITY_ICON[v.severity] || AlertTriangle;
                      return (
                        <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: `${SEVERITY_COLOR[v.severity] || '#6b7280'}11`, borderRadius: 8, border: `1px solid ${SEVERITY_COLOR[v.severity] || '#6b7280'}33` }}>
                          <Icon size={14} color={SEVERITY_COLOR[v.severity] || '#6b7280'} style={{ flexShrink: 0, marginTop: 2 }} />
                          <div>
                            <div style={{ fontSize: 11, color: SEVERITY_COLOR[v.severity] || '#6b7280', fontWeight: 600, marginBottom: 2 }}>{v.severity.toUpperCase()} — {v.rule}</div>
                            <div style={{ fontSize: 12, color: '#d1d5db' }}>{v.message}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {!validationResult && (
            <div style={{ ...card, textAlign: 'center', padding: 60 }}>
              <FileCheck size={40} color="#374151" style={{ marginBottom: 12 }} />
              <p style={{ color: '#6b7280', margin: 0 }}>Select a dataset and click ▶ on a contract to validate your data against defined rules.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
