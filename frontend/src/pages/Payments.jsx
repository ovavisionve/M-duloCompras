import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Download, XCircle, DollarSign } from 'lucide-react';
import api, { downloadFile } from '../api';

const methodLabels = {
  transferencia: 'Transferencia', pago_movil: 'Pago Móvil', efectivo_ves: 'Efectivo VES',
  efectivo_usd: 'Efectivo USD', zelle: 'Zelle', tarjeta: 'Tarjeta', cheque: 'Cheque',
  cripto: 'Cripto', paypal: 'PayPal',
};

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
};

export default function Payments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedInvoiceId = searchParams.get('invoice_id');

  const [payments, setPayments] = useState([]);
  const [filters, setFilters] = useState({ payment_method: '', currency: '', status: 'activo' });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(!!preselectedInvoiceId);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Form state
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    payment_date: today, payment_method: 'transferencia', currency: 'VES',
    amount: '', exchange_rate: '', reference_number: '', observations: '',
  });
  const [allocations, setAllocations] = useState([]);
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);

  const load = () => {
    setLoading(true);
    api.get('/payments', { params: { ...filters, limit: 50 } })
      .then((r) => setPayments(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters]);

  // Load pending invoices and exchange rate when form opens
  const loadFormData = () => {
    setInvoicesLoading(true);
    api.get('/invoices', { params: { limit: 200 } })
      .then(async (r) => {
        const allInvoices = r.data.data || [];
        const payable = allInvoices.filter((inv) => ['registrada', 'pago_parcial'].includes(inv.status));
        // Get balance for each
        const withBalance = await Promise.all(payable.map(async (inv) => {
          try {
            const { data } = await api.get(`/invoices/${inv.id}/balance`);
            return { ...inv, balance: data.data };
          } catch { return { ...inv, balance: null }; }
        }));
        setPendingInvoices(withBalance.filter((inv) => inv.balance && inv.balance.remaining > 0.01));

        // Pre-select invoice if coming from invoice detail
        if (preselectedInvoiceId) {
          const target = withBalance.find((inv) => inv.id === preselectedInvoiceId);
          if (target && target.balance) {
            setAllocations([{ invoice_id: target.id, amount: String(target.balance.remaining) }]);
            setForm((f) => ({ ...f, amount: String(target.balance.remaining), currency: target.currency }));
          }
          setSearchParams({}, { replace: true });
        }
      })
      .catch((err) => {
        console.error('Error loading invoices:', err);
        setFormError('Error al cargar facturas pendientes');
      })
      .finally(() => setInvoicesLoading(false));

    api.get('/exchange-rates/today').then((r) => {
      if (r.data.data) setForm((f) => ({ ...f, exchange_rate: r.data.data.rate }));
    }).catch(() => {});

    api.get('/banking/bank-accounts').then((r) => setBankAccounts(r.data.data || [])).catch(() => {});
  };

  useEffect(() => {
    if (showForm) loadFormData();
  }, [showForm]);

  const downloadReceipt = (id, ref) => {
    downloadFile(`/api/v1/payments/${id}/receipt`, `recibo_${ref || id}.pdf`);
  };

  const voidPayment = async (id) => {
    const reason = prompt('Motivo de anulación:');
    if (!reason) return;
    try {
      await api.post(`/payments/${id}/void`, { reason });
      load();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error');
    }
  };

  const addAllocation = () => {
    setAllocations([...allocations, { invoice_id: '', amount: '' }]);
  };

  const removeAllocation = (index) => {
    setAllocations(allocations.filter((_, i) => i !== index));
  };

  const updateAllocation = (index, field, value) => {
    const updated = [...allocations];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-fill amount with remaining balance when selecting an invoice
    if (field === 'invoice_id' && value) {
      const inv = pendingInvoices.find((i) => i.id === value);
      if (inv?.balance) {
        updated[index].amount = String(inv.balance.remaining);
      }
    }
    setAllocations(updated);
  };

  const totalAllocated = allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!allocations.length || allocations.some((a) => !a.invoice_id || !a.amount)) {
      setFormError('Debe asignar el pago a al menos una factura con monto.');
      return;
    }

    const amount = parseFloat(form.amount);
    if (Math.abs(totalAllocated - amount) > 0.01) {
      setFormError(`El monto total (${amount}) no coincide con la suma asignada (${totalAllocated.toFixed(2)}). Ajuste los montos.`);
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/payments', {
        ...form,
        amount: parseFloat(form.amount),
        exchange_rate: parseFloat(form.exchange_rate),
        invoice_allocations: allocations.map((a) => ({ invoice_id: a.invoice_id, amount: parseFloat(a.amount) })),
      });
      setShowForm(false);
      setAllocations([]);
      setForm({ payment_date: today, payment_method: 'transferencia', currency: 'VES', amount: '', exchange_rate: '', reference_number: '', observations: '' });
      load();
    } catch (err) {
      setFormError(err.response?.data?.error?.message || 'Error al registrar pago');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter out already-selected invoices from dropdown
  const selectedIds = allocations.map((a) => a.invoice_id).filter(Boolean);

  return (
    <div>
      <div className="page-header">
        <h1>Pagos</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : <><Plus size={16} /> Nuevo Pago</>}
        </button>
      </div>

      {/* ── Payment Creation Form ── */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--primary)' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>Registrar Pago</h3>

          {formError && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{formError}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Fecha de Pago *</label>
                <input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Método de Pago *</label>
                <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                  {Object.entries(methodLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Moneda *</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="VES">VES</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="form-group">
                <label>Tasa BCV *</label>
                <input type="number" step="0.000001" value={form.exchange_rate} onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Monto Total del Pago *</label>
                <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Nº Referencia</label>
                <input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="Nº de transferencia, cheque, etc." />
              </div>
              <div className="form-group">
                <label>Observaciones</label>
                <input value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
              </div>
            </div>

            {/* ── Invoice Allocations ── */}
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.9rem' }}>Aplicar a Facturas</strong>
                <button type="button" className="btn btn-sm" onClick={addAllocation}><Plus size={14} /> Agregar Factura</button>
              </div>

              {invoicesLoading && (
                <div style={{ color: 'var(--gray-500)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                  Cargando facturas pendientes...
                </div>
              )}

              {!invoicesLoading && allocations.length === 0 && (
                <div style={{ color: 'var(--gray-500)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                  {pendingInvoices.length === 0
                    ? 'No hay facturas con saldo pendiente.'
                    : 'Agregue las facturas a las que se aplicará este pago.'}
                </div>
              )}

              {allocations.map((alloc, index) => {
                const selectedInvoice = pendingInvoices.find((i) => i.id === alloc.invoice_id);
                return (
                  <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
                    <div className="form-group" style={{ flex: 3, marginBottom: 0 }}>
                      {index === 0 && <label style={{ fontSize: '0.8rem' }}>Factura</label>}
                      <select value={alloc.invoice_id} onChange={(e) => updateAllocation(index, 'invoice_id', e.target.value)}>
                        <option value="">Seleccione factura...</option>
                        {pendingInvoices
                          .filter((inv) => inv.id === alloc.invoice_id || !selectedIds.includes(inv.id))
                          .map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.supplier_name} | {inv.invoice_number} | Saldo: {Number(inv.balance?.remaining || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} {inv.currency}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      {index === 0 && <label style={{ fontSize: '0.8rem' }}>Monto a aplicar</label>}
                      <input
                        type="number" step="0.01" value={alloc.amount}
                        onChange={(e) => updateAllocation(index, 'amount', e.target.value)}
                        max={selectedInvoice?.balance?.remaining}
                        placeholder="0.00"
                      />
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => removeAllocation(index)} style={{ color: 'var(--danger)', marginBottom: '2px' }}>
                      <XCircle size={14} />
                    </button>
                  </div>
                );
              })}

              {allocations.length > 0 && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span><strong>Total asignado:</strong> {totalAllocated.toFixed(2)}</span>
                  <span style={{ color: Math.abs(totalAllocated - (parseFloat(form.amount) || 0)) > 0.01 ? 'var(--danger)' : 'var(--success)' }}>
                    {Math.abs(totalAllocated - (parseFloat(form.amount) || 0)) <= 0.01
                      ? 'Montos coinciden'
                      : `Diferencia: ${(totalAllocated - (parseFloat(form.amount) || 0)).toFixed(2)}`}
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <DollarSign size={16} /> {submitting ? 'Registrando...' : 'Registrar Pago'}
              </button>
              <button type="button" className="btn" onClick={() => { setShowForm(false); setAllocations([]); setFormError(''); }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <select value={filters.payment_method} onChange={(e) => setFilters({ ...filters, payment_method: e.target.value })}>
                  <option value="">Todos los métodos</option>
                  {Object.entries(methodLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <select value={filters.currency} onChange={(e) => setFilters({ ...filters, currency: e.target.value })}>
                  <option value="">Todas las monedas</option>
                  <option value="VES">VES</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                  <option value="">Todos</option>
                  <option value="activo">Activos</option>
                  <option value="anulado">Anulados</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Table ── */}
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Método</th>
                  <th>Referencia</th>
                  <th>Moneda</th>
                  <th>Monto</th>
                  <th>Equivalente</th>
                  <th>Dif. Cambiaria</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.payment_date)}</td>
                    <td>{methodLabels[p.payment_method] || p.payment_method}</td>
                    <td style={{ fontFamily: 'monospace' }}>{p.reference_number || '-'}</td>
                    <td>{p.currency}</td>
                    <td style={{ fontFamily: 'monospace' }}>{Number(p.amount).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                    <td style={{ fontFamily: 'monospace' }}>{Number(p.amount_other_currency).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                    <td style={{ fontFamily: 'monospace', color: parseFloat(p.exchange_difference) !== 0 ? 'var(--warning)' : 'inherit' }}>
                      {Number(p.exchange_difference).toFixed(2)}
                    </td>
                    <td><span className={`badge ${p.status === 'activo' ? 'badge-green' : 'badge-red'}`}>{p.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className="btn btn-sm" onClick={() => downloadReceipt(p.id, p.reference_number)} title="Recibo">
                          <Download size={14} />
                        </button>
                        {p.status === 'activo' && (
                          <button className="btn btn-sm" onClick={() => voidPayment(p.id)} title="Anular" style={{ color: 'var(--danger)' }}>
                            <XCircle size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!payments.length && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>{loading ? 'Cargando...' : 'No hay pagos'}</td></tr>}
              </tbody>
            </table>
          </div>
    </div>
  );
}
