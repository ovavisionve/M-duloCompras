import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Download, FileText, Filter, RefreshCw, Search, Users } from 'lucide-react';
import api from '../api';

const PIE_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#0ea5e9', '#f97316', '#14b8a6', '#ec4899', '#6366f1'];

const fmtVES = (v) => `Bs. ${Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
const fmtUSD = (v) => `$ ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-VE') : '-';
const mono = { fontFamily: 'monospace', fontSize: '0.85rem' };

function downloadFile(url) {
  const token = localStorage.getItem('token');
  const a = document.createElement('a');
  // Use fetch with auth header to download
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => res.blob())
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      a.href = blobUrl;
      // Extract filename from URL
      const parts = url.split('/');
      const format = parts[parts.length - 1].split('?')[0];
      a.download = `reporte_${format}`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    });
}

function ExportButtons({ baseUrl, params, label }) {
  const qs = new URLSearchParams(params).toString();
  const buildUrl = (fmt) => `/api/v1${baseUrl}/${fmt}${qs ? '?' + qs : ''}`;

  return (
    <div style={{ display: 'flex', gap: '0.4rem' }}>
      <button className="btn btn-sm" onClick={() => downloadFile(buildUrl('pdf'))} title="Descargar PDF">
        <Download size={13} /> PDF
      </button>
      <button className="btn btn-sm" onClick={() => downloadFile(buildUrl('excel'))} title="Descargar Excel">
        <Download size={13} /> Excel
      </button>
      <button className="btn btn-sm" onClick={() => downloadFile(buildUrl('csv'))} title="Descargar CSV">
        <Download size={13} /> CSV
      </button>
    </div>
  );
}

function FilterPanel({ children, onApply, onClear }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-sm" onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Filter size={14} /> {open ? 'Ocultar Filtros' : 'Mostrar Filtros'}
        </button>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button className="btn btn-primary btn-sm" onClick={onApply}><Search size={13} /> Generar</button>
          <button className="btn btn-sm" onClick={onClear}><RefreshCw size={13} /> Limpiar</button>
        </div>
      </div>
      {open && <div className="form-row" style={{ marginTop: '0.75rem' }}>{children}</div>}
    </div>
  );
}

