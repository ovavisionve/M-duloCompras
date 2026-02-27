import React, { useState, useEffect } from 'react';
import { Plus, Download, FileText } from 'lucide-react';
import api from '../api';

export default function Withholdings() {
  const [withholdings, setWithholdings] = useState([]);
  const [filters, setFilters] = useState({ type: '', fiscal_period: '' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/withholdings', { params: { ...filters, limit: 50 } })
      .then((r) => setWithholdings(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters]);

  const downloadPdf = (id) => {
    window.open(`/api/v1/withholdings/${id}/pdf`, '_blank');
  };

  return (
    <div>
      <div className="page-header">
        <h1>Retenciones</h1>
      </div>

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
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Comprobante</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Base</th>
              <th>%</th>
              <th>Monto (VES)</th>
              <th>Monto (USD)</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {withholdings.map((w) => (
              <tr key={w.id}>
                <td style={{ fontFamily: 'monospace' }}>{w.voucher_number}</td>
                <td><span className={`badge ${w.type === 'ISLR' ? 'badge-blue' : 'badge-orange'}`}>{w.type}</span></td>
                <td>{w.withholding_date}</td>
                <td>{w.supplier_name}</td>
                <td style={{ fontFamily: 'monospace' }}>{Number(w.base_amount).toFixed(2)}</td>
                <td>{w.rate}%</td>
                <td style={{ fontFamily: 'monospace' }}>{Number(w.amount_ves).toFixed(2)}</td>
                <td style={{ fontFamily: 'monospace' }}>{Number(w.amount_usd).toFixed(2)}</td>
                <td><span className={`badge ${w.status === 'activa' ? 'badge-green' : 'badge-red'}`}>{w.status}</span></td>
                <td>
                  <button className="btn btn-sm" onClick={() => downloadPdf(w.id)} title="Descargar PDF">
                    <Download size={14} />
                  </button>
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
