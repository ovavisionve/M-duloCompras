import React, { useState, useEffect } from 'react';
import { Lock, Plus, DollarSign, ArrowDownRight, ArrowUpRight, CheckCircle, XCircle, Eye, X, TrendingUp, TrendingDown } from 'lucide-react';
import api from '../api';

const statusBadge = { pendiente: 'badge-yellow', usd_recibido: 'badge-blue', completada: 'badge-green', anulada: 'badge-red' };
const statusLabel = { pendiente: 'VES Enviado', usd_recibido: 'USD Recibido', completada: 'Completada', anulada: 'Anulada' };

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
};
const fmtNum = (n) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRate = (n) => n ? Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '-';

// Calculate derived fields for an operation
function calcOpFields(op) {
  const bcv = parseFloat(op.bcv_rate) || 0;
  const ves = parseFloat(op.amount_ves) || 0;
  const usd = parseFloat(op.amount_usd) || 0;
  const usdBcv = bcv > 0 ? ves / bcv : 0;
  const diffUsd = usd > 0 ? usd - usdBcv : 0;
  const diffVes = parseFloat(op.exchange_difference) || 0;
  return { usdBcv, diffUsd, diffVes };
}

export default function Treasury() {
  const [ops, setOps] = useState([]);
  const [filters, setFilters] = useState({ status: '', from_date: '', to_date: '' });
  const [pagination, setPagination] = useState({ page: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  // Summary
  const now = new Date();
  const defaultPeriod = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const [summaryPeriod, setSummaryPeriod] = useState(defaultPeriod);
  const [summary, setSummary] = useState(null);
  const [showSummary, setShowSummary] = useState(false);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ operation_date: today, amount_ves: '', bcv_rate: '', description: '', supplier_name: '' });
  const [formError, setFormError] = useState('');

  // Receive USD modal
  const [receiveOp, setReceiveOp] = useState(null);
  const [receiveForm, setReceiveForm] = useState({ amount_usd: '', parallel_rate: '', destination_type: 'banco_usd' });
  const [receiveError, setReceiveError] = useState('');

  // Detail modal
  const [detail, setDetail] = useState(null);

  const load = () => {
    setLoading(true);
    // Clean empty params before sending
    const params = { page: pagination.page, limit: 20 };
    if (filters.status) params.status = filters.status;
    if (filters.from_date) params.from_date = filters.from_date;
    if (filters.to_date) params.to_date = filters.to_date;
    api.get('/treasury', { params })
      .then((res) => { setOps(res.data.data); setPagination((p) => ({ ...p, total: res.data.pagination?.total || 0 })); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters, pagination.page]);

  // Auto fetch BCV rate for form
  useEffect(() => {
    if (showForm) {
      api.get('/exchange-rates/today').then((r) => {
        if (r.data.data) setForm((f) => ({ ...f, bcv_rate: r.data.data.rate }));
      }).catch(() => {});
    }
  }, [showForm]);

  const loadSummary = () => {
    api.get('/treasury/summary', { params: { period: summaryPeriod } })
      .then((r) => { setSummary(r.data.data); setShowSummary(true); })
      .catch((err) => alert(err.response?.data?.error?.message || 'Error al cargar resumen'));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.amount_ves || parseFloat(form.amount_ves) <= 0) { setFormError('Ingrese monto VES válido'); return; }
    try {
      await api.post('/treasury', { ...form, amount_ves: parseFloat(form.amount_ves), bcv_rate: parseFloat(form.bcv_rate) || null });
      setShowForm(false);
      setForm({ operation_date: today, amount_ves: '', bcv_rate: '', description: '', supplier_name: '' });
      load();
    } catch (err) { setFormError(err.response?.data?.error?.message || 'Error al crear operación'); }
  };

  const openReceive = (op) => {
    setReceiveError('');
    setReceiveOp(op);
    setReceiveForm({ amount_usd: '', parallel_rate: '', destination_type: 'banco_usd' });
  };

  const handleReceive = async (e) => {
    e.preventDefault();
    setReceiveError('');
    if (!receiveForm.amount_usd || !receiveForm.parallel_rate) { setReceiveError('Monto USD y tasa paralela son requeridos'); return; }
    try {
      await api.patch(`/treasury/${receiveOp.id}/receive-usd`, {
        amount_usd: parseFloat(receiveForm.amount_usd),
        parallel_rate: parseFloat(receiveForm.parallel_rate),
        destination_type: receiveForm.destination_type,
      });
      setReceiveOp(null);
      load();
    } catch (err) { setReceiveError(err.response?.data?.error?.message || 'Error'); }
  };

  const completeOp = async (id) => {
    if (!window.confirm('Marcar operación como completada?')) return;
    try { await api.patch(`/treasury/${id}/complete`, {}); load(); }
    catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  const voidOp = async (id) => {
    const reason = window.prompt('Motivo de anulación:');
    if (!reason) return;
    try { await api.post(`/treasury/${id}/void`, { reason }); load(); }
    catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  const viewDetail = async (id) => {
    try {
      const r = await api.get(`/treasury/${id}`);
      setDetail(r.data.data);
    } catch (err) { alert('Error al cargar detalle'); }
  };

  // Helper for the receive modal preview
  const previewCalc = () => {
    if (!receiveOp || !receiveForm.amount_usd || !receiveForm.parallel_rate) return null;
    const usd = parseFloat(receiveForm.amount_usd);
    const parallel = parseFloat(receiveForm.parallel_rate);
    const bcv = parseFloat(receiveOp.bcv_rate) || 0;
    const ves = parseFloat(receiveOp.amount_ves);
    const usdBcv = bcv > 0 ? ves / bcv : 0;
    const diffUsd = usd - usdBcv;
    const costReal = usd * parallel;
    return { usd, parallel, bcv, ves, usdBcv, diffUsd, costReal };
  };

  return (
    <div>
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Lock size={22} /> Tesorería Interna
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={() => { setShowSummary(!showSummary); if (!summary) loadSummary(); }}>
            <TrendingUp size={16} /> Resumen Mensual
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} /> Nueva Operación
          </button>
        </div>
      </div>

      <div style={{ background: '#fef3c7', border: '1px solid #fde047', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#92400e' }}>
        <strong>Uso interno:</strong> Registro de compra de divisas a tasa paralela. No visible en reportes SENIAT.
        Contabilizado como Préstamos Accionistas. Muestra la diferencia entre lo que vale a tasa BCV vs lo que cuesta a tasa paralela.
      </div>

      {/* ── Monthly Summary ── */}
      {showSummary && (
        <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--info)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Resumen Mensual</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input value={summaryPeriod} onChange={(e) => setSummaryPeriod(e.target.value)} placeholder="MM/YYYY" style={{ width: '120px', padding: '0.3rem 0.5rem', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '0.85rem' }} />
              <button className="btn btn-sm btn-primary" onClick={loadSummary}>Consultar</button>
              <button className="btn btn-sm" onClick={() => setShowSummary(false)}><X size={14} /></button>
            </div>
          </div>
          {summary && (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="label">Operaciones</div>
                  <div className="value">{summary.operations_count}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Total VES Salida</div>
                  <div className="value" style={{ color: 'var(--danger)' }}>{fmtNum(summary.total_ves_out)}</div>
                </div>
                <div className="stat-card">
                  <div className="label">USD Equiv. BCV</div>
                  <div className="value" style={{ color: 'var(--gray-700)' }}>{fmtNum(summary.total_usd_equivalent_bcv)}</div>
                  <div className="sub">Lo que valdrían a tasa BCV</div>
                </div>
                <div className="stat-card">
                  <div className="label">USD Reales Comprados</div>
                  <div className="value" style={{ color: 'var(--success)' }}>{fmtNum(summary.total_usd_in)}</div>
                  <div className="sub">Lo que realmente se compró</div>
                </div>
              </div>

              {/* Main result card */}
              <div className="stats-grid">
                <div className="stat-card" style={{ borderLeft: `4px solid ${summary.diff_usd >= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
                  <div className="label">Resultado en USD</div>
                  <div className="value" style={{ color: summary.diff_usd >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {summary.diff_usd >= 0 ? '+' : ''}{fmtNum(summary.diff_usd)} USD
                  </div>
                  <div className="sub">{summary.diff_usd >= 0 ? 'Ganancia' : 'Pérdida'}: se {summary.diff_usd >= 0 ? 'compraron más USD de lo esperado' : 'compraron menos USD de lo esperado a BCV'}</div>
                </div>
                <div className="stat-card" style={{ borderLeft: `4px solid ${summary.diff_ves >= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
                  <div className="label">Resultado en VES</div>
                  <div className="value" style={{ color: summary.diff_ves >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {summary.diff_ves >= 0 ? '+' : ''}{fmtNum(summary.diff_ves)} VES
                  </div>
                  <div className="sub">Equivalente del diferencial en bolívares</div>
                </div>
              </div>

              <div className="stats-grid" style={{ marginBottom: 0 }}>
                <div className="stat-card">
                  <div className="label">Tasa Promedio Paralela</div>
                  <div className="value">{fmtRate(summary.avg_parallel_rate)}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Tasa Promedio BCV</div>
                  <div className="value">{fmtRate(summary.avg_bcv_rate)}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Spread Promedio</div>
                  <div className="value" style={{ color: 'var(--warning)' }}>
                    {summary.avg_parallel_rate && summary.avg_bcv_rate ? fmtNum(((summary.avg_parallel_rate - summary.avg_bcv_rate) / summary.avg_bcv_rate * 100)) : '0,00'}%
                  </div>
                  <div className="sub">Diferencia porcentual paralela vs BCV</div>
                </div>
              </div>

              {summary.account_balances?.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Movimientos por Cuenta:</strong>
                  <table style={{ marginTop: '0.5rem' }}>
                    <thead><tr><th>Cuenta</th><th>Débitos</th><th>Créditos</th></tr></thead>
                    <tbody>
                      {summary.account_balances.map((a) => (
                        <tr key={a.code}>
                          <td>{a.name}</td>
                          <td style={{ fontFamily: 'monospace' }}>{fmtNum(a.total_debito)}</td>
                          <td style={{ fontFamily: 'monospace' }}>{fmtNum(a.total_credito)}</td>
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

      {/* ── Create Form ── */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Paso 1: Registrar Salida de VES</h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginBottom: '1rem' }}>
            Registre la salida de bolívares para compra de divisas. Préstamos Accionista (D) / Banco VES (C)
          </p>
          {formError && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{formError}</div>}
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <div className="form-group">
                <label>Fecha *</label>
                <input type="date" value={form.operation_date} onChange={(e) => setForm({ ...form, operation_date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Monto VES *</label>
                <input type="number" step="0.01" value={form.amount_ves} onChange={(e) => setForm({ ...form, amount_ves: e.target.value })} required placeholder="Bolívares que salen" />
              </div>
              <div className="form-group">
                <label>Tasa BCV del día</label>
                <input type="number" step="0.000001" value={form.bcv_rate} onChange={(e) => setForm({ ...form, bcv_rate: e.target.value })} placeholder="Se carga automática" />
              </div>
            </div>
            {form.amount_ves && form.bcv_rate && (
              <div style={{ padding: '0.5rem 0.75rem', background: '#f0f9ff', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem', color: 'var(--info)' }}>
                A tasa BCV ({form.bcv_rate}), estos {fmtNum(form.amount_ves)} VES equivalen a <strong>{fmtNum(parseFloat(form.amount_ves) / parseFloat(form.bcv_rate))} USD</strong>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label>Proveedor / Destino</label>
                <input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} placeholder="Ej: Pago a Amadeus" />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalle de la operación" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary"><ArrowDownRight size={16} /> Registrar Salida VES</button>
              <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Estatus</label>
            <select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPagination((p) => ({ ...p, page: 1 })); }}>
              <option value="">Todos los estatus</option>
              <option value="pendiente">VES Enviado</option>
              <option value="usd_recibido">USD Recibido</option>
              <option value="completada">Completada</option>
              <option value="anulada">Anulada</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Desde</label>
            <input type="date" value={filters.from_date} onChange={(e) => { setFilters({ ...filters, from_date: e.target.value }); setPagination((p) => ({ ...p, page: 1 })); }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Hasta</label>
            <input type="date" value={filters.to_date} onChange={(e) => { setFilters({ ...filters, to_date: e.target.value }); setPagination((p) => ({ ...p, page: 1 })); }} />
          </div>
          {(filters.status || filters.from_date || filters.to_date) && (
            <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => { setFilters({ status: '', from_date: '', to_date: '' }); setPagination((p) => ({ ...p, page: 1 })); }}>
                <X size={14} /> Limpiar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Operations Table ── */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>VES Salida</th>
              <th>USD BCV</th>
              <th>USD Reales</th>
              <th>Tasa Paralela</th>
              <th>Tasa BCV</th>
              <th>Diferencial USD</th>
              <th>Estatus</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ops.map((op) => {
              const { usdBcv, diffUsd } = calcOpFields(op);
              const hasUsd = parseFloat(op.amount_usd) > 0;
              return (
                <tr key={op.id}>
                  <td>{fmtDate(op.operation_date)}</td>
                  <td>{op.supplier_name || '-'}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--danger)' }}>{fmtNum(op.amount_ves)}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--gray-700)' }}>{usdBcv > 0 ? fmtNum(usdBcv) : '-'}</td>
                  <td style={{ fontFamily: 'monospace', color: hasUsd ? 'var(--success)' : 'var(--gray-400)', fontWeight: hasUsd ? 600 : 400 }}>
                    {hasUsd ? fmtNum(op.amount_usd) : 'Pendiente'}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{fmtRate(op.parallel_rate)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{fmtRate(op.bcv_rate)}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: diffUsd > 0.01 ? 'var(--success)' : diffUsd < -0.01 ? 'var(--danger)' : 'var(--gray-400)' }}>
                    {hasUsd ? `${diffUsd > 0 ? '+' : ''}${fmtNum(diffUsd)}` : '-'}
                  </td>
                  <td><span className={`badge ${statusBadge[op.status]}`}>{statusLabel[op.status]}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-sm" onClick={() => viewDetail(op.id)} title="Ver detalle"><Eye size={14} /></button>
                      {op.status === 'pendiente' && (
                        <button className="btn btn-sm btn-primary" onClick={() => openReceive(op)} title="Registrar USD recibido">
                          <ArrowUpRight size={14} />
                        </button>
                      )}
                      {op.status === 'usd_recibido' && (
                        <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff', borderColor: 'var(--success)' }} onClick={() => completeOp(op.id)} title="Completar">
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {!['anulada', 'completada'].includes(op.status) && (
                        <button className="btn btn-sm btn-danger" onClick={() => voidOp(op.id)} title="Anular"><XCircle size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!ops.length && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>{loading ? 'Cargando...' : 'No hay operaciones'}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Receive USD Modal ── */}
      {receiveOp && (
        <div className="modal-overlay" onClick={() => setReceiveOp(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem' }}>Paso 2: Registrar USD Recibidos</h3>
              <button className="btn btn-sm" onClick={() => setReceiveOp(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--gray-50)', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div><strong>Fecha:</strong> {fmtDate(receiveOp.operation_date)}</div>
              <div><strong>VES Enviado:</strong> {fmtNum(receiveOp.amount_ves)}</div>
              <div><strong>Tasa BCV:</strong> {fmtRate(receiveOp.bcv_rate)}</div>
              {receiveOp.bcv_rate && <div><strong>USD Equivalente BCV:</strong> {fmtNum(parseFloat(receiveOp.amount_ves) / parseFloat(receiveOp.bcv_rate))} USD</div>}
              {receiveOp.supplier_name && <div><strong>Proveedor:</strong> {receiveOp.supplier_name}</div>}
            </div>

            {receiveError && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{receiveError}</div>}
            <form onSubmit={handleReceive}>
              <div className="form-row">
                <div className="form-group">
                  <label>USD Realmente Recibidos *</label>
                  <input type="number" step="0.01" value={receiveForm.amount_usd} onChange={(e) => setReceiveForm({ ...receiveForm, amount_usd: e.target.value })} required placeholder="Dólares que llegaron" />
                </div>
                <div className="form-group">
                  <label>Tasa Paralela (VES/USD) *</label>
                  <input type="number" step="0.000001" value={receiveForm.parallel_rate} onChange={(e) => setReceiveForm({ ...receiveForm, parallel_rate: e.target.value })} required placeholder="Tasa real de compra" />
                </div>
              </div>

              {/* Live preview of the calculation */}
              {(() => {
                const p = previewCalc();
                if (!p) return null;
                return (
                  <div style={{ padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', border: '2px solid', borderColor: p.diffUsd >= 0 ? 'var(--success)' : 'var(--danger)', background: p.diffUsd >= 0 ? '#f0fdf4' : '#fef2f2' }}>
                    <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                      <strong>Costo real:</strong> {fmtNum(p.usd)} USD x {fmtRate(p.parallel)} = {fmtNum(p.costReal)} VES
                    </div>
                    {p.bcv > 0 && (
                      <>
                        <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                          <strong>USD equiv. BCV:</strong> {fmtNum(p.ves)} VES / {fmtRate(p.bcv)} = {fmtNum(p.usdBcv)} USD
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: p.diffUsd >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {p.diffUsd >= 0 ? 'GANANCIA' : 'PÉRDIDA'}: {p.diffUsd >= 0 ? '+' : ''}{fmtNum(p.diffUsd)} USD
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                          {p.diffUsd >= 0
                            ? `Recibiste ${fmtNum(p.usd)} USD pero a BCV solo equivalían ${fmtNum(p.usdBcv)} USD`
                            : `A tasa BCV debías recibir ${fmtNum(p.usdBcv)} USD pero solo llegaron ${fmtNum(p.usd)} USD`
                          }
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              <div className="form-group">
                <label>Destino</label>
                <select value={receiveForm.destination_type} onChange={(e) => setReceiveForm({ ...receiveForm, destination_type: e.target.value })}>
                  <option value="banco_usd">Banco USD</option>
                  <option value="caja_usd">Caja USD</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary"><ArrowUpRight size={16} /> Registrar USD</button>
                <button type="button" className="btn" onClick={() => setReceiveOp(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem' }}>Detalle de Operación</h3>
              <button className="btn btn-sm" onClick={() => setDetail(null)}><X size={16} /></button>
            </div>
            <div className="form-row">
              <div><strong>Fecha:</strong> {fmtDate(detail.operation_date)}</div>
              <div><strong>Estatus:</strong> <span className={`badge ${statusBadge[detail.status]}`}>{statusLabel[detail.status]}</span></div>
              {detail.supplier_name && <div><strong>Proveedor:</strong> {detail.supplier_name}</div>}
            </div>

            {/* Financial summary */}
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.75rem', textTransform: 'uppercase' }}>VES Salida</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600, color: 'var(--danger)' }}>{fmtNum(detail.amount_ves)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Tasa BCV</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600 }}>{fmtRate(detail.bcv_rate)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.75rem', textTransform: 'uppercase' }}>USD Equiv. BCV</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600, color: 'var(--gray-700)' }}>{detail.usd_equivalent_bcv ? fmtNum(detail.usd_equivalent_bcv) : '-'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Tasa Paralela</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600 }}>{fmtRate(detail.parallel_rate)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.75rem', textTransform: 'uppercase' }}>USD Reales</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600, color: parseFloat(detail.amount_usd) > 0 ? 'var(--success)' : 'var(--gray-400)' }}>
                    {parseFloat(detail.amount_usd) > 0 ? fmtNum(detail.amount_usd) : 'Pendiente'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Destino</div>
                  <div style={{ fontSize: '0.9rem' }}>{detail.destination_type === 'caja_usd' ? 'Caja USD' : detail.destination_type === 'banco_usd' ? 'Banco USD' : '-'}</div>
                </div>
              </div>
            </div>

            {/* Exchange difference result */}
            {parseFloat(detail.amount_usd) > 0 && detail.usd_equivalent_bcv > 0 && (
              <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px', border: '2px solid', borderColor: detail.diff_usd >= 0 ? 'var(--success)' : 'var(--danger)', background: detail.diff_usd >= 0 ? '#f0fdf4' : '#fef2f2' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--gray-500)', marginBottom: '0.25rem' }}>Resultado de la operación</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {detail.diff_usd >= 0 ? <TrendingUp size={24} color="var(--success)" /> : <TrendingDown size={24} color="var(--danger)" />}
                  <span style={{ fontWeight: 700, fontSize: '1.3rem', color: detail.diff_usd >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {detail.diff_usd >= 0 ? '+' : ''}{fmtNum(detail.diff_usd)} USD
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
                    ({fmtNum(parseFloat(detail.exchange_difference))} VES)
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
                  Enviaste {fmtNum(detail.amount_ves)} VES que a BCV ({fmtRate(detail.bcv_rate)}) equivalen a {fmtNum(detail.usd_equivalent_bcv)} USD.
                  Compraste {fmtNum(detail.amount_usd)} USD a tasa paralela de {fmtRate(detail.parallel_rate)}.
                  {detail.diff_usd < 0
                    ? ` Perdiste ${fmtNum(Math.abs(detail.diff_usd))} USD por la diferencia de tasas.`
                    : ` Ganaste ${fmtNum(detail.diff_usd)} USD respecto a la tasa oficial.`
                  }
                </div>
              </div>
            )}

            {detail.description && <div style={{ marginTop: '0.75rem' }}><strong>Descripción:</strong> {detail.description}</div>}
            {detail.notes && <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--gray-500)' }}><strong>Notas:</strong> {detail.notes}</div>}

            {/* Ledger entries */}
            {detail.ledger?.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <strong style={{ fontSize: '0.85rem' }}>Asientos Contables Internos:</strong>
                <table style={{ marginTop: '0.5rem' }}>
                  <thead>
                    <tr><th>Cuenta</th><th>Débito</th><th>Crédito</th><th>Moneda</th><th>Detalle</th></tr>
                  </thead>
                  <tbody>
                    {detail.ledger.map((l) => (
                      <tr key={l.id}>
                        <td>{l.account_name}</td>
                        <td style={{ fontFamily: 'monospace' }}>{l.movement_type === 'debito' ? fmtNum(l.amount) : ''}</td>
                        <td style={{ fontFamily: 'monospace' }}>{l.movement_type === 'credito' ? fmtNum(l.amount) : ''}</td>
                        <td>{l.currency}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--gray-500)' }}>{l.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
