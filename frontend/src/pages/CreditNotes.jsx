import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, FileText, CheckCircle, X, Trash2 } from 'lucide-react';
import api from '../api';
import { fmtNum, fmtDate } from '../utils/format';

const statusBadge = {
  borrador: 'badge-gray', registrada: 'badge-blue',
  pago_parcial: 'badge-yellow', pagada: 'badge-green', anulada: 'badge-red',
};
const statusLabel = {
  borrador: 'Borrador', registrada: 'Pendiente', pago_parcial: 'Parcial',
  pagada: 'Aplicada', anulada: 'Anulada',
};

const reasonLabels = {
  devolucion: 'Devolucion', ajuste_precio: 'Ajuste de precio',
  descuento_pronto_pago: 'Descuento pronto pago', regularizacion_anticipo: 'Regularizacion anticipo',
  error_facturacion: 'Error de facturacion', otro: 'Otro',
};

export default function CreditNotes() {
  const [creditNotes, setCreditNotes] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: '', document_type: 'NC' });
  const [pagination, setPagination] = useState({ page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [balance, setBalance] = useState(null);
  const navigate = useNavigate();

  // Apply modal state
  const [applyModal, setApplyModal] = useState(false);
  const [applyNC, setApplyNC] = useState(null);
  const [applyNCBalance, setApplyNCBalance] = useState(null);
  const [supplierInvoices, setSupplierInvoices] = useState([]);
  const [applyRows, setApplyRows] = useState([{ invoice_id: '', amount_applied: '' }]);
  const [applyError, setApplyError] = useState('');
  const [applySubmitting, setApplySubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/invoices', { params: { ...filters, page: pagination.page, limit: 20 } })
      .then((res) => {
        setCreditNotes(res.data.data);
        setPagination((p) => ({ ...p, total: res.data.pagination?.total || 0 }));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters, pagination.page]);

  const viewDetail = async (id) => {
    const [invoiceRes, balanceRes] = await Promise.all([
      api.get(`/invoices/${id}`),
      api.get(`/credit-notes/${id}/balance`),
    ]);
    setDetail(invoiceRes.data.data);
    setBalance(balanceRes.data.data);
  };

  const openApplyModal = async (nc) => {
    setApplyError('');
    setApplySubmitting(false);
    try {
      const [balRes, invRes] = await Promise.all([
        api.get(`/credit-notes/${nc.id}/balance`),
        api.get('/invoices', { params: { supplier_id: nc.supplier_id, limit: 100 } }),
      ]);
      setApplyNCBalance(balRes.data.data);
      // Filter only invoices (FC, FG, ND) with outstanding balance
      const eligibleInvoices = (invRes.data.data || []).filter(
        (inv) => ['FC', 'FG', 'ND'].includes(inv.document_type) &&
                 !['anulada', 'borrador'].includes(inv.status)
      );
      setSupplierInvoices(eligibleInvoices);
      setApplyRows([{ invoice_id: '', amount_applied: '' }]);
      setApplyNC(nc);
      setApplyModal(true);
    } catch (err) {
      alert('Error al cargar datos para aplicar NC');
    }
  };

  const closeApplyModal = () => {
    setApplyModal(false);
    setApplyNC(null);
    setApplyNCBalance(null);
    setApplyError('');
  };

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    setApplyError('');
    const validRows = applyRows.filter((r) => r.invoice_id && parseFloat(r.amount_applied) > 0);
    if (!validRows.length) { setApplyError('Debe seleccionar al menos una factura y un monto.'); return; }

    const totalToApply = validRows.reduce((s, r) => s + parseFloat(r.amount_applied), 0);
    if (applyNCBalance && totalToApply > applyNCBalance.remaining + 0.01) {
      setApplyError(`El total a aplicar (${fmtNum(totalToApply)}) excede el credito disponible (${fmtNum(applyNCBalance.remaining)}).`);
      return;
    }

    setApplySubmitting(true);
    try {
      await api.post(`/credit-notes/${applyNC.id}/apply`, {
        applications: validRows.map((r) => ({
          invoice_id: r.invoice_id,
          amount_applied: parseFloat(r.amount_applied),
        })),
      });
      closeApplyModal();
      load();
      if (detail && detail.id === applyNC.id) viewDetail(applyNC.id);
    } catch (err) {
      setApplyError(err.response?.data?.error?.message || 'Error al aplicar nota de credito');
    } finally {
      setApplySubmitting(false);
    }
  };

  const removeApplication = async (applicationId) => {
    if (!window.confirm('Eliminar esta aplicacion de NC?')) return;
    try {
      await api.delete(`/credit-notes/applications/${applicationId}`);
      if (detail) viewDetail(detail.id);
      load();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error al eliminar aplicacion');
    }
  };

  const addRow = () => setApplyRows([...applyRows, { invoice_id: '', amount_applied: '' }]);
  const removeRow = (i) => setApplyRows(applyRows.filter((_, idx) => idx !== i));
  const updateRow = (i, field, value) => {
    const rows = [...applyRows];
    rows[i] = { ...rows[i], [field]: value };
    setApplyRows(rows);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Notas de Credito</h1>
        <button className="btn btn-primary" onClick={() => navigate('/invoices/new?type=NC')}>
          <Plus size={16} /> Registrar NC
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Buscar proveedor, RIF, numero..." />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select value={filters.document_type} onChange={(e) => setFilters({ ...filters, document_type: e.target.value })}>
              <option value="NC">Notas de Credito</option>
              <option value="ND">Notas de Debito</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Todos los estatus</option>
              <option value="borrador">Borrador</option>
              <option value="registrada">Pendiente</option>
              <option value="pago_parcial">Parcialmente Aplicada</option>
              <option value="pagada">Totalmente Aplicada</option>
              <option value="anulada">Anulada</option>
            </select>
          </div>
        </div>
      </div>

      {/* Detail */}
      {detail && (
        <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Detalle - {detail.document_type === 'NC' ? 'Nota de Credito' : 'Nota de Debito'}</h3>
            <button className="btn btn-sm" onClick={() => { setDetail(null); setBalance(null); }}>Cerrar</button>
          </div>
          <div className="form-row">
            <div><strong>Proveedor:</strong> {detail.supplier_name} ({detail.supplier_rif})</div>
            <div><strong>Numero:</strong> {detail.invoice_number}</div>
            <div><strong>Control:</strong> {detail.control_number || 'N/A'}</div>
            <div><strong>Fecha:</strong> {fmtDate(detail.emission_date)}</div>
          </div>
          <div className="form-row" style={{ marginTop: '0.5rem' }}>
            <div><strong>Moneda:</strong> {detail.currency}</div>
            <div><strong>Total:</strong> {fmtNum(detail.total_amount)} {detail.currency}</div>
            <div><strong>IVA ({detail.vat_rate}%):</strong> {fmtNum(detail.vat_amount)}</div>
            <div><strong>Estatus:</strong> <span className={`badge ${statusBadge[detail.status]}`}>{statusLabel[detail.status]}</span></div>
          </div>
          {detail.note_reason && (
            <div style={{ marginTop: '0.5rem' }}><strong>Razon:</strong> {reasonLabels[detail.note_reason] || detail.note_reason}</div>
          )}
          {detail.affected_invoice_number && (
            <div style={{ marginTop: '0.25rem' }}><strong>Factura Afectada:</strong> {detail.affected_invoice_number}</div>
          )}

          {/* NC Balance */}
          {balance && detail.document_type === 'NC' && !['borrador', 'anulada'].includes(detail.status) && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '6px', background: balance.remaining <= 0.01 ? '#dcfce7' : '#fef9c3', border: `1px solid ${balance.remaining <= 0.01 ? '#86efac' : '#fde047'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.9rem' }}>
                <div><strong>Total NC:</strong> {fmtNum(balance.total_amount)} {balance.currency}</div>
                <div><strong>Aplicado:</strong> {fmtNum(balance.total_applied)}</div>
                <div style={{ fontWeight: 'bold', color: balance.remaining <= 0.01 ? '#16a34a' : '#d97706' }}>
                  Credito Disponible: {fmtNum(balance.remaining)} {balance.currency}
                </div>
              </div>
            </div>
          )}

          {/* Applications list */}
          {detail.applied_to?.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <strong>Aplicada a facturas:</strong>
              {detail.applied_to.map((app, i) => (
                <div key={i} style={{ fontSize: '0.85rem', color: 'var(--gray-700)', marginLeft: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0' }}>
                  <span>
                    {fmtDate(app.applied_date)} - Factura {app.invoice_number} - {fmtNum(app.amount_applied)} (Total fact: {fmtNum(app.invoice_total)})
                  </span>
                  <button className="btn btn-sm btn-danger" onClick={() => removeApplication(app.id)} title="Eliminar aplicacion">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {detail.document_type === 'NC' && ['registrada', 'pago_parcial'].includes(detail.status) && (
              <button className="btn btn-primary btn-sm" onClick={() => openApplyModal(detail)}>
                <CheckCircle size={14} /> Aplicar a Factura
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Tipo</th>
              <th>Numero</th>
              <th>Moneda</th>
              <th>Total</th>
              <th>Estatus</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {creditNotes.map((nc) => (
              <tr key={nc.id}>
                <td>{fmtDate(nc.emission_date)}</td>
                <td>{nc.supplier_name}</td>
                <td><span className="badge badge-gray">{nc.document_type}</span></td>
                <td>{nc.invoice_number}</td>
                <td>{nc.currency}</td>
                <td style={{ fontFamily: 'monospace' }}>{fmtNum(nc.total_amount)}</td>
                <td><span className={`badge ${statusBadge[nc.status]}`}>{statusLabel[nc.status]}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn btn-sm" onClick={() => viewDetail(nc.id)} title="Ver detalle">
                      <Eye size={14} />
                    </button>
                    {nc.document_type === 'NC' && ['registrada', 'pago_parcial'].includes(nc.status) && (
                      <button className="btn btn-sm btn-primary" onClick={() => openApplyModal(nc)} title="Aplicar NC">
                        <CheckCircle size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!creditNotes.length && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>
                {loading ? 'Cargando...' : 'No hay notas de credito/debito'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Apply Modal */}
      {applyModal && applyNC && (
        <div className="modal-overlay" onClick={closeApplyModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Aplicar Nota de Credito</h3>
              <button className="btn btn-sm" onClick={closeApplyModal}><X size={16} /></button>
            </div>

            {/* NC info */}
            <div style={{ padding: '0.75rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                <div><strong>NC:</strong> {applyNC.invoice_number}</div>
                <div><strong>Proveedor:</strong> {applyNC.supplier_name}</div>
                <div><strong>Total:</strong> {fmtNum(applyNC.total_amount)} {applyNC.currency}</div>
              </div>
              {applyNCBalance && (
                <div style={{ marginTop: '0.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>
                  Credito Disponible: {fmtNum(applyNCBalance.remaining)} {applyNCBalance.currency}
                </div>
              )}
            </div>

            {applyError && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{applyError}</div>}

            <form onSubmit={handleApplySubmit}>
              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.9rem' }}>Facturas a las que aplicar:</strong>
              </div>

              {applyRows.map((row, i) => (
                <div key={i} className="form-row" style={{ marginBottom: '0.5rem', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Factura</label>
                    <select value={row.invoice_id} onChange={(e) => updateRow(i, 'invoice_id', e.target.value)}>
                      <option value="">Seleccione factura...</option>
                      {supplierInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.document_type} {inv.invoice_number} - {fmtNum(inv.total_amount)} {inv.currency}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Monto</label>
                    <input type="number" step="0.01" value={row.amount_applied}
                      onChange={(e) => updateRow(i, 'amount_applied', e.target.value)} placeholder="0,00" />
                  </div>
                  {applyRows.length > 1 && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeRow(i)} style={{ marginBottom: '0.25rem' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}

              <button type="button" className="btn btn-sm" onClick={addRow} style={{ marginBottom: '1rem' }}>
                <Plus size={14} /> Agregar factura
              </button>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={applySubmitting}>
                  <CheckCircle size={16} /> {applySubmitting ? 'Aplicando...' : 'Aplicar NC'}
                </button>
                <button type="button" className="btn" onClick={closeApplyModal}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
