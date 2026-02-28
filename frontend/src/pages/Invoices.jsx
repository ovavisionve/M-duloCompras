import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, FileText } from 'lucide-react';
import api from '../api';

const statusBadge = {
  borrador: 'badge-gray',
  registrada: 'badge-blue',
  pago_parcial: 'badge-yellow',
  pagada: 'badge-green',
  anulada: 'badge-red',
  en_disputa: 'badge-orange',
};

const statusLabel = {
  borrador: 'Borrador',
  registrada: 'Registrada',
  pago_parcial: 'Pago Parcial',
  pagada: 'Pagada',
  anulada: 'Anulada',
  en_disputa: 'En Disputa',
};

const docTypeLabel = { FC: 'Factura Compra', FG: 'Factura Gasto', ND: 'Nota Débito', NC: 'Nota Crédito', DSF: 'Sin Factura' };

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
};

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: '', document_type: '' });
  const [pagination, setPagination] = useState({ page: 1, total: 0 });
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get('/invoices', { params: { ...filters, page: pagination.page, limit: 20 } })
      .then((res) => {
        setInvoices(res.data.data);
        setPagination((p) => ({ ...p, total: res.data.pagination?.total || 0 }));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters, pagination.page]);

  const viewDetail = async (id) => {
    const { data } = await api.get(`/invoices/${id}`);
    setDetail(data.data);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Facturas</h1>
        <button className="btn btn-primary" onClick={() => navigate('/invoices/new')}>
          <Plus size={16} /> Nueva Factura
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Buscar proveedor, RIF, factura..." />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Todos los estatus</option>
              <option value="borrador">Borrador</option>
              <option value="registrada">Registrada</option>
              <option value="pago_parcial">Pago Parcial</option>
              <option value="pagada">Pagada</option>
              <option value="anulada">Anulada</option>
              <option value="en_disputa">En Disputa</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select value={filters.document_type} onChange={(e) => setFilters({ ...filters, document_type: e.target.value })}>
              <option value="">Todos los tipos</option>
              <option value="FC">Factura Compra</option>
              <option value="FG">Factura Gasto</option>
              <option value="ND">Nota Débito</option>
              <option value="NC">Nota Crédito</option>
              <option value="DSF">Sin Factura</option>
            </select>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Detalle de Factura</h3>
            <button className="btn btn-sm" onClick={() => setDetail(null)}>Cerrar</button>
          </div>
          <div className="form-row">
            <div><strong>Proveedor:</strong> {detail.supplier_name} ({detail.supplier_rif})</div>
            <div><strong>Tipo:</strong> {docTypeLabel[detail.document_type]}</div>
            <div><strong>Nº Factura:</strong> {detail.invoice_number}</div>
            <div><strong>Nº Control:</strong> {detail.control_number || 'N/A'}</div>
          </div>
          <div className="form-row" style={{ marginTop: '0.5rem' }}>
            <div><strong>Fecha Emisión:</strong> {fmtDate(detail.emission_date)}</div>
            <div><strong>Moneda:</strong> {detail.currency}</div>
            <div><strong>Tasa BCV:</strong> {detail.exchange_rate}</div>
            <div><strong>Estatus:</strong> <span className={`badge ${statusBadge[detail.status]}`}>{statusLabel[detail.status]}</span></div>
          </div>
          <div className="form-row" style={{ marginTop: '0.5rem' }}>
            <div><strong>Base Imponible:</strong> {detail.taxable_amount}</div>
            <div><strong>Exento:</strong> {detail.exempt_amount}</div>
            <div><strong>IVA ({detail.vat_rate}%):</strong> {detail.vat_amount}</div>
            <div><strong>Total:</strong> {detail.total_amount} {detail.currency}</div>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <strong>Total VES:</strong> {Number(detail.total_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })} |{' '}
            <strong>Total USD:</strong> {Number(detail.total_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          {detail.payments?.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <strong>Pagos:</strong>
              {detail.payments.map((p, i) => (
                <div key={i} style={{ fontSize: '0.85rem', color: 'var(--gray-700)', marginLeft: '1rem' }}>
                  {fmtDate(p.payment_date)} - {p.payment_method} - {p.amount_applied} {p.currency} (Ref: {p.reference_number || 'N/A'})
                </div>
              ))}
            </div>
          )}
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
              <th>Nº Factura</th>
              <th>Nº Control</th>
              <th>Moneda</th>
              <th>Total</th>
              <th>Estatus</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{fmtDate(inv.emission_date)}</td>
                <td>{inv.supplier_name}</td>
                <td><span className="badge badge-gray">{inv.document_type}</span></td>
                <td>{inv.invoice_number}</td>
                <td>{inv.control_number || '-'}</td>
                <td>{inv.currency}</td>
                <td style={{ fontFamily: 'monospace' }}>{Number(inv.total_amount).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                <td><span className={`badge ${statusBadge[inv.status]}`}>{statusLabel[inv.status]}</span></td>
                <td>
                  <button className="btn btn-sm" onClick={() => viewDetail(inv.id)} title="Ver detalle">
                    <Eye size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {!invoices.length && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>{loading ? 'Cargando...' : 'No hay facturas'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
