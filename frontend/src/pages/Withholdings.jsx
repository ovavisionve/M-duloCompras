import React, { useState, useEffect } from 'react';
import { Plus, Download, XCircle, Eye, FileText } from 'lucide-react';
import api, { downloadFile } from '../api';
import { fmtNum, fmtDate } from '../utils/format';

export default function Withholdings() {
  const [withholdings, setWithholdings] = useState([]);
  const [filters, setFilters] = useState({ type: '', fiscal_period: '', status: 'activa' });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);

  // Form state
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ type: 'IVA', withholding_date: today, exchange_rate: '', withholding_rule_id: '', rate: '' });
  const [rules, setRules] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [supplierInvoices, setSupplierInvoices] = useState([]);
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/withholdings', { params: { ...filters, limit: 50 } })
      .then((r) => setWithholdings(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters]);

  // Load rules, suppliers, and exchange rate when form opens
  useEffect(() => {
    if (!showForm) return;
    api.get('/withholdings/rules').then((r) => setRules(r.data.data)).catch(console.error);
    api.get('/suppliers', { params: { limit: 200 } }).then((r) => setSuppliers(r.data.data)).catch(console.error);
    api.get('/exchange-rates/today').then((r) => {
      if (r.data.data) setForm((f) => ({ ...f, exchange_rate: r.data.data.rate }));
    }).catch(() => {});
  }, [showForm]);

  // Load invoices when supplier changes
  useEffect(() => {
    if (!selectedSupplier) { setSupplierInvoices([]); return; }
    setInvoicesLoading(true);
    api.get('/invoices', { params: { limit: 200 } })
      .then((r) => {
        const forSupplier = (r.data.data || []).filter((inv) =>
          inv.supplier_id === selectedSupplier && ['registrada', 'pago_parcial'].includes(inv.status)
        );
        setSupplierInvoices(forSupplier);
      })
      .catch(console.error)
      .finally(() => setInvoicesLoading(false));
  }, [selectedSupplier]);

  // Auto-set rate when rule is selected
  const handleRuleChange = (ruleId) => {
    const rule = rules.find((r) => r.id === ruleId);
    setForm((f) => ({ ...f, withholding_rule_id: ruleId, rate: rule ? String(rule.rate) : '' }));
  };

  // Filter rules by type and supplier taxpayer type
  const supplierObj = suppliers.find((s) => s.id === selectedSupplier);
  const supplierType = supplierObj?.rif?.startsWith('J') || supplierObj?.rif?.startsWith('G') ? 'juridica' : 'natural';
  const filteredRules = rules.filter((r) => r.type === form.type && (r.applies_to === 'ambos' || r.applies_to === supplierType));

  // Calculate preview
  const calculatePreview = () => {
    if (!selectedInvoices.length || !form.rate) return null;
    const rate = parseFloat(form.rate);
    const invoices = supplierInvoices.filter((inv) => selectedInvoices.includes(inv.id));
    let totalBase = 0;
    const details = invoices.map((inv) => {
      const base = form.type === 'IVA' ? parseFloat(inv.vat_amount || 0) : parseFloat(inv.total_amount || 0);
      const withheld = Math.round(base * rate / 100 * 100) / 100;
      totalBase += base;
      return { invoice_number: inv.invoice_number, base, withheld };
    });
    const totalWithheld = Math.round(totalBase * rate / 100 * 100) / 100;
    return { details, totalBase, totalWithheld };
  };
  const preview = calculatePreview();

  const toggleInvoice = (id) => {
    setSelectedInvoices((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!selectedInvoices.length) { setFormError('Seleccione al menos una factura.'); return; }
    if (!form.rate) { setFormError('Seleccione una regla o indique el porcentaje.'); return; }

    setSubmitting(true);
    try {
      await api.post('/withholdings', {
        type: form.type,
        rate: parseFloat(form.rate),
        exchange_rate: parseFloat(form.exchange_rate),
        withholding_date: form.withholding_date,
        withholding_rule_id: form.withholding_rule_id || null,
        invoice_ids: selectedInvoices,
      });
      setShowForm(false);
      setSelectedInvoices([]);
      setSelectedSupplier('');
      setForm({ type: 'IVA', withholding_date: today, exchange_rate: '', withholding_rule_id: '', rate: '' });
      load();
    } catch (err) {
      setFormError(err.response?.data?.error?.message || 'Error al crear retención');
    } finally {
      setSubmitting(false);
    }
  };

  const viewDetail = async (id) => {
    try {
      const { data } = await api.get(`/withholdings/${id}`);
      setDetail(data.data);
    } catch (err) { console.error(err); }
  };

  const voidWithholding = async (id) => {
    const reason = prompt('Motivo de anulación:');
    if (!reason) return;
    try {
      await api.post(`/withholdings/${id}/void`, { reason });
      setDetail(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error');
    }
  };

  const downloadPdf = (id, voucher) => {
    downloadFile(`/api/v1/withholdings/${id}/pdf`, `retencion_${voucher || id}.pdf`);
  };

  const exportSeniat = (type) => {
    const period = filters.fiscal_period || prompt('Período fiscal (MM/YYYY):');
    if (!period) return;
    downloadFile(`/api/v1/withholdings/export?period=${period}&type=${type}`, `retenciones_${type}_${period.replace('/', '-')}.txt`);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Retenciones</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={() => exportSeniat('IVA')} title="Exportar IVA TXT"><FileText size={14} /> TXT IVA</button>
          <button className="btn" onClick={() => exportSeniat('ISLR')} title="Exportar ISLR TXT"><FileText size={14} /> TXT ISLR</button>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancelar' : <><Plus size={16} /> Nueva Retención</>}
          </button>
        </div>
      </div>

      {/* ── Creation Form ── */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--primary)' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>Registrar Retención</h3>
          {formError && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{formError}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Tipo de Retención *</label>
                <select value={form.type} onChange={(e) => { setForm({ ...form, type: e.target.value, withholding_rule_id: '', rate: '' }); setSelectedInvoices([]); }}>
                  <option value="IVA">IVA</option>
                  <option value="ISLR">ISLR</option>
                </select>
              </div>
              <div className="form-group">
                <label>Proveedor *</label>
                <select value={selectedSupplier} onChange={(e) => { setSelectedSupplier(e.target.value); setSelectedInvoices([]); }}>
                  <option value="">Seleccione proveedor...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.rif} - {s.business_name} ({s.rif?.startsWith('J') || s.rif?.startsWith('G') ? 'PJ' : 'PN'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Fecha Retención *</label>
                <input type="date" value={form.withholding_date} onChange={(e) => setForm({ ...form, withholding_date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Tasa BCV *</label>
                <input type="number" step="0.000001" value={form.exchange_rate} onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })} required />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Concepto / Regla de Retención *</label>
                <select value={form.withholding_rule_id} onChange={(e) => handleRuleChange(e.target.value)}>
                  <option value="">Seleccione concepto...</option>
                  {filteredRules.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.concept_name} ({r.rate}%)
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Porcentaje (%)</label>
                <input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="Auto desde regla" />
              </div>
            </div>

            {/* ── Invoice Selection ── */}
            {selectedSupplier && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
                <strong style={{ fontSize: '0.9rem' }}>Facturas del Proveedor</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: '0.5rem' }}>
                  {form.type === 'IVA' ? 'Base = Monto IVA de la factura' : 'Base = Monto total de la factura'}
                </div>

                {invoicesLoading && <div style={{ color: 'var(--gray-500)', fontSize: '0.85rem', padding: '0.5rem' }}>Cargando facturas...</div>}

                {!invoicesLoading && supplierInvoices.length === 0 && (
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.85rem', padding: '0.5rem' }}>No hay facturas pendientes para este proveedor.</div>
                )}

                {supplierInvoices.map((inv) => (
                  <label key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedInvoices.includes(inv.id)} onChange={() => toggleInvoice(inv.id)} />
                    <span style={{ fontFamily: 'monospace' }}>{inv.invoice_number}</span>
                    <span style={{ color: 'var(--gray-500)' }}>|</span>
                    <span>Total: {fmtNum(inv.total_amount)} {inv.currency}</span>
                    {form.type === 'IVA' && <span style={{ color: 'var(--gray-500)' }}>| IVA: {fmtNum(inv.vat_amount || 0)}</span>}
                    <span style={{ color: 'var(--gray-500)' }}>| {fmtDate(inv.emission_date)}</span>
                  </label>
                ))}

                {/* Preview */}
                {preview && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--gray-200)', fontSize: '0.85rem' }}>
                    <strong>Vista previa de retención:</strong>
                    {preview.details.map((d, i) => (
                      <div key={i} style={{ marginLeft: '1rem', color: 'var(--gray-700)' }}>
                        {d.invoice_number}: Base {fmtNum(d.base)} x {form.rate}% = <strong>{fmtNum(d.withheld)}</strong>
                      </div>
                    ))}
                    <div style={{ marginTop: '0.5rem', fontWeight: 'bold' }}>
                      Total Base: {fmtNum(preview.totalBase)} | Total Retenido: {fmtNum(preview.totalWithheld)}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Registrando...' : 'Registrar Retención'}
              </button>
              <button type="button" className="btn" onClick={() => { setShowForm(false); setFormError(''); setSelectedInvoices([]); setSelectedSupplier(''); }}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Detail Panel ── */}
      {detail && (
        <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Detalle de Retención</h3>
            <button className="btn btn-sm" onClick={() => setDetail(null)}>Cerrar</button>
          </div>
          <div className="form-row">
            <div><strong>Comprobante:</strong> {detail.voucher_number}</div>
            <div><strong>Tipo:</strong> <span className={`badge ${detail.type === 'ISLR' ? 'badge-blue' : 'badge-orange'}`}>{detail.type}</span></div>
            <div><strong>Fecha:</strong> {fmtDate(detail.withholding_date)}</div>
            <div><strong>Período:</strong> {detail.fiscal_period}</div>
          </div>
          <div className="form-row" style={{ marginTop: '0.5rem' }}>
            <div><strong>Proveedor:</strong> {detail.supplier_name} ({detail.supplier_rif})</div>
            <div><strong>Base:</strong> {fmtNum(detail.base_amount)}</div>
            <div><strong>Tasa:</strong> {detail.rate}%</div>
            <div><strong>Estado:</strong> <span className={`badge ${detail.status === 'activa' ? 'badge-green' : 'badge-red'}`}>{detail.status}</span></div>
          </div>
          <div className="form-row" style={{ marginTop: '0.5rem' }}>
            <div><strong>Monto VES:</strong> {fmtNum(detail.amount_ves)}</div>
            <div><strong>Monto USD:</strong> {fmtNum(detail.amount_usd)}</div>
            <div><strong>Tasa BCV:</strong> {detail.exchange_rate}</div>
          </div>

          {detail.invoices?.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <strong>Facturas asociadas:</strong>
              {detail.invoices.map((inv, i) => (
                <div key={i} style={{ fontSize: '0.85rem', color: 'var(--gray-700)', marginLeft: '1rem' }}>
                  {inv.invoice_number} | Base: {fmtNum(inv.base_amount)} | Retenido: {fmtNum(inv.withheld_amount)}
                </div>
              ))}
            </div>
          )}

          {detail.void_reason && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--danger)' }}>
              <strong>Motivo anulación:</strong> {detail.void_reason}
            </div>
          )}

          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-sm" onClick={() => downloadPdf(detail.id, detail.voucher_number)}>
              <Download size={14} /> Descargar PDF
            </button>
            {detail.status === 'activa' && (
              <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => voidWithholding(detail.id)}>
                <XCircle size={14} /> Anular
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">Todos los tipos</option>
              <option value="ISLR">ISLR</option>
              <option value="IVA">IVA</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <input placeholder="Período (MM/YYYY)" value={filters.fiscal_period} onChange={(e) => setFilters({ ...filters, fiscal_period: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Todos</option>
              <option value="activa">Activas</option>
              <option value="anulada">Anuladas</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Comprobante</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>RIF</th>
              <th>Base</th>
              <th>%</th>
              <th>Retenido (VES)</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {withholdings.map((w) => (
              <tr key={w.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{w.voucher_number}</td>
                <td><span className={`badge ${w.type === 'ISLR' ? 'badge-blue' : 'badge-orange'}`}>{w.type}</span></td>
                <td>{fmtDate(w.withholding_date)}</td>
                <td>{(w.supplier_name || '').substring(0, 25)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{w.supplier_rif}</td>
                <td style={{ fontFamily: 'monospace' }}>{fmtNum(w.base_amount)}</td>
                <td>{w.rate}%</td>
                <td style={{ fontFamily: 'monospace' }}>{fmtNum(w.amount_ves)}</td>
                <td><span className={`badge ${w.status === 'activa' ? 'badge-green' : 'badge-red'}`}>{w.status}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn btn-sm" onClick={() => viewDetail(w.id)} title="Ver detalle"><Eye size={14} /></button>
                    <button className="btn btn-sm" onClick={() => downloadPdf(w.id, w.voucher_number)} title="PDF"><Download size={14} /></button>
                    {w.status === 'activa' && (
                      <button className="btn btn-sm" onClick={() => voidWithholding(w.id)} title="Anular" style={{ color: 'var(--danger)' }}>
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!withholdings.length && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>{loading ? 'Cargando...' : 'No hay retenciones'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
