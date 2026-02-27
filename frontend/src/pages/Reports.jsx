import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api';

export default function Reports() {
  const [activeReport, setActiveReport] = useState('accounts-payable');
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('');
  const [loading, setLoading] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    setData(null);
    try {
      let res;
      switch (activeReport) {
        case 'accounts-payable':
          res = await api.get('/reports/accounts-payable');
          break;
        case 'expenses-by-category':
          res = await api.get('/reports/expenses-by-category', { params: { period } });
          break;
        case 'exchange-differences':
          res = await api.get('/reports/exchange-differences', { params: { period } });
          break;
        case 'audit-log':
          res = await api.get('/reports/audit-log', { params: { limit: 50 } });
          break;
      }
      setData(res.data.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { loadReport(); }, [activeReport]);

  const reports = [
    { key: 'accounts-payable', label: 'Cuentas por Pagar' },
    { key: 'expenses-by-category', label: 'Gastos por Categoría' },
    { key: 'exchange-differences', label: 'Diferencial Cambiario' },
    { key: 'audit-log', label: 'Log de Auditoría' },
  ];

  return (
    <div>
      <div className="page-header"><h1>Reportes</h1></div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {reports.map((r) => (
          <button key={r.key} className={`btn ${activeReport === r.key ? 'btn-primary' : ''}`} onClick={() => setActiveReport(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      {['expenses-by-category', 'exchange-differences'].includes(activeReport) && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="form-row" style={{ alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Período (MM/YYYY)</label>
              <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="02/2026" />
            </div>
            <button className="btn btn-primary" onClick={loadReport}>Generar</button>
          </div>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>Cargando reporte...</div>}

      {/* Accounts Payable */}
      {activeReport === 'accounts-payable' && data && (
        <>
          <div className="stats-grid" style={{ marginBottom: '1rem' }}>
            <div className="stat-card">
              <div className="label">Total Facturas Pendientes</div>
              <div className="value">{data.summary?.total_invoices}</div>
            </div>
            <div className="stat-card">
              <div className="label">Total VES</div>
              <div className="value">Bs. {Number(data.summary?.total_ves || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="stat-card">
              <div className="label">Total USD</div>
              <div className="value">$ {Number(data.summary?.total_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Proveedor</th><th>Factura</th><th>Fecha</th><th>Moneda</th><th>Total</th><th>Antigüedad</th><th>Estatus</th></tr>
              </thead>
              <tbody>
                {(data.invoices || []).map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.supplier_name}</td>
                    <td>{inv.invoice_number}</td>
                    <td>{inv.emission_date}</td>
                    <td>{inv.currency}</td>
                    <td style={{ fontFamily: 'monospace' }}>{Number(inv.total_amount).toFixed(2)}</td>
                    <td><span className={`badge ${inv.days_pending > 60 ? 'badge-red' : inv.days_pending > 30 ? 'badge-yellow' : 'badge-green'}`}>{inv.aging}</span></td>
                    <td><span className={`badge badge-${inv.status === 'pago_parcial' ? 'yellow' : 'blue'}`}>{inv.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Expenses by Category */}
      {activeReport === 'expenses-by-category' && data && (
        <>
          <div className="chart-card" style={{ marginBottom: '1rem' }}>
            <h3>Distribución de Gastos</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="category" width={150} fontSize={11} />
                <Tooltip formatter={(v) => `Bs. ${Number(v).toFixed(2)}`} />
                <Bar dataKey="total_ves" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Categoría</th><th>Facturas</th><th>Total VES</th><th>Total USD</th></tr></thead>
              <tbody>
                {(data || []).map((d, i) => (
                  <tr key={i}>
                    <td>{d.category}</td>
                    <td>{d.invoice_count}</td>
                    <td style={{ fontFamily: 'monospace' }}>Bs. {Number(d.total_ves).toFixed(2)}</td>
                    <td style={{ fontFamily: 'monospace' }}>$ {Number(d.total_usd).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Audit Log */}
      {activeReport === 'audit-log' && data && (
        <div className="table-container">
          <table>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Entidad</th><th>Acción</th><th>IP</th></tr></thead>
            <tbody>
              {(data || []).map((log) => (
                <tr key={log.id}>
                  <td style={{ fontSize: '0.8rem' }}>{new Date(log.created_at).toLocaleString('es-VE')}</td>
                  <td>{log.user_name || 'Sistema'}</td>
                  <td>{log.entity_type}</td>
                  <td><span className={`badge ${log.action === 'create' ? 'badge-green' : log.action === 'void' ? 'badge-red' : 'badge-blue'}`}>{log.action}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.ip_address || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Exchange Differences */}
      {activeReport === 'exchange-differences' && data && (
        <>
          <div className="stats-grid" style={{ marginBottom: '1rem' }}>
            <div className="stat-card">
              <div className="label">Total Diferencial Cambiario</div>
              <div className="value" style={{ color: (data.summary?.total_exchange_difference || 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                Bs. {Number(data.summary?.total_exchange_difference || 0).toFixed(2)}
              </div>
              <div className="sub">{data.summary?.count || 0} pagos con diferencial</div>
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Fecha</th><th>Método</th><th>Monto</th><th>Moneda</th><th>Tasa</th><th>Diferencial</th></tr></thead>
              <tbody>
                {(data.payments || []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.payment_date}</td>
                    <td>{p.payment_method}</td>
                    <td style={{ fontFamily: 'monospace' }}>{Number(p.amount).toFixed(2)}</td>
                    <td>{p.currency}</td>
                    <td style={{ fontFamily: 'monospace' }}>{Number(p.exchange_rate).toFixed(2)}</td>
                    <td style={{ fontFamily: 'monospace', color: parseFloat(p.exchange_difference) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {Number(p.exchange_difference).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
