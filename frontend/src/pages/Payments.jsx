import React, { useState, useEffect } from 'react';
import { Plus, Download, XCircle } from 'lucide-react';
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
  const [payments, setPayments] = useState([]);
  const [filters, setFilters] = useState({ payment_method: '', currency: '', status: 'activo' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/payments', { params: { ...filters, limit: 50 } })
      .then((r) => setPayments(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters]);

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

  return (
    <div>
      <div className="page-header">
        <h1>Pagos</h1>
      </div>

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