export default function Reports() {
  const now = new Date();
  const defaultPeriod = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const [activeReport, setActiveReport] = useState('accounts-payable');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);

  // Shared filters
  const [filters, setFilters] = useState({
    period: defaultPeriod,
    from_date: '',
    to_date: '',
    supplier_id: '',
    category_id: '',
    cost_center_id: '',
    currency: '',
    document_type: '',
    status: '',
    aging: '',
    payment_method: '',
    type: '',
    show_all: '',
  });

  // Supplier for movements
  const [selectedSupplier, setSelectedSupplier] = useState('');

  useEffect(() => {
    api.get('/suppliers').then((r) => setSuppliers(r.data.data || [])).catch(() => {});
    api.get('/config/expense-categories').then((r) => setCategories(r.data.data || [])).catch(() => {});
  }, []);

  const setFilter = (key, val) => setFilters((f) => ({ ...f, [key]: val }));

  const clearFilters = () => {
    setFilters({ period: defaultPeriod, from_date: '', to_date: '', supplier_id: '', category_id: '', cost_center_id: '', currency: '', document_type: '', status: '', aging: '', payment_method: '', type: '', show_all: '' });
  };

  // Build query params from non-empty filters
  const buildParams = () => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  };

  const loadReport = async () => {
    setLoading(true);
    setData(null);
    try {
      let res;
      const params = buildParams();
      switch (activeReport) {
        case 'accounts-payable':
          res = await api.get('/reports/accounts-payable', { params });
          break;
        case 'expenses-by-category':
          res = await api.get('/reports/expenses-by-category', { params });
          break;
        case 'supplier-movements':
          if (!selectedSupplier) { alert('Seleccione un proveedor'); setLoading(false); return; }
          res = await api.get(`/reports/supplier-movements/${selectedSupplier}`, { params });
          break;
        case 'exchange-differences':
          res = await api.get('/reports/exchange-differences', { params });
          break;
        case 'withholdings-summary':
          res = await api.get('/reports/withholdings-summary', { params });
          break;
        case 'payment-summary':
          res = await api.get('/reports/payment-summary', { params });
          break;
        case 'audit-log':
          res = await api.get('/reports/audit-log', { params: { ...params, limit: 100 } });
          break;
      }
      setData(res.data.data);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error?.message || 'Error cargando reporte');
    }
    setLoading(false);
  };

  useEffect(() => { loadReport(); }, [activeReport]);

  const reports = [
    { key: 'accounts-payable', label: 'Cuentas por Pagar', icon: '📋' },
    { key: 'expenses-by-category', label: 'Gastos por Categoría', icon: '📊' },
    { key: 'supplier-movements', label: 'Movimientos Proveedor', icon: '🏢' },
    { key: 'exchange-differences', label: 'Diferencial Cambiario', icon: '💱' },
    { key: 'withholdings-summary', label: 'Resumen Retenciones', icon: '📄' },
    { key: 'payment-summary', label: 'Resumen Pagos', icon: '💳' },
    { key: 'audit-log', label: 'Log de Auditoría', icon: '🔍' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Reportes</h1>
        {activeReport !== 'audit-log' && activeReport !== 'supplier-movements' && (
          <ExportButtons baseUrl={`/reports/${activeReport}`} params={buildParams()} label={activeReport} />
        )}
        {activeReport === 'supplier-movements' && selectedSupplier && (
          <ExportButtons baseUrl={`/reports/supplier-movements/${selectedSupplier}`} params={buildParams()} label="supplier" />
        )}
        {activeReport === 'audit-log' && (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className="btn btn-sm" onClick={() => downloadFile(`/api/v1/reports/audit-log/excel?${new URLSearchParams(buildParams()).toString()}`)}><Download size={13} /> Excel</button>
            <button className="btn btn-sm" onClick={() => downloadFile(`/api/v1/reports/audit-log/csv?${new URLSearchParams(buildParams()).toString()}`)}><Download size={13} /> CSV</button>
          </div>
        )}
      </div>

      {/* Report Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {reports.map((r) => (
          <button key={r.key} className={`btn ${activeReport === r.key ? 'btn-primary' : ''}`}
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
            onClick={() => { setActiveReport(r.key); setData(null); }}>
            {r.icon} {r.label}
          </button>
        ))}
      </div>

      {/* ═══════════ ACCOUNTS PAYABLE ═══════════ */}
      {activeReport === 'accounts-payable' && (
        <>
          <FilterPanel onApply={loadReport} onClear={() => { clearFilters(); }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Período</label>
              <input value={filters.period} onChange={(e) => setFilter('period', e.target.value)} placeholder="MM/YYYY" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Desde</label>
              <input type="date" value={filters.from_date} onChange={(e) => setFilter('from_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Hasta</label>
              <input type="date" value={filters.to_date} onChange={(e) => setFilter('to_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Proveedor</label>
              <select value={filters.supplier_id} onChange={(e) => setFilter('supplier_id', e.target.value)}>
                <option value="">Todos</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.business_name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Moneda</label>
              <select value={filters.currency} onChange={(e) => setFilter('currency', e.target.value)}>
                <option value="">Todas</option>
                <option value="VES">VES</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Antigüedad</label>
              <select value={filters.aging} onChange={(e) => setFilter('aging', e.target.value)}>
                <option value="">Todas</option>
                <option value="0-30 días">0-30 días</option>
                <option value="31-60 días">31-60 días</option>
                <option value="61-90 días">61-90 días</option>
                <option value="90+ días">90+ días</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Categoría</label>
              <select value={filters.category_id} onChange={(e) => setFilter('category_id', e.target.value)}>
                <option value="">Todas</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Tipo Doc.</label>
              <select value={filters.document_type} onChange={(e) => setFilter('document_type', e.target.value)}>
                <option value="">Todos</option>
                <option value="FC">Factura</option>
                <option value="NC">Nota Crédito</option>
                <option value="ND">Nota Débito</option>
              </select>
            </div>
          </FilterPanel>

          {data && (
            <>
              {/* Aging Summary Cards */}
              <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat-card">
                  <div className="label">Total Pendiente</div>
                  <div className="value" style={{ fontSize: '1.1rem' }}>{data.summary?.total_invoices} facturas</div>
                  <div className="sub">{fmtVES(data.summary?.total_ves)}</div>
                </div>
                {data.summary?.aging_buckets && Object.entries(data.summary.aging_buckets).map(([bucket, info]) => (
                  <div className="stat-card" key={bucket} style={{ borderLeft: `4px solid ${bucket.includes('0-30') ? 'var(--success)' : bucket.includes('31-60') ? 'var(--warning)' : 'var(--danger)'}` }}>
                    <div className="label">{bucket}</div>
                    <div className="value" style={{ fontSize: '1rem' }}>{info.count}</div>
                    <div className="sub">{fmtVES(info.total_ves)}</div>
                  </div>
                ))}
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Proveedor</th><th>RIF</th><th>Factura</th><th>Fecha</th><th>Moneda</th><th>Total VES</th><th>Total USD</th><th>Días</th><th>Antigüedad</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {(data.invoices || []).map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.supplier_name}</td>
                        <td style={{ ...mono, fontSize: '0.78rem' }}>{inv.supplier_rif}</td>
                        <td>{inv.invoice_number}</td>
                        <td>{fmtDate(inv.emission_date)}</td>
                        <td>{inv.currency}</td>
                        <td style={mono}>{fmtVES(inv.total_ves)}</td>
                        <td style={mono}>{fmtUSD(inv.total_usd)}</td>
                        <td style={{ textAlign: 'center' }}>{inv.days_pending}</td>
                        <td><span className={`badge ${inv.days_pending > 60 ? 'badge-red' : inv.days_pending > 30 ? 'badge-yellow' : 'badge-green'}`}>{inv.aging}</span></td>
                        <td><span className={`badge badge-${inv.status === 'pago_parcial' ? 'yellow' : 'blue'}`}>{inv.status}</span></td>
                      </tr>
                    ))}
                    {!(data.invoices || []).length && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>Sin datos</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════ EXPENSES BY CATEGORY ═══════════ */}
      {activeReport === 'expenses-by-category' && (
        <>
          <FilterPanel onApply={loadReport} onClear={clearFilters}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Período</label>
              <input value={filters.period} onChange={(e) => setFilter('period', e.target.value)} placeholder="MM/YYYY" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Desde</label>
              <input type="date" value={filters.from_date} onChange={(e) => setFilter('from_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Hasta</label>
              <input type="date" value={filters.to_date} onChange={(e) => setFilter('to_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Proveedor</label>
              <select value={filters.supplier_id} onChange={(e) => setFilter('supplier_id', e.target.value)}>
                <option value="">Todos</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.business_name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Categoría</label>
              <select value={filters.category_id} onChange={(e) => setFilter('category_id', e.target.value)}>
                <option value="">Todas</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Moneda</label>
              <select value={filters.currency} onChange={(e) => setFilter('currency', e.target.value)}>
                <option value="">Todas</option>
                <option value="VES">VES</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Estado</label>
              <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
                <option value="">Todos</option>
                <option value="registrada">Registrada</option>
                <option value="pago_parcial">Pago Parcial</option>
                <option value="pagada">Pagada</option>
              </select>
            </div>
          </FilterPanel>

          {data && (
            <>
              <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat-card">
                  <div className="label">Total Gastos VES</div>
                  <div className="value" style={{ fontSize: '1rem' }}>{fmtVES(data.summary?.total_ves)}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Total Gastos USD</div>
                  <div className="value" style={{ fontSize: '1rem' }}>{fmtUSD(data.summary?.total_usd)}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Facturas</div>
                  <div className="value">{data.summary?.total_invoices}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Categorías</div>
                  <div className="value">{data.summary?.category_count}</div>
                </div>
              </div>

              <div className="charts-grid" style={{ marginBottom: '1rem' }}>
                <div className="chart-card">
                  <h3>Distribución por Categoría</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.by_category} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" fontSize={11} tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'} />
                      <YAxis type="category" dataKey="category" width={130} fontSize={11} />
                      <Tooltip formatter={(v) => fmtVES(v)} />
                      <Bar dataKey="total_ves" fill="#2563eb" radius={[0, 4, 4, 0]} name="Total VES" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-card">
                  <h3>Proporción de Gastos</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={data.by_category} dataKey="total_ves" nameKey="category" cx="50%" cy="50%" outerRadius={100} label={({ category, percent }) => `${(category || '').substring(0, 12)} ${(percent * 100).toFixed(0)}%`}>
                        {(data.by_category || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmtVES(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* By Category Table */}
              <div className="table-container" style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Por Categoría</h3>
                <table>
                  <thead><tr><th>Categoría</th><th>Código</th><th>Facturas</th><th>Base Imp.</th><th>Exento</th><th>IVA</th><th>Total VES</th><th>Total USD</th></tr></thead>
                  <tbody>
                    {(data.by_category || []).map((d, i) => (
                      <tr key={i}>
                        <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: PIE_COLORS[i % PIE_COLORS.length], marginRight: 6 }}></span>{d.category}</td>
                        <td><span className="badge badge-gray">{d.category_code}</span></td>
                        <td style={{ textAlign: 'center' }}>{d.invoice_count}</td>
                        <td style={mono}>{fmtVES(d.taxable_total)}</td>
                        <td style={mono}>{fmtVES(d.exempt_total)}</td>
                        <td style={mono}>{fmtVES(d.vat_total)}</td>
                        <td style={mono}><strong>{fmtVES(d.total_ves)}</strong></td>
                        <td style={mono}>{fmtUSD(d.total_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* By Cost Center Table */}
              {(data.by_cost_center || []).length > 0 && (
                <div className="table-container">
                  <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Por Centro de Costo</h3>
                  <table>
                    <thead><tr><th>Centro de Costo</th><th>Código</th><th>Facturas</th><th>Total VES</th><th>Total USD</th></tr></thead>
                    <tbody>
                      {data.by_cost_center.map((d, i) => (
                        <tr key={i}>
                          <td>{d.cost_center}</td>
                          <td><span className="badge badge-gray">{d.cost_center_code}</span></td>
                          <td style={{ textAlign: 'center' }}>{d.invoice_count}</td>
                          <td style={mono}>{fmtVES(d.total_ves)}</td>
                          <td style={mono}>{fmtUSD(d.total_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════ SUPPLIER MOVEMENTS ═══════════ */}
      {activeReport === 'supplier-movements' && (
        <>
          <FilterPanel onApply={loadReport} onClear={clearFilters}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Proveedor *</label>
              <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} style={{ borderColor: !selectedSupplier ? 'var(--danger)' : undefined }}>
                <option value="">-- Seleccione --</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.business_name} ({s.rif})</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Período</label>
              <input value={filters.fiscal_period || ''} onChange={(e) => setFilter('fiscal_period', e.target.value)} placeholder="MM/YYYY" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Desde</label>
              <input type="date" value={filters.from_date} onChange={(e) => setFilter('from_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Hasta</label>
              <input type="date" value={filters.to_date} onChange={(e) => setFilter('to_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Tipo Doc.</label>
              <select value={filters.document_type} onChange={(e) => setFilter('document_type', e.target.value)}>
                <option value="">Todos</option>
                <option value="FC">Factura</option>
                <option value="NC">Nota Crédito</option>
                <option value="ND">Nota Débito</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Moneda</label>
              <select value={filters.currency} onChange={(e) => setFilter('currency', e.target.value)}>
                <option value="">Todas</option>
                <option value="VES">VES</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </FilterPanel>

          {data && (
            <>
              {/* Supplier Info + Summary */}
              <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid var(--primary)' }}>
                <h3 style={{ marginBottom: '0.3rem' }}>{data.supplier?.business_name}</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginBottom: '0.5rem' }}>RIF: {data.supplier?.rif} | {data.supplier?.fiscal_address}</div>
              </div>

              <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
                  <div className="label">Total Facturado</div>
                  <div className="value" style={{ fontSize: '1rem' }}>{fmtVES(data.summary?.total_invoiced_ves)}</div>
                  <div className="sub">{data.summary?.invoice_count} facturas</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
                  <div className="label">Total Pagado</div>
                  <div className="value" style={{ fontSize: '1rem' }}>{fmtVES(data.summary?.total_paid)}</div>
                  <div className="sub">{data.summary?.payment_count} pagos</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)' }}>
                  <div className="label">Total Retenido</div>
                  <div className="value" style={{ fontSize: '1rem' }}>{fmtVES(data.summary?.total_withheld)}</div>
                  <div className="sub">{data.summary?.withholding_count} retenciones</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
                  <div className="label">Saldo Pendiente</div>
                  <div className="value" style={{ fontSize: '1rem', color: 'var(--danger)' }}>{fmtVES(data.summary?.balance_ves)}</div>
                </div>
              </div>

              {/* Invoices */}
              <div className="table-container" style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Facturas ({(data.invoices || []).length})</h3>
                <table>
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Nº Factura</th><th>Descripción</th><th>Moneda</th><th>Total VES</th><th>Total USD</th><th>Estado</th></tr></thead>
                  <tbody>
                    {(data.invoices || []).map((inv) => (
                      <tr key={inv.id}>
                        <td>{fmtDate(inv.emission_date)}</td>
                        <td><span className="badge badge-gray">{inv.document_type}</span></td>
                        <td>{inv.invoice_number}</td>
                        <td style={{ fontSize: '0.82rem' }}>{(inv.description || '').substring(0, 40)}</td>
                        <td>{inv.currency}</td>
                        <td style={mono}>{fmtVES(inv.total_ves)}</td>
                        <td style={mono}>{fmtUSD(inv.total_usd)}</td>
                        <td><span className={`badge badge-${inv.status === 'pagada' ? 'green' : inv.status === 'pago_parcial' ? 'yellow' : 'blue'}`}>{inv.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Payments */}
              {(data.payments || []).length > 0 && (
                <div className="table-container" style={{ marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Pagos ({data.payments.length})</h3>
                  <table>
                    <thead><tr><th>Fecha</th><th>Referencia</th><th>Método</th><th>Factura</th><th>Monto Aplicado</th><th>Moneda</th></tr></thead>
                    <tbody>
                      {data.payments.map((p, i) => (
                        <tr key={i}>
                          <td>{fmtDate(p.payment_date)}</td>
                          <td style={mono}>{p.reference_number}</td>
                          <td>{p.payment_method}</td>
                          <td>{p.invoice_number}</td>
                          <td style={mono}>{fmtVES(p.amount_applied)}</td>
                          <td>{p.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Withholdings */}
              {(data.withholdings || []).length > 0 && (
                <div className="table-container">
                  <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Retenciones ({data.withholdings.length})</h3>
                  <table>
                    <thead><tr><th>Fecha</th><th>Tipo</th><th>Comprobante</th><th>Base</th><th>Tasa</th><th>Retenido VES</th></tr></thead>
                    <tbody>
                      {data.withholdings.map((w, i) => (
                        <tr key={i}>
                          <td>{fmtDate(w.withholding_date)}</td>
                          <td><span className="badge badge-orange">{w.type}</span></td>
                          <td style={mono}>{w.voucher_number}</td>
                          <td style={mono}>{fmtVES(w.base_amount)}</td>
                          <td>{parseFloat(w.rate)}%</td>
                          <td style={mono}>{fmtVES(w.amount_ves)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════ EXCHANGE DIFFERENCES ═══════════ */}
      {activeReport === 'exchange-differences' && (
        <>
          <FilterPanel onApply={loadReport} onClear={clearFilters}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Período</label>
              <input value={filters.period} onChange={(e) => setFilter('period', e.target.value)} placeholder="MM/YYYY" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Desde</label>
              <input type="date" value={filters.from_date} onChange={(e) => setFilter('from_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Hasta</label>
              <input type="date" value={filters.to_date} onChange={(e) => setFilter('to_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Moneda</label>
              <select value={filters.currency} onChange={(e) => setFilter('currency', e.target.value)}>
                <option value="">Todas</option>
                <option value="VES">VES</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Método Pago</label>
              <select value={filters.payment_method} onChange={(e) => setFilter('payment_method', e.target.value)}>
                <option value="">Todos</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="efectivo">Efectivo</option>
                <option value="pago_movil">Pago Móvil</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Mostrar</label>
              <select value={filters.show_all} onChange={(e) => setFilter('show_all', e.target.value)}>
                <option value="">Solo con diferencia</option>
                <option value="true">Todos los pagos</option>
              </select>
            </div>
          </FilterPanel>

          {data && (
            <>
              <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat-card">
                  <div className="label">Diferencial Neto</div>
                  <div className="value" style={{ color: (data.summary?.total_exchange_difference || 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {fmtVES(data.summary?.total_exchange_difference)}
                  </div>
                  <div className="sub">{data.summary?.count} operaciones</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
                  <div className="label">Ganancias Cambiarias</div>
                  <div className="value" style={{ fontSize: '1rem', color: 'var(--success)' }}>{fmtVES(data.summary?.total_gains)}</div>
                  <div className="sub">{data.summary?.gain_count} operaciones</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
                  <div className="label">Pérdidas Cambiarias</div>
                  <div className="value" style={{ fontSize: '1rem', color: 'var(--danger)' }}>{fmtVES(data.summary?.total_losses)}</div>
                  <div className="sub">{data.summary?.loss_count} operaciones</div>
                </div>
              </div>

              <div className="table-container">
                <table>
                  <thead><tr><th>Fecha</th><th>Referencia</th><th>Método</th><th>Moneda</th><th>Monto</th><th>Tasa Cambio</th><th>Diferencial</th><th>Facturas</th><th>Proveedor</th></tr></thead>
                  <tbody>
                    {(data.payments || []).map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDate(p.payment_date)}</td>
                        <td style={mono}>{p.reference_number}</td>
                        <td>{p.payment_method}</td>
                        <td>{p.currency}</td>
                        <td style={mono}>{Number(p.amount).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                        <td style={mono}>{Number(p.exchange_rate).toFixed(2)}</td>
                        <td style={{ ...mono, fontWeight: 'bold', color: parseFloat(p.exchange_difference) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {Number(p.exchange_difference).toFixed(2)}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{p.related_invoices || '-'}</td>
                        <td style={{ fontSize: '0.8rem' }}>{p.supplier_names || '-'}</td>
                      </tr>
                    ))}
                    {!(data.payments || []).length && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>Sin diferencias cambiarias en este período</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════ WITHHOLDINGS SUMMARY ═══════════ */}
      {activeReport === 'withholdings-summary' && (
        <>
          <FilterPanel onApply={loadReport} onClear={clearFilters}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Período</label>
              <input value={filters.period} onChange={(e) => setFilter('period', e.target.value)} placeholder="MM/YYYY" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Desde</label>
              <input type="date" value={filters.from_date} onChange={(e) => setFilter('from_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Hasta</label>
              <input type="date" value={filters.to_date} onChange={(e) => setFilter('to_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Tipo Retención</label>
              <select value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
                <option value="">Todas</option>
                <option value="IVA">IVA</option>
                <option value="ISLR">ISLR</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Proveedor</label>
              <select value={filters.supplier_id} onChange={(e) => setFilter('supplier_id', e.target.value)}>
                <option value="">Todos</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.business_name}</option>)}
              </select>
            </div>
          </FilterPanel>

          {data && (
            <>
              <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat-card">
                  <div className="label">Total Retenido VES</div>
                  <div className="value" style={{ fontSize: '1rem' }}>{fmtVES(data.summary?.total_ves)}</div>
                  <div className="sub">{data.summary?.total_count} retenciones</div>
                </div>
                <div className="stat-card">
                  <div className="label">Total Retenido USD</div>
                  <div className="value" style={{ fontSize: '1rem' }}>{fmtUSD(data.summary?.total_usd)}</div>
                </div>
                {data.summary?.by_type && Object.entries(data.summary.by_type).map(([type, info]) => (
                  <div className="stat-card" key={type} style={{ borderLeft: `4px solid ${type === 'IVA' ? 'var(--primary)' : 'var(--warning)'}` }}>
                    <div className="label">Retención {type}</div>
                    <div className="value" style={{ fontSize: '1rem' }}>{fmtVES(info.total_ves)}</div>
                    <div className="sub">{info.count} comprobantes | Base: {fmtVES(info.base_total)}</div>
                  </div>
                ))}
              </div>

              {/* By Supplier */}
              {(data.by_supplier || []).length > 0 && (
                <div className="table-container" style={{ marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Por Proveedor</h3>
                  <table>
                    <thead><tr><th>Proveedor</th><th>RIF</th><th>Retenciones</th><th>Total VES</th></tr></thead>
                    <tbody>
                      {data.by_supplier.map((s, i) => (
                        <tr key={i}>
                          <td>{s.supplier_name}</td>
                          <td style={{ ...mono, fontSize: '0.78rem' }}>{s.supplier_rif}</td>
                          <td style={{ textAlign: 'center' }}>{s.count}</td>
                          <td style={mono}>{fmtVES(s.total_ves)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Detail Table */}
              <div className="table-container">
                <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Detalle de Retenciones</h3>
                <table>
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Comprobante</th><th>RIF</th><th>Proveedor</th><th>Base Imp.</th><th>Tasa</th><th>Retenido VES</th><th>Retenido USD</th></tr></thead>
                  <tbody>
                    {(data.withholdings || []).map((w) => (
                      <tr key={w.id}>
                        <td>{fmtDate(w.withholding_date)}</td>
                        <td><span className={`badge badge-${w.type === 'IVA' ? 'blue' : 'orange'}`}>{w.type}</span></td>
                        <td style={mono}>{w.voucher_number}</td>
                        <td style={{ ...mono, fontSize: '0.78rem' }}>{w.supplier_rif}</td>
                        <td>{w.supplier_name}</td>
                        <td style={mono}>{fmtVES(w.base_amount)}</td>
                        <td>{parseFloat(w.rate)}%</td>
                        <td style={mono}><strong>{fmtVES(w.amount_ves)}</strong></td>
                        <td style={mono}>{fmtUSD(w.amount_usd)}</td>
                      </tr>
                    ))}
                    {!(data.withholdings || []).length && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>Sin retenciones para el período</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════ PAYMENT SUMMARY ═══════════ */}
      {activeReport === 'payment-summary' && (
        <>
          <FilterPanel onApply={loadReport} onClear={clearFilters}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Período</label>
              <input value={filters.period} onChange={(e) => setFilter('period', e.target.value)} placeholder="MM/YYYY" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Desde</label>
              <input type="date" value={filters.from_date} onChange={(e) => setFilter('from_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Hasta</label>
              <input type="date" value={filters.to_date} onChange={(e) => setFilter('to_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Método</label>
              <select value={filters.payment_method} onChange={(e) => setFilter('payment_method', e.target.value)}>
                <option value="">Todos</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="efectivo">Efectivo</option>
                <option value="pago_movil">Pago Móvil</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Moneda</label>
              <select value={filters.currency} onChange={(e) => setFilter('currency', e.target.value)}>
                <option value="">Todas</option>
                <option value="VES">VES</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </FilterPanel>

          {data && (
            <>
              <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat-card">
                  <div className="label">Total Pagado</div>
                  <div className="value" style={{ fontSize: '1rem' }}>{fmtVES(data.summary?.total_amount)}</div>
                  <div className="sub">{data.summary?.total_count} pagos</div>
                </div>
                <div className="stat-card">
                  <div className="label">ISLR Retenido</div>
                  <div className="value" style={{ fontSize: '1rem' }}>{fmtVES(data.summary?.total_islr)}</div>
                </div>
                <div className="stat-card">
                  <div className="label">IVA Retenido</div>
                  <div className="value" style={{ fontSize: '1rem' }}>{fmtVES(data.summary?.total_iva)}</div>
                </div>
              </div>

              {/* By Method and Currency badges */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: '0.85rem' }}>Por Método:</strong>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                      {data.summary?.by_method && Object.entries(data.summary.by_method).map(([m, d]) => (
                        <span key={m} className="badge badge-blue">{m}: {d.count} ({fmtVES(d.total)})</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.85rem' }}>Por Moneda:</strong>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                      {data.summary?.by_currency && Object.entries(data.summary.by_currency).map(([c, d]) => (
                        <span key={c} className="badge badge-green">{c}: {d.count} ({Number(d.total).toLocaleString('es-VE', { minimumFractionDigits: 2 })})</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="table-container">
                <table>
                  <thead><tr><th>Fecha</th><th>Referencia</th><th>Método</th><th>Moneda</th><th>Monto</th><th>Tasa Cambio</th><th>Dif. Cambiaria</th><th>ISLR Ret.</th><th>IVA Ret.</th><th>Observaciones</th></tr></thead>
                  <tbody>
                    {(data.payments || []).map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDate(p.payment_date)}</td>
                        <td style={mono}>{p.reference_number}</td>
                        <td>{p.payment_method}</td>
                        <td>{p.currency}</td>
                        <td style={mono}>{Number(p.amount).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                        <td style={mono}>{Number(p.exchange_rate).toFixed(2)}</td>
                        <td style={{ ...mono, color: parseFloat(p.exchange_difference || 0) !== 0 ? (parseFloat(p.exchange_difference) > 0 ? 'var(--success)' : 'var(--danger)') : undefined }}>
                          {Number(p.exchange_difference || 0).toFixed(2)}
                        </td>
                        <td style={mono}>{Number(p.islr_withheld || 0).toFixed(2)}</td>
                        <td style={mono}>{Number(p.iva_withheld || 0).toFixed(2)}</td>
                        <td style={{ fontSize: '0.8rem' }}>{(p.observations || '').substring(0, 30)}</td>
                      </tr>
                    ))}
                    {!(data.payments || []).length && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>Sin pagos en este período</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════ AUDIT LOG ═══════════ */}
      {activeReport === 'audit-log' && (
        <>
          <FilterPanel onApply={loadReport} onClear={clearFilters}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Desde</label>
              <input type="date" value={filters.from_date} onChange={(e) => setFilter('from', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Hasta</label>
              <input type="date" value={filters.to_date} onChange={(e) => setFilter('to', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Entidad</label>
              <select value={filters.entityType || ''} onChange={(e) => setFilter('entityType', e.target.value)}>
                <option value="">Todas</option>
                <option value="invoice">Facturas</option>
                <option value="payment">Pagos</option>
                <option value="withholding">Retenciones</option>
                <option value="supplier">Proveedores</option>
                <option value="bank_movement">Mov. Bancarios</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Acción</label>
              <select value={filters.action || ''} onChange={(e) => setFilter('action', e.target.value)}>
                <option value="">Todas</option>
                <option value="create">Crear</option>
                <option value="update">Actualizar</option>
                <option value="delete">Eliminar</option>
                <option value="void">Anular</option>
                <option value="status_change">Cambio Estado</option>
              </select>
            </div>
          </FilterPanel>

          {data && (
            <div className="table-container">
              <table>
                <thead><tr><th>Fecha</th><th>Usuario</th><th>Entidad</th><th>ID Entidad</th><th>Acción</th><th>IP</th></tr></thead>
                <tbody>
                  {(data || []).map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.8rem' }}>{new Date(log.created_at).toLocaleString('es-VE')}</td>
                      <td>{log.user_name || 'Sistema'}</td>
                      <td><span className="badge badge-gray">{log.entity_type}</span></td>
                      <td style={{ ...mono, fontSize: '0.72rem' }}>{(log.entity_id || '').substring(0, 8)}...</td>
                      <td><span className={`badge ${log.action === 'create' ? 'badge-green' : log.action === 'void' || log.action === 'delete' ? 'badge-red' : 'badge-blue'}`}>{log.action}</span></td>
                      <td style={{ ...mono, fontSize: '0.8rem' }}>{log.ip_address || '-'}</td>
                    </tr>
                  ))}
                  {!(data || []).length && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>Sin registros de auditoría</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>Cargando reporte...</div>}
    </div>
  );
}
