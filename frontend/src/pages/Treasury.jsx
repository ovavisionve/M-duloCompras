import React, { useState, useEffect } from 'react';
import { Lock, Plus, XCircle, Eye, X, TrendingUp, TrendingDown } from 'lucide-react';
import api from '../api';

const statusBadge = { completada: 'badge-green', anulada: 'badge-red' };
const statusLabel = { completada: 'Completada', anulada: 'Anulada', pendiente: 'Pendiente', usd_recibido: 'USD Recibido' };

const purchaseTypes = {
  efectivo: 'Efectivo USD', zelle: 'Zelle', paypal: 'PayPal',
  binance: 'Binance (USDT)', euro: 'Euros', cripto_otro: 'Cripto Otro',
  transferencia_usd: 'Transferencia USD',
};

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
};
const fmtNum = (n) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRate = (n) => n ? Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '-';

export default function Treasury() {
  const [ops, setOps] = useState([]);
  const [filters, setFilters] = useState({ status: '', from_date: '', to_date: '', purchase_type: '' });
  const [pagination, setPagination] = useState({ page: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  // Suppliers
  const [suppliers, setSuppliers] = useState([]);

  // Summary
  const now = new Date();
  const defaultPeriod = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const [summaryPeriod, setSummaryPeriod] = useState(defaultPeriod);
  const [summary, setSummary] = useState(null);
  const [showSummary, setShowSummary] = useState(false);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    operation_date: today, amount_ves: '', bcv_rate: '', purchase_rate: '',
    purchase_type: 'efectivo', supplier_id: '', description: '', destination_type: 'banco_usd',
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Detail modal
  const [detail, setDetail] = useState(null);

  const load = () => {
    setLoading(true);
    const params = { page: pagination.page, limit: 20 };
    if (filters.status) params.status = filters.status;
    if (filters.from_date) params.from_date = filters.from_date;
    if (filters.to_date) params.to_date = filters.to_date;
    if (filters.purchase_type) params.purchase_type = filters.purchase_type;
    api.get('/treasury', { params })
      .then((res) => { setOps(res.data.data); setPagination((p) => ({ ...p, total: res.data.pagination?.total || 0 })); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters, pagination.page]);

  // Load suppliers once
  useEffect(() => {
    api.get('/treasury/suppliers').then((r) => setSuppliers(r.data.data || [])).catch(() => {});
  }, []);

  // Auto fetch BCV rate when form opens
  useEffect(() => {
    if (showForm) {
      api.get('/exchange-rates/today').then((r) => {
        if (r.data.data) setForm((f) => ({ ...f, bcv_rate: String(r.data.data.rate) }));
      }).catch(() => {});
    }
  }, [showForm]);

  const loadSummary = () => {
    api.get('/treasury/summary', { params: { period: summaryPeriod } })
      .then((r) => { setSummary(r.data.data); setShowSummary(true); })
      .catch((err) => alert(err.response?.data?.error?.message || 'Error al cargar resumen'));
  };

  // Live calculation preview
  const calcPreview = () => {
    const ves = parseFloat(form.amount_ves) || 0;
    const bcv = parseFloat(form.bcv_rate) || 0;
    const pRate = parseFloat(form.purchase_rate) || 0;
    if (ves <= 0 || bcv <= 0) return null;
    const usdBcv = ves / bcv;
    const usdReal = pRate > 0 ? ves / pRate : 0;
    const diffUsd = pRate > 0 ? usdReal - usdBcv : 0;
    return { ves, bcv, pRate, usdBcv, usdReal, diffUsd, hasPurchase: pRate > 0 };
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    const ves = parseFloat(form.amount_ves);
    const bcv = parseFloat(form.bcv_rate);
    const pRate = parseFloat(form.purchase_rate);
    if (!ves || ves <= 0) { setFormError('Ingrese monto VES válido'); return; }
    if (!bcv || bcv <= 0) { setFormError('La tasa BCV es requerida'); return; }
    if (!pRate || pRate <= 0) { setFormError('Ingrese la tasa de compra'); return; }
    setSubmitting(true);
    try {
      await api.post('/treasury', {
        ...form, amount_ves: ves, bcv_rate: bcv, purchase_rate: pRate,
        supplier_id: form.supplier_id || null,
      });
      setShowForm(false);
      setForm({ operation_date: today, amount_ves: '', bcv_rate: '', purchase_rate: '', purchase_type: 'efectivo', supplier_id: '', description: '', destination_type: 'banco_usd' });
      load();
    } catch (err) {
      setFormError(err.response?.data?.error?.message || 'Error al crear operación');
    } finally { setSubmitting(false); }
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

  const resetFilters = () => { setFilters({ status: '', from_date: '', to_date: '', purchase_type: '' }); setPagination((p) => ({ ...p, page: 1 })); };
  const hasFilters = filters.status || filters.from_date || filters.to_date || filters.purchase_type;

  return (
    <div>
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Lock size={22} /> Tesorería Interna
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={() => { setShowSummary(!showSummary); if (!summary) loadSummary(); }}>
            <TrendingUp size={16} /> Resumen
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} /> Comprar Divisas
          </button>
        </div>
      </div>

      <div style={{ background: '#fef3c7', border: '1px solid #fde047', borderRadius: '8px', padding: '0.6rem 1rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#92400e' }}>
        <strong>Uso interno:</strong> Compra de divisas a tasa paralela. No visible en reportes SENIAT. Contabilizado como Préstamos Accionistas.
      </div>

      {/* ── Summary ── */}
      {showSummary && (
        <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--info)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Resumen Mensual</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input value={summaryPeriod} onChange={(e) => setSummaryPeriod(e.target.value)} placeholder="MM/YYYY" style={{ width: '110px', padding: '0.3rem 0.5rem', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '0.85rem' }} />
              <button className="btn btn-sm btn-primary" onClick={loadSummary}>Ver</button>
              <button className="btn btn-sm" onClick={() => setShowSummary(false)}><X size={14} /></button>
            </div>
          </div>
          {summary && (
            <>
              <div className="stats-grid">
                <div className="stat-card"><div className="label">Operaciones</div><div className="value">{summary.operations_count}</div></div>
                <div className="stat-card"><div className="label">VES Total Salida</div><div className="value" style={{ color: 'var(--danger)' }}>{fmtNum(summary.total_ves_out)}</div></div>
                <div className="stat-card"><div className="label">USD a Tasa BCV</div><div className="value" style={{ color: 'var(--gray-700)' }}>{fmtNum(summary.total_usd_equivalent_bcv)}</div><div className="sub">Lo que "valdrían" a BCV</div></div>
                <div className="stat-card"><div className="label">USD Reales Comprados</div><div className="value" style={{ color: 'var(--success)' }}>{fmtNum(summary.total_usd_in)}</div><div className="sub">Lo que realmente compraste</div></div>
              </div>
              <div className="stats-grid">
                <div className="stat-card" style={{ borderLeft: `4px solid ${summary.diff_usd >= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
                  <div className="label">Resultado USD</div>
                  <div className="value" style={{ color: summary.diff_usd >= 0 ? 'var(--success)' : 'var(--danger)' }}>{summary.diff_usd >= 0 ? '+' : ''}{fmtNum(summary.diff_usd)} USD</div>
                  <div className="sub">{summary.diff_usd >= 0 ? 'Ganancia' : 'Pérdida'} por diferencial de tasas</div>
                </div>
                <div className="stat-card"><div className="label">Tasa Prom. Compra</div><div className="value">{fmtRate(summary.avg_purchase_rate)}</div></div>
                <div className="stat-card"><div className="label">Tasa Prom. BCV</div><div className="value">{fmtRate(summary.avg_bcv_rate)}</div></div>
                <div className="stat-card"><div className="label">Spread</div><div className="value" style={{ color: 'var(--warning)' }}>{summary.avg_purchase_rate && summary.avg_bcv_rate ? fmtNum(((summary.avg_purchase_rate - summary.avg_bcv_rate) / summary.avg_bcv_rate) * 100) : '0,00'}%</div></div>
              </div>
              {/* By type */}
              {Object.keys(summary.by_purchase_type || {}).length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Por tipo de compra:</strong>
                  <table style={{ marginTop: '0.5rem' }}>
                    <thead><tr><th>Tipo</th><th>Ops</th><th>VES</th><th>USD</th><th>Dif. USD</th></tr></thead>
                    <tbody>{Object.entries(summary.by_purchase_type).map(([type, d]) => (
                      <tr key={type}>
                        <td>{purchaseTypes[type] || type}</td>
                        <td>{d.count}</td>
                        <td style={{ fontFamily: 'monospace' }}>{fmtNum(d.total_ves)}</td>
                        <td style={{ fontFamily: 'monospace' }}>{fmtNum(d.total_usd)}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600, color: d.diff_usd >= 0 ? 'var(--success)' : 'var(--danger)' }}>{d.diff_usd >= 0 ? '+' : ''}{fmtNum(d.diff_usd)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              {summary.account_balances?.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Cuentas contables:</strong>
                  <table style={{ marginTop: '0.5rem' }}>
                    <thead><tr><th>Cuenta</th><th>Débitos</th><th>Créditos</th></tr></thead>
                    <tbody>{summary.account_balances.map((a) => (
                      <tr key={a.code}><td>{a.name}</td><td style={{ fontFamily: 'monospace' }}>{fmtNum(a.total_debito)}</td><td style={{ fontFamily: 'monospace' }}>{fmtNum(a.total_credito)}</td></tr>
                    ))}</tbody>
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
          <h3 style={{ marginBottom: '0.75rem' }}>Registrar Compra de Divisas</h3>
          {formError && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{formError}</div>}
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <div className="form-group">
                <label>Fecha *</label>
                <input type="date" value={form.operation_date} onChange={(e) => setForm({ ...form, operation_date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Tipo de Compra *</label>
                <select value={form.purchase_type} onChange={(e) => setForm({ ...form, purchase_type: e.target.value })}>
                  {Object.entries(purchaseTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Proveedor / Destino *</label>
                <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">-- Seleccionar proveedor --</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.business_name} ({s.rif})</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Monto VES (Bolívares que salen) *</label>
                <input type="number" step="0.01" value={form.amount_ves} onChange={(e) => setForm({ ...form, amount_ves: e.target.value })} required placeholder="Ej: 1000000" />
              </div>
              <div className="form-group">
                <label>Tasa BCV del día (fija)</label>
                <input type="number" step="0.000001" value={form.bcv_rate} onChange={(e) => setForm({ ...form, bcv_rate: e.target.value })} required style={{ background: '#f0f9ff' }} />
              </div>
              <div className="form-group">
                <label>Tasa de Compra ({purchaseTypes[form.purchase_type] || 'Paralela'}) *</label>
                <input type="number" step="0.000001" value={form.purchase_rate} onChange={(e) => setForm({ ...form, purchase_rate: e.target.value })} required placeholder="Tasa real a la que compras" style={{ border: '2px solid var(--warning)' }} />
              </div>
            </div>

            {/* ── Live comparison ── */}
            {(() => {
              const p = calcPreview();
              if (!p) return null;
              return (
                <div style={{ padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '2px solid', borderColor: p.hasPurchase ? (p.diffUsd >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--info)', background: p.hasPurchase ? (p.diffUsd >= 0 ? '#f0fdf4' : '#fef2f2') : '#f0f9ff' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
                    <div>
                      <div style={{ color: 'var(--gray-500)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Si compraras a tasa BCV ({fmtRate(p.bcv)})</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: 'var(--gray-700)' }}>{fmtNum(p.usdBcv)} USD</div>
                    </div>
                    {p.hasPurchase && (
                      <div>
                        <div style={{ color: 'var(--gray-500)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Comprando a tasa {fmtRate(p.pRate)} ({purchaseTypes[form.purchase_type] || ''})</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: p.diffUsd >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtNum(p.usdReal)} USD</div>
                      </div>
                    )}
                  </div>
                  {p.hasPurchase && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {p.diffUsd >= 0 ? <TrendingUp size={20} color="var(--success)" /> : <TrendingDown size={20} color="var(--danger)" />}
                        <span style={{ fontWeight: 700, fontSize: '1.2rem', color: p.diffUsd >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {p.diffUsd >= 0 ? 'GANANCIA' : 'PÉRDIDA'}: {p.diffUsd >= 0 ? '+' : ''}{fmtNum(p.diffUsd)} USD
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                        Con {fmtNum(p.ves)} VES: a BCV serían {fmtNum(p.usdBcv)} USD, pero a {purchaseTypes[form.purchase_type] || 'tasa paralela'} ({fmtRate(p.pRate)}) {p.diffUsd >= 0 ? 'obtienes' : 'solo consigues'} {fmtNum(p.usdReal)} USD.
                        {p.diffUsd < 0 ? ` Pierdes ${fmtNum(Math.abs(p.diffUsd))} USD por la diferencia de tasas.` : ` Ganas ${fmtNum(p.diffUsd)} USD respecto a BCV.`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="form-row">
              <div className="form-group">
                <label>Destino</label>
                <select value={form.destination_type} onChange={(e) => setForm({ ...form, destination_type: e.target.value })}>
                  <option value="banco_usd">Banco USD</option>
                  <option value="caja_usd">Caja USD</option>
                </select>
              </div>
              <div className="form-group">
                <label>Descripción / Nota</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalle adicional" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Registrando...' : 'Registrar Compra'}</button>
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
              <option value="">Todos</option>
              <option value="completada">Completada</option>
              <option value="anulada">Anulada</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Tipo</label>
            <select value={filters.purchase_type} onChange={(e) => { setFilters({ ...filters, purchase_type: e.target.value }); setPagination((p) => ({ ...p, page: 1 })); }}>
              <option value="">Todos</option>
              {Object.entries(purchaseTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
          {hasFilters && (
            <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-sm" onClick={resetFilters}><X size={14} /> Limpiar</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Proveedor</th>
              <th>VES</th>
              <th>USD BCV</th>
              <th>USD Real</th>
              <th>Tasa BCV</th>
              <th>Tasa Compra</th>
              <th>Dif. USD</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ops.map((op) => {
              const bcv = parseFloat(op.bcv_rate) || 0;
              const ves = parseFloat(op.amount_ves) || 0;
              const usd = parseFloat(op.amount_usd) || 0;
              const usdBcv = bcv > 0 ? ves / bcv : 0;
              const diffUsd = parseFloat(op.diff_usd) || (usd > 0 ? usd - usdBcv : 0);
              return (
                <tr key={op.id} style={op.status === 'anulada' ? { opacity: 0.5 } : {}}>
                  <td>{fmtDate(op.operation_date)}</td>
                  <td><span className="badge badge-gray">{purchaseTypes[op.purchase_type] || op.purchase_type || '-'}</span></td>
                  <td>{op.supplier_business_name || op.supplier_name || '-'}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--danger)' }}>{fmtNum(ves)}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--gray-500)' }}>{usdBcv > 0 ? fmtNum(usdBcv) : '-'}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--success)' }}>{usd > 0 ? fmtNum(usd) : '-'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{fmtRate(op.bcv_rate)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{fmtRate(op.purchase_rate || op.parallel_rate)}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: diffUsd > 0.01 ? 'var(--success)' : diffUsd < -0.01 ? 'var(--danger)' : 'var(--gray-400)' }}>
                    {diffUsd !== 0 ? `${diffUsd > 0 ? '+' : ''}${fmtNum(diffUsd)}` : '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-sm" onClick={() => viewDetail(op.id)} title="Ver detalle"><Eye size={14} /></button>
                      {op.status !== 'anulada' && (
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
              <div><strong>Tipo:</strong> {purchaseTypes[detail.purchase_type] || detail.purchase_type || '-'}</div>
              <div><strong>Estatus:</strong> <span className={`badge ${statusBadge[detail.status] || 'badge-gray'}`}>{statusLabel[detail.status]}</span></div>
            </div>
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <div><strong>Proveedor:</strong> {detail.supplier_business_name || detail.supplier_name || '-'}</div>
              {detail.description && <div><strong>Nota:</strong> {detail.description}</div>}
            </div>

            {/* Financial grid */}
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.72rem', textTransform: 'uppercase' }}>VES Salida</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600, color: 'var(--danger)' }}>{fmtNum(detail.amount_ves)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Tasa BCV</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600 }}>{fmtRate(detail.bcv_rate)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.72rem', textTransform: 'uppercase' }}>USD a BCV</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600, color: 'var(--gray-700)' }}>{fmtNum(detail.usd_equivalent_bcv)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Tasa Compra</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600, color: 'var(--warning)' }}>{fmtRate(detail.purchase_rate || detail.parallel_rate)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.72rem', textTransform: 'uppercase' }}>USD Reales</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600, color: 'var(--success)' }}>{fmtNum(detail.amount_usd)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Destino</div>
                  <div style={{ fontSize: '0.9rem' }}>{detail.destination_type === 'caja_usd' ? 'Caja USD' : 'Banco USD'}</div>
                </div>
              </div>
            </div>

            {/* Result */}
            {parseFloat(detail.amount_usd) > 0 && (
              <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px', border: '2px solid', borderColor: parseFloat(detail.diff_usd) >= 0 ? 'var(--success)' : 'var(--danger)', background: parseFloat(detail.diff_usd) >= 0 ? '#f0fdf4' : '#fef2f2' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {parseFloat(detail.diff_usd) >= 0 ? <TrendingUp size={24} color="var(--success)" /> : <TrendingDown size={24} color="var(--danger)" />}
                  <span style={{ fontWeight: 700, fontSize: '1.3rem', color: parseFloat(detail.diff_usd) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {parseFloat(detail.diff_usd) >= 0 ? '+' : ''}{fmtNum(detail.diff_usd)} USD
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>({fmtNum(detail.exchange_difference)} VES)</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
                  {fmtNum(detail.amount_ves)} VES a BCV ({fmtRate(detail.bcv_rate)}) = {fmtNum(detail.usd_equivalent_bcv)} USD.
                  {' '}A {purchaseTypes[detail.purchase_type] || 'tasa paralela'} ({fmtRate(detail.purchase_rate || detail.parallel_rate)}) = {fmtNum(detail.amount_usd)} USD.
                  {parseFloat(detail.diff_usd) < 0
                    ? ` Pérdida de ${fmtNum(Math.abs(parseFloat(detail.diff_usd)))} USD.`
                    : ` Ganancia de ${fmtNum(detail.diff_usd)} USD.`}
                </div>
              </div>
            )}

            {detail.notes && <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--gray-500)' }}><strong>Notas:</strong> {detail.notes}</div>}

            {/* Ledger */}
            {detail.ledger?.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <strong style={{ fontSize: '0.85rem' }}>Asientos Contables:</strong>
                <table style={{ marginTop: '0.5rem' }}>
                  <thead><tr><th>Cuenta</th><th>Débito</th><th>Crédito</th><th>Moneda</th><th>Detalle</th></tr></thead>
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
