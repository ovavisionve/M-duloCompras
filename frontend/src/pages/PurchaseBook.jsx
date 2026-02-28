import React, { useState } from 'react';
import { Download, Lock, CheckCircle } from 'lucide-react';
import api, { downloadFile } from '../api';

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
};

export default function PurchaseBook() {
  const now = new Date();
  const defaultPeriod = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const [period, setPeriod] = useState(defaultPeriod);
  const [book, setBook] = useState(null);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadBook = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/purchase-book', { params: { period } });
      setBook(data.data);
      setValidation(null);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error');
    } finally { setLoading(false); }
  };

  const validate = async () => {
    const { data } = await api.get('/purchase-book/validate', { params: { period } });
    setValidation(data.data);
  };

  const closePeriod = async () => {
    if (!confirm(`¿Cerrar el período ${period}? No se podrán agregar más facturas.`)) return;
    try {
      await api.post(`/purchase-book/close?period=${period}`);
      alert('Período cerrado exitosamente');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Libro de Compras</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={() => downloadFile(`/api/v1/purchase-book/pdf?period=${period}`, `libro_compras_${period.replace('/', '-')}.pdf`)}><Download size={14} /> PDF</button>
          <button className="btn" onClick={() => downloadFile(`/api/v1/purchase-book/excel?period=${period}`, `libro_compras_${period.replace('/', '-')}.xlsx`)}><Download size={14} /> Excel</button>
          <button className="btn" onClick={() => downloadFile(`/api/v1/purchase-book/seniat?period=${period}`, `libro_compras_seniat_${period.replace('/', '-')}.txt`)}><Download size={14} /> SENIAT TXT</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-row" style={{ alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Período Fiscal</label>
            <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="MM/YYYY" />
          </div>
          <button className="btn btn-primary" onClick={loadBook} disabled={loading}>
            {loading ? 'Cargando...' : 'Generar Libro'}
          </button>
          <button className="btn" onClick={validate}>
            <CheckCircle size={14} /> Validar
          </button>
          <button className="btn btn-danger" onClick={closePeriod}>
            <Lock size={14} /> Cerrar Período
          </button>
        </div>
      </div>

      {validation && (
        <div className="card" style={{ marginBottom: '1rem', borderLeft: `4px solid ${validation.is_valid ? 'var(--success)' : 'var(--danger)'}` }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Validación: {validation.is_valid ? 'Sin errores' : 'Requiere correcciones'}
          </h3>
          {validation.issues.map((issue, i) => (
            <div key={i} style={{ fontSize: '0.85rem', color: issue.type === 'error' ? 'var(--danger)' : 'var(--warning)', marginBottom: '0.25rem' }}>
              [{issue.type.toUpperCase()}] {issue.message}
            </div>
          ))}
          {!validation.issues.length && <div style={{ fontSize: '0.85rem', color: 'var(--success)' }}>Todo en orden para cerrar el período.</div>}
        </div>
      )}

      {book && (
        <>
          <div className="stats-grid" style={{ marginBottom: '1rem' }}>
            <div className="stat-card">
              <div className="label">Base Imponible</div>
              <div className="value" style={{ fontSize: '1.1rem' }}>Bs. {book.totals.total_taxable.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Exento</div>
              <div className="value" style={{ fontSize: '1.1rem' }}>Bs. {book.totals.total_exempt.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="label">IVA</div>
              <div className="value" style={{ fontSize: '1.1rem' }}>Bs. {book.totals.total_vat.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Total</div>
              <div className="value" style={{ fontSize: '1.1rem' }}>Bs. {book.totals.grand_total.toFixed(2)}</div>
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Fecha</th>
                  <th>RIF</th>
                  <th>Proveedor</th>
                  <th>Nº Factura</th>
                  <th>Nº Control</th>
                  <th>Tipo</th>
                  <th>Base Imp.</th>
                  <th>Exento</th>
                  <th>IVA</th>
                  <th>IVA Ret.</th>
                </tr>
              </thead>
              <tbody>
                {book.entries.map((e) => (
                  <tr key={e.operation_number}>
                    <td>{e.operation_number}</td>
                    <td>{fmtDate(e.emission_date)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{e.supplier_rif}</td>
                    <td>{(e.supplier_name || '').substring(0, 30)}</td>
                    <td>{e.invoice_number}</td>
                    <td>{e.control_number || '-'}</td>
                    <td><span className="badge badge-gray">{e.document_type}</span></td>
                    <td style={{ fontFamily: 'monospace' }}>{e.taxable_purchases?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'monospace' }}>{e.exempt_purchases?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'monospace' }}>{e.vat_amount?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'monospace' }}>{e.iva_withheld?.toFixed(2)}</td>
                  </tr>
                ))}
                {!book.entries.length && <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>Sin facturas para el período</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
