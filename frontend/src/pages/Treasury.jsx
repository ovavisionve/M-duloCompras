import React, { useState, useEffect } from 'react';
import { Lock, Plus, XCircle, Eye, X, TrendingUp, TrendingDown, Wallet, ArrowUpCircle, ArrowDownCircle, Download, BarChart3, AlertTriangle, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line, Legend, ReferenceLine } from 'recharts';
import api from '../api';
import { fmtNum, fmtRate, fmtDate } from '../utils/format';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const statusBadge = { completada: 'badge-green', anulada: 'badge-red' };
const statusLabel = { completada: 'Completada', anulada: 'Anulada', pendiente: 'Pendiente', usd_recibido: 'USD Recibido' };

const purchaseTypes = {
  pago_movil: 'Pago Móvil', zelle: 'Zelle', efectivo_ves: 'Efectivo VES',
  efectivo_usd: 'Efectivo USD', transferencia_ves: 'Transferencia VES',
  transferencia_usd: 'Transferencia USD', boleto_aereo: 'Boleto Aéreo',
  paypal: 'PayPal', binance: 'Binance (USDT)', cripto_otro: 'Cripto Otro',
};

export default function Treasury() {
  // Tab: 'divisas' or 'posicion'
  const [activeTab, setActiveTab] = useState('divisas');

  const [ops, setOps] = useState([]);
  const [filters, setFilters] = useState({ status: '', from_date: '', to_date: '', purchase_type: '' });
  const [pagination, setPagination] = useState({ page: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  // Suppliers
  const [suppliers, setSuppliers] = useState([]);

  // Bank accounts
  const [bankAccounts, setBankAccounts] = useState([]);

  // ─── Cash Position state ───
  const [cashPosition, setCashPosition] = useState(null);
  const [cashFlows, setCashFlows] = useState([]);
  const [cashFilters, setCashFilters] = useState({ flow_type: '', from_date: '', to_date: '' });
  const [cashPagination, setCashPagination] = useState({ page: 1, total: 0 });
  const [cashLoading, setCashLoading] = useState(false);
  const [showCashForm, setShowCashForm] = useState(false);
  const [cashForm, setCashForm] = useState({ flow_date: new Date().toISOString().split('T')[0], flow_type: 'ingreso', currency_mode: 'usd', amount_usd: '', amount_ves: '', bcv_rate: '', custom_rate: '', description: '', bank_account_id: '' });
  const [cashFormError, setCashFormError] = useState('');
  const [cashSubmitting, setCashSubmitting] = useState(false);

  // ─── Outflow detection state ───
  const [outflowData, setOutflowData] = useState(null);
  const [dismissedFlowIds, setDismissedFlowIds] = useState(new Set());

  // ─── Binance rate state ───
  const [binanceRate, setBinanceRate] = useState(null);

  // ─── Dashboard state ───
  const [dashData, setDashData] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    operation_date: today, amount_ves: '', bcv_rate: '', purchase_rate: '',
    purchase_type: 'pago_movil', supplier_id: '', description: '', destination_type: 'banco_usd',
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

  // Load suppliers and bank accounts once
  useEffect(() => {
    api.get('/treasury/suppliers').then((r) => setSuppliers(r.data.data || [])).catch(() => {});
    api.get('/banking/bank-accounts').then((r) => setBankAccounts(r.data.data || [])).catch(() => {});
  }, []);

  // Fetch Binance P2P rate on mount (and every 30 min)
  useEffect(() => {
    const fetchBinance = () => {
      api.get('/exchange-rates/binance').then((r) => {
        if (r.data.data) setBinanceRate(r.data.data);
      }).catch(() => {});
    };
    fetchBinance();
    const interval = setInterval(fetchBinance, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto fetch BCV rate when form opens
  useEffect(() => {
    if (showForm) {
      api.get('/exchange-rates/today').then((r) => {
        if (r.data.data) setForm((f) => ({ ...f, bcv_rate: String(r.data.data.rate) }));
      }).catch(() => {});
    }
  }, [showForm]);

  // ─── Dashboard loader ───
  const loadDashboard = () => {
    setDashLoading(true);
    api.get('/treasury/dashboard')
      .then((r) => setDashData(r.data.data))
      .catch(console.error)
      .finally(() => setDashLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'dashboard') loadDashboard();
  }, [activeTab]);

  // ─── Download helpers ───
  const downloadFile = (url, filename, queryFilters = {}) => {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams();
    Object.entries(queryFilters).forEach(([k, v]) => { if (v) params.set(k, v); });
    const qs = params.toString();
    const fullUrl = `/api/v1${url}${qs ? `?${qs}` : ''}`;
    fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}: ${r.statusText}`);
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert(`Error al descargar: ${err.message}`));
  };

  // ─── Cash Position / Flows loaders ───
  const loadCashPosition = () => {
    api.get('/treasury/cash/position')
      .then((r) => setCashPosition(r.data.data))
      .catch(console.error);
  };

  const loadCashFlows = () => {
    setCashLoading(true);
    const params = { page: cashPagination.page, limit: 20 };
    if (cashFilters.flow_type) params.flow_type = cashFilters.flow_type;
    if (cashFilters.from_date) params.from_date = cashFilters.from_date;
    if (cashFilters.to_date) params.to_date = cashFilters.to_date;
    api.get('/treasury/cash/flows', { params })
      .then((r) => { setCashFlows(r.data.data); setCashPagination((p) => ({ ...p, total: r.data.pagination?.total || 0 })); })
      .catch(console.error)
      .finally(() => setCashLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'posicion') { loadCashPosition(); loadCashFlows(); }
    if (activeTab === 'divisas') { load(); loadCashFlows(); }
  }, [activeTab, cashFilters, cashPagination.page]);

  // Auto fetch BCV for cash form (needed for ves and custom modes)
  useEffect(() => {
    if (showCashForm) {
      api.get('/exchange-rates/today').then((r) => {
        if (r.data.data) setCashForm((f) => ({ ...f, bcv_rate: String(r.data.data.rate) }));
      }).catch(() => {});
    }
  }, [showCashForm]);

  const handleCashCreate = async (e) => {
    e.preventDefault();
    setCashFormError('');
    const mode = cashForm.currency_mode;

    if (mode === 'usd') {
      const usd = parseFloat(cashForm.amount_usd);
      if (!usd || usd <= 0) { setCashFormError('Ingrese monto USD válido'); return; }
    } else if (mode === 'custom' || mode === 'binance') {
      const usd = parseFloat(cashForm.amount_usd);
      const cRate = parseFloat(cashForm.custom_rate);
      if (!usd || usd <= 0) { setCashFormError('Ingrese monto USD válido'); return; }
      if (!cRate || cRate <= 0) { setCashFormError(mode === 'binance' ? 'La tasa Binance no está disponible' : 'Ingrese tasa personalizada válida'); return; }
    } else {
      const ves = parseFloat(cashForm.amount_ves);
      const bcv = parseFloat(cashForm.bcv_rate);
      if (!ves || ves <= 0) { setCashFormError('Ingrese monto VES válido'); return; }
      if (!bcv || bcv <= 0) { setCashFormError('La tasa BCV es requerida'); return; }
    }

    setCashSubmitting(true);
    try {
      const payload = { ...cashForm };
      if (payload.currency_mode === 'binance') payload.currency_mode = 'custom';
      await api.post('/treasury/cash/flows', payload);
      setShowCashForm(false);
      setCashForm({ flow_date: new Date().toISOString().split('T')[0], flow_type: 'ingreso', currency_mode: 'usd', amount_usd: '', amount_ves: '', bcv_rate: '', custom_rate: '', description: '', bank_account_id: '' });
      loadCashPosition(); loadCashFlows(); loadOutflows();
    } catch (err) {
      setCashFormError(err.response?.data?.error?.message || 'Error al registrar movimiento');
    } finally { setCashSubmitting(false); }
  };

  const voidCashFlow = async (id) => {
    const reason = window.prompt('Motivo de anulación:');
    if (!reason) return;
    try { await api.post(`/treasury/cash/flows/${id}/void`, { reason }); loadCashPosition(); loadCashFlows(); setDashData(null); }
    catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  // ─── Outflow detection on mount ───
  const loadOutflows = () => {
    api.get('/treasury/detect-outflows')
      .then((r) => setOutflowData(r.data.data))
      .catch(() => {});
  };

  useEffect(() => {
    loadOutflows();
  }, []);

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
      loadCashPosition(); loadCashFlows();
      setDashData(null); // force dashboard refresh on next visit
    } catch (err) {
      setFormError(err.response?.data?.error?.message || 'Error al crear operación');
    } finally { setSubmitting(false); }
  };

  const voidOp = async (id) => {
    const reason = window.prompt('Motivo de anulación:');
    if (!reason) return;
    try { await api.post(`/treasury/${id}/void`, { reason }); load(); loadCashPosition(); loadCashFlows(); setDashData(null); }
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
          {activeTab === 'divisas' && (
            <>
              <button className="btn" onClick={() => downloadFile('/treasury/reports/operations/pdf', 'compra_divisas.pdf', filters)} title="Descargar PDF">
                <Download size={16} /> PDF
              </button>
              <button className="btn" onClick={() => downloadFile('/treasury/reports/operations/excel', 'compra_divisas.xlsx', filters)} title="Descargar Excel">
                <Download size={16} /> Excel
              </button>
              <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                <Plus size={16} /> Comprar Divisas
              </button>
            </>
          )}
          {activeTab === 'posicion' && (
            <>
              <button className="btn" onClick={() => downloadFile('/treasury/reports/cashflows/pdf', 'posicion_cambiaria.pdf', cashFilters)} title="Descargar PDF">
                <Download size={16} /> PDF
              </button>
              <button className="btn" onClick={() => downloadFile('/treasury/reports/cashflows/excel', 'posicion_cambiaria.xlsx', cashFilters)} title="Descargar Excel">
                <Download size={16} /> Excel
              </button>
              <button className="btn btn-primary" onClick={() => setShowCashForm(!showCashForm)}>
                <Plus size={16} /> Registrar Movimiento
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Inflow Alert (money coming in) ── */}
      {outflowData && outflowData.recent_manual_ingresos?.filter((i) => !dismissedFlowIds.has(i.id)).length > 0 && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#166534' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flex: 1 }}>
              <ArrowUpCircle size={20} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <strong>Hoy entraron {outflowData.today_ingresos_count} ingreso(s) de dinero.</strong>
                <div style={{ marginTop: '0.25rem' }}>
                  Venta de boleto con ganancia (se queda como ingreso) o compra de divisas?
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  {outflowData.recent_manual_ingresos.filter((i) => !dismissedFlowIds.has(i.id)).slice(0, 5).map((ingreso) => (
                    <div key={ingreso.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem', background: '#bbf7d0', borderRadius: '6px', marginBottom: '0.3rem' }}>
                      <span style={{ flex: 1, fontSize: '0.82rem' }}>
                        {fmtDate(ingreso.flow_date)}: <strong>{fmtNum(ingreso.amount_ves)} VES</strong> ({fmtNum(ingreso.usd_equivalent)} USD) - {ingreso.description || 'Sin descripción'}
                      </span>
                      <button
                        className="btn btn-sm"
                        style={{ background: '#16a34a', color: 'white', border: 'none', fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                        onClick={() => {
                          setDismissedFlowIds((prev) => new Set([...prev, ingreso.id]));
                        }}
                        title="Es venta de boleto - ya está registrado como ingreso en posición cambiaria"
                      >
                        Venta Boleto (OK)
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ background: '#2563eb', color: 'white', border: 'none', fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                        onClick={() => {
                          setActiveTab('divisas');
                          setShowForm(true);
                          setForm((f) => ({ ...f, amount_ves: String(ingreso.amount_ves), description: `Compra USD: ${ingreso.description || ''}`.trim() }));
                          setDismissedFlowIds((prev) => new Set([...prev, ingreso.id]));
                        }}
                        title="Registrar como compra de divisas para calcular diferencial"
                      >
                        Compra Divisas
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={() => setDismissedFlowIds((prev) => new Set([...prev, ...outflowData.recent_manual_ingresos.map((i) => i.id)]))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontWeight: 600, marginLeft: '0.5rem' }}><X size={16} /></button>
          </div>
        </div>
      )}

      {/* ── Outflow Alert ── */}
      {outflowData && outflowData.recent_manual_egresos?.filter((e) => !dismissedFlowIds.has(e.id)).length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#92400e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flex: 1 }}>
              <AlertTriangle size={20} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <strong>Hoy hubo {outflowData.today_egresos_count} salida(s) de dinero.</strong>
                <div style={{ marginTop: '0.25rem' }}>
                  Fue una compra de divisas? Regístrala para calcular el diferencial (ganancia o pérdida):
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  {outflowData.recent_manual_egresos.filter((e) => !dismissedFlowIds.has(e.id)).slice(0, 5).map((egreso) => (
                    <div key={egreso.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem', background: '#fde68a', borderRadius: '6px', marginBottom: '0.3rem' }}>
                      <span style={{ flex: 1, fontSize: '0.82rem' }}>
                        {fmtDate(egreso.flow_date)}: <strong>{fmtNum(egreso.amount_ves)} VES</strong> - {egreso.description || 'Sin descripción'}
                      </span>
                      <button
                        className="btn btn-sm"
                        style={{ background: '#2563eb', color: 'white', border: 'none', fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                        onClick={() => {
                          setActiveTab('divisas');
                          setShowForm(true);
                          setForm((f) => ({ ...f, amount_ves: String(egreso.amount_ves), description: `Compra USD: ${egreso.description || ''}`.trim() }));
                          setDismissedFlowIds((prev) => new Set([...prev, egreso.id]));
                        }}
                      >
                        Registrar Compra Divisas
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ background: 'transparent', color: '#92400e', border: '1px solid #d97706', fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                        onClick={() => setDismissedFlowIds((prev) => new Set([...prev, egreso.id]))}
                      >
                        Ignorar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={() => setDismissedFlowIds((prev) => new Set([...prev, ...outflowData.recent_manual_egresos.map((e) => e.id)]))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontWeight: 600, marginLeft: '0.5rem' }}><X size={16} /></button>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderBottom: '2px solid var(--gray-200)' }}>
        {[
          { key: 'dashboard', icon: <BarChart3 size={16} />, label: 'Dashboard' },
          { key: 'divisas', icon: <TrendingUp size={16} />, label: 'Compra de Divisas' },
          { key: 'posicion', icon: <Wallet size={16} />, label: 'Posición Cambiaria' },
        ].map((tab) => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{ padding: '0.6rem 1.2rem', border: 'none', background: 'none', cursor: 'pointer', fontWeight: activeTab === tab.key ? 600 : 400, color: activeTab === tab.key ? 'var(--primary)' : 'var(--gray-500)', borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: '-2px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════ TAB: DASHBOARD ══════════ */}
      {activeTab === 'dashboard' && <>
        {dashLoading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-500)' }}>Cargando dashboard...</div>}
        {dashData && <>
          {/* ── SECTION: Compra de Divisas (USD) ── */}
          <div style={{ marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--gray-500)', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <DollarSign size={16} /> Compra de Divisas — {dashData.period}
            </h3>
          </div>
          <div className="stats-grid">
            <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
              <div className="label">Operaciones del Mes</div>
              <div className="value">{dashData.kpis.operations_count}</div>
              <div className="sub">Período: {dashData.period}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
              <div className="label">VES Invertidos</div>
              <div className="value" style={{ color: 'var(--danger)', fontSize: '1.1rem' }}>{fmtNum(dashData.kpis.total_ves)}</div>
              <div className="sub">Bolívares utilizados en compras</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
              <div className="label">USD Comprados</div>
              <div className="value" style={{ color: 'var(--success)', fontSize: '1.1rem' }}>{fmtNum(dashData.kpis.total_usd)}</div>
              <div className="sub">Dólares reales obtenidos</div>
            </div>
            <div className="stat-card" style={{ borderLeft: `4px solid ${dashData.kpis.diff_usd >= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
              <div className="label">Resultado Cambiario</div>
              <div className="value" style={{ color: dashData.kpis.diff_usd >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '1.1rem' }}>
                {dashData.kpis.diff_usd >= 0 ? '+' : ''}{fmtNum(dashData.kpis.diff_usd)} USD
              </div>
              <div className="sub">{dashData.kpis.diff_usd >= 0 ? 'Ganancia' : 'Pérdida'} por diferencial de tasas</div>
            </div>
          </div>

          {/* ── SECTION: Posición Cambiaria (VES) ── */}
          {dashData.position && <>
            <div style={{ marginBottom: '0.5rem', marginTop: '0.5rem' }}>
              <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--gray-500)', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wallet size={16} /> Posición Cambiaria VES — {dashData.period}
              </h3>
            </div>
            <div className="stats-grid">
              <div className="stat-card" style={{ borderLeft: '4px solid #16a34a' }}>
                <div className="label">Ingresos VES del Mes</div>
                <div className="value" style={{ color: '#16a34a', fontSize: '1.1rem' }}>+{fmtNum(dashData.position.month_ingresos_ves)}</div>
                <div className="sub">{dashData.position.month_flow_count} movimiento(s)</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid #dc2626' }}>
                <div className="label">Egresos VES del Mes</div>
                <div className="value" style={{ color: '#dc2626', fontSize: '1.1rem' }}>-{fmtNum(dashData.position.month_egresos_ves)}</div>
                <div className="sub">Salidas de bolívares</div>
              </div>
              <div className="stat-card" style={{ borderLeft: `4px solid ${dashData.position.month_neto_ves >= 0 ? '#16a34a' : '#dc2626'}` }}>
                <div className="label">Neto VES del Mes</div>
                <div className="value" style={{ color: dashData.position.month_neto_ves >= 0 ? '#16a34a' : '#dc2626', fontSize: '1.1rem' }}>
                  {dashData.position.month_neto_ves >= 0 ? '+' : ''}{fmtNum(dashData.position.month_neto_ves)}
                </div>
                <div className="sub">Ingresos - Egresos</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
                <div className="label">Saldo Acumulado VES</div>
                <div className="value" style={{ color: dashData.position.balance_ves >= 0 ? '#16a34a' : '#dc2626', fontSize: '1.1rem' }}>
                  {fmtNum(dashData.position.balance_ves)}
                </div>
                <div className="sub">Equiv. {fmtNum(dashData.position.balance_usd_equiv)} USD @ BCV</div>
              </div>
            </div>
          </>}

          {/* Rate cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginBottom: '1rem', marginTop: '0.25rem' }}>
            <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-500)', fontWeight: 600 }}>Tasa BCV Hoy</div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, color: 'var(--primary)' }}>{fmtRate(dashData.kpis.today_bcv_rate)}</div>
            </div>
            <div className="card" style={{ padding: '0.75rem', textAlign: 'center', border: binanceRate ? '2px solid #f59e0b' : undefined }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 600 }}>Tasa Binance P2P</div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, color: '#f59e0b' }}>
                {binanceRate ? fmtRate(binanceRate.rate) : '—'}
              </div>
              {binanceRate && dashData.kpis.today_bcv_rate > 0 && (
                <div style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>
                  +{fmtNum(((binanceRate.rate / dashData.kpis.today_bcv_rate - 1) * 100))}% vs BCV
                </div>
              )}
            </div>
            <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-500)', fontWeight: 600 }}>Tasa Prom. Compra</div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, color: 'var(--warning)' }}>{fmtRate(dashData.kpis.avg_purchase_rate)}</div>
            </div>
            <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-500)', fontWeight: 600 }}>Spread Promedio</div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, color: 'var(--danger)' }}>{fmtNum(dashData.kpis.spread_pct)}%</div>
            </div>
            <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-500)', fontWeight: 600 }}>Saldo VES Total</div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, color: dashData.kpis.balance_ves >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtNum(dashData.kpis.balance_ves)}</div>
            </div>
          </div>

          {/* Charts Row 1: Compras + Distribución tipo compra */}
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Compras Diarias (VES)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dashData.charts.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                  <Tooltip formatter={(v) => fmtNum(v)} labelFormatter={(l) => `Fecha: ${l}`} />
                  <Bar dataKey="ves" fill="#2563eb" radius={[4, 4, 0, 0]} name="VES" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3>Distribución por Tipo de Compra</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={dashData.charts.by_type} dataKey="ves" nameKey="type" cx="50%" cy="50%" outerRadius={95} innerRadius={45} paddingAngle={2}
                    label={({ type, percent }) => `${purchaseTypes[type] || type} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {dashData.charts.by_type.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtNum(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Charts Row 2: Flujo de Caja VES + Distribución flujos VES */}
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Flujo de Caja VES — Ingresos vs Egresos</h3>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dashData.charts.cash_flow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                  <Tooltip formatter={(v) => fmtNum(v)} />
                  <Legend verticalAlign="top" height={30} />
                  <Bar dataKey="ingresos" fill="#16a34a" name="Ingresos VES" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="egresos" fill="#dc2626" name="Egresos VES" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="saldo" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} name="Saldo Acum." />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3>Distribución de Movimientos VES</h3>
              {dashData.charts.flow_by_type?.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={dashData.charts.flow_by_type} dataKey="ves" nameKey="type" cx="50%" cy="50%" outerRadius={95} innerRadius={40} paddingAngle={2}
                      label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                      {dashData.charts.flow_by_type.map((entry, i) => (
                        <Cell key={i} fill={entry.flow_type === 'ingreso' ? ['#16a34a', '#22c55e', '#4ade80', '#86efac'][i % 4] : ['#dc2626', '#ef4444', '#f87171', '#fca5a5'][i % 4]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtNum(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260, color: 'var(--gray-400)', fontSize: '0.85rem' }}>Sin movimientos VES este mes</div>
              )}
            </div>
          </div>

          {/* Charts Row 3: Resultado cambiario + USD por día */}
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Resultado Cambiario por Operación (USD)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dashData.charts.diff_scatter}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" fontSize={10} tickFormatter={(d) => d ? `${d.split('-')[2]}/${d.split('-')[1]}` : ''} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v, name) => [fmtNum(v), name === 'diff_usd' ? 'Dif. USD' : name]} labelFormatter={(d) => `Fecha: ${d}`} />
                  <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
                  <Bar dataKey="diff_usd" name="Dif. USD" radius={[3, 3, 0, 0]}>
                    {dashData.charts.diff_scatter.map((entry, i) => (
                      <Cell key={i} fill={entry.diff_usd >= 0 ? '#16a34a' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3>USD Comprados por Día</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={dashData.charts.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v) => fmtNum(v)} />
                  <Area type="monotone" dataKey="usd" stroke="#16a34a" fill="#bbf7d0" strokeWidth={2} name="USD" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Suppliers */}
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Top 5 Proveedores / Destinos</h3>
              {dashData.top_suppliers.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid var(--gray-200)' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{s.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{s.count} operación(es)</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--danger)' }}>{fmtNum(s.ves)} VES</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--success)' }}>{fmtNum(s.usd)} USD</div>
                  </div>
                </div>
              ))}
              {!dashData.top_suppliers.length && <div style={{ color: 'var(--gray-400)', fontSize: '0.85rem', padding: '1rem 0' }}>Sin operaciones en este período</div>}
            </div>

            {/* Resumen bimoneda */}
            <div className="chart-card">
              <h3>Resumen Bimoneda</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '0.5rem 0' }}>
                <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#16a34a', fontWeight: 600, marginBottom: '0.25rem' }}>Posición VES</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.4rem', fontWeight: 700, color: '#16a34a' }}>{fmtNum(dashData.position?.balance_ves || dashData.kpis.balance_ves)}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Total ingresos: {fmtNum(dashData.position?.total_ingresos_ves || 0)}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)' }}>Total egresos: {fmtNum(dashData.position?.total_egresos_ves || 0)}</div>
                </div>
                <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#2563eb', fontWeight: 600, marginBottom: '0.25rem' }}>Posición USD</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.4rem', fontWeight: 700, color: '#2563eb' }}>{fmtNum(dashData.kpis.total_usd)}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Equiv. VES @ BCV: {fmtNum(dashData.kpis.total_usd * dashData.kpis.today_bcv_rate)}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)' }}>Resultado: {dashData.kpis.diff_usd >= 0 ? '+' : ''}{fmtNum(dashData.kpis.diff_usd)} USD</div>
                </div>
              </div>
              <div style={{ background: '#faf5ff', borderRadius: '8px', padding: '0.75rem', textAlign: 'center', marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#7c3aed', fontWeight: 600 }}>Patrimonio Total (equiv. USD @ BCV)</div>
                <div style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700, color: '#7c3aed' }}>
                  {fmtNum(dashData.kpis.total_usd + (dashData.position?.balance_usd_equiv || dashData.kpis.balance_usd))}
                </div>
              </div>
            </div>
          </div>
        </>}
        {(!dashData || (dashData && dashData.kpis.operations_count === 0 && (!dashData.position || dashData.position.month_flow_count === 0))) && !dashLoading && (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ color: 'var(--gray-400)' }}>
              {!dashData ? 'No hay datos disponibles.' : 'No hay operaciones ni movimientos este mes.'}
            </div>
            <div style={{ color: 'var(--gray-400)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Registre operaciones en "Compra de Divisas" o movimientos en "Posición Cambiaria" para ver el dashboard.
            </div>
          </div>
        )}
      </>}

      {/* ══════════ TAB: COMPRA DE DIVISAS ══════════ */}
      {activeTab === 'divisas' && <>

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
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Tasa de Compra ({purchaseTypes[form.purchase_type] || 'Paralela'}) *</span>
                  {binanceRate && (
                    <button type="button" style={{ fontSize: '0.68rem', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '4px', padding: '1px 6px', cursor: 'pointer', color: '#92400e', fontWeight: 600 }}
                      onClick={() => setForm({ ...form, purchase_rate: String(binanceRate.rate) })}>
                      Usar Binance ({fmtRate(binanceRate.rate)})
                    </button>
                  )}
                </label>
                <input type="number" step="0.000001" value={form.purchase_rate} onChange={(e) => setForm({ ...form, purchase_rate: e.target.value })} required placeholder="Tasa real a la que compras" style={{ border: '2px solid var(--warning)' }} />
              </div>
            </div>

            {/* ── Live comparison (always visible) ── */}
            {(() => {
              const p = calcPreview();
              if (!p) {
                return (
                  <div style={{ padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '2px dashed var(--gray-300)', background: '#f9fafb', textAlign: 'center' }}>
                    <TrendingUp size={28} color="var(--gray-400)" style={{ margin: '0 auto 0.5rem' }} />
                    <div style={{ color: 'var(--gray-500)', fontSize: '0.85rem', fontWeight: 500 }}>Comparativa en Tiempo Real</div>
                    <div style={{ color: 'var(--gray-400)', fontSize: '0.78rem', marginTop: '0.25rem' }}>Ingresa el monto VES y la tasa BCV para ver la comparación entre BCV y la tasa de compra.</div>
                  </div>
                );
              }
              return (
                <div style={{ padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '2px solid', borderColor: p.hasPurchase ? (p.diffUsd >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--info)', background: p.hasPurchase ? (p.diffUsd >= 0 ? '#f0fdf4' : '#fef2f2') : '#f0f9ff' }}>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--gray-500)', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Comparativa en Tiempo Real</div>
                  <div style={{ display: 'grid', gridTemplateColumns: p.hasPurchase ? '1fr auto 1fr' : '1fr', gap: '0.75rem', fontSize: '0.9rem', alignItems: 'center' }}>
                    <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.7)', borderRadius: '6px' }}>
                      <div style={{ color: 'var(--gray-500)', fontSize: '0.72rem', textTransform: 'uppercase' }}>A tasa BCV ({fmtRate(p.bcv)})</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, color: 'var(--gray-700)' }}>{fmtNum(p.usdBcv)} USD</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>Valor "oficial" que reportarías</div>
                    </div>
                    {p.hasPurchase && (
                      <>
                        <div style={{ fontSize: '1.5rem', color: 'var(--gray-400)', fontWeight: 300 }}>vs</div>
                        <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.7)', borderRadius: '6px' }}>
                          <div style={{ color: 'var(--gray-500)', fontSize: '0.72rem', textTransform: 'uppercase' }}>A {purchaseTypes[form.purchase_type] || 'tasa paralela'} ({fmtRate(p.pRate)})</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, color: p.diffUsd >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtNum(p.usdReal)} USD</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>Lo que realmente compras</div>
                        </div>
                      </>
                    )}
                  </div>
                  {p.hasPurchase && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {p.diffUsd >= 0 ? <TrendingUp size={22} color="var(--success)" /> : <TrendingDown size={22} color="var(--danger)" />}
                        <span style={{ fontWeight: 700, fontSize: '1.3rem', color: p.diffUsd >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {p.diffUsd >= 0 ? 'GANANCIA' : 'PÉRDIDA'}: {p.diffUsd >= 0 ? '+' : ''}{fmtNum(p.diffUsd)} USD
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginTop: '0.35rem', lineHeight: '1.4' }}>
                        Con {fmtNum(p.ves)} VES: a BCV ({fmtRate(p.bcv)}) serían {fmtNum(p.usdBcv)} USD, pero a {purchaseTypes[form.purchase_type] || 'tasa paralela'} ({fmtRate(p.pRate)}) {p.diffUsd >= 0 ? 'obtienes' : 'solo consigues'} {fmtNum(p.usdReal)} USD.
                        {p.diffUsd < 0 ? ` Pierdes ${fmtNum(Math.abs(p.diffUsd))} USD por la diferencia de tasas.` : ` Ganas ${fmtNum(p.diffUsd)} USD respecto a BCV.`}
                      </div>
                    </div>
                  )}
                  {!p.hasPurchase && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--info)', fontStyle: 'italic' }}>
                      Ingresa la tasa de compra ({purchaseTypes[form.purchase_type] || 'paralela'}) para ver la comparación y el diferencial.
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

      {/* Pagination */}
      {pagination.total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn btn-sm" disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>Anterior</button>
          <span style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>Página {pagination.page} de {Math.ceil(pagination.total / 20)} ({pagination.total} operaciones)</span>
          <button className="btn btn-sm" disabled={pagination.page >= Math.ceil(pagination.total / 20)} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>Siguiente</button>
        </div>
      )}

      {/* ── Recent Cash Flow Movements (from Posición Cambiaria) ── */}
      {cashFlows.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Wallet size={16} /> Movimientos Recientes (Posición Cambiaria)
            </h3>
            <button className="btn btn-sm" onClick={() => setActiveTab('posicion')} style={{ fontSize: '0.75rem' }}>
              Ver todos
            </button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>VES</th>
                  <th>USD Equiv.</th>
                  <th>Tasa</th>
                  <th>Origen</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {cashFlows.slice(0, 10).map((f) => (
                  <tr key={f.id} style={f.status === 'anulado' ? { opacity: 0.5 } : {}}>
                    <td>{fmtDate(f.flow_date)}</td>
                    <td>
                      <span className={`badge ${f.flow_type === 'ingreso' ? 'badge-green' : 'badge-red'}`}>
                        {f.flow_type === 'ingreso' ? 'Ingreso' : 'Egreso'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: f.flow_type === 'ingreso' ? 'var(--success)' : 'var(--danger)' }}>
                      {f.flow_type === 'ingreso' ? '+' : '-'}{fmtNum(f.amount_ves)}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--gray-600)' }}>{fmtNum(f.usd_equivalent)}</td>
                    <td style={{ fontFamily: 'monospace' }}>{fmtRate(f.bcv_rate)}</td>
                    <td style={{ fontSize: '0.78rem' }}>
                      {f.reference_type === 'treasury_operation' ? <span className="badge badge-gray">Compra USD</span> : <span className="badge badge-gray">Manual</span>}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--gray-500)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </>}

      {/* ══════════ TAB: POSICIÓN CAMBIARIA ══════════ */}
      {activeTab === 'posicion' && <>

        {/* ── Rates summary bar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {cashPosition && (
            <>
              <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-500)', fontWeight: 600 }}>Saldo VES</div>
                <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: cashPosition.balance_ves >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtNum(cashPosition.balance_ves)}</div>
              </div>
              <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-500)', fontWeight: 600 }}>Equiv. USD (BCV)</div>
                <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>{fmtNum(cashPosition.balance_usd_today)}</div>
              </div>
              <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-500)', fontWeight: 600 }}>USD al Ingresar</div>
                <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: 'var(--gray-600)' }}>{fmtNum(cashPosition.balance_usd_at_entry)}</div>
              </div>
              <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-500)', fontWeight: 600 }}>Revaluación</div>
                <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: cashPosition.revaluation_usd >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {cashPosition.revaluation_usd >= 0 ? '+' : ''}{fmtNum(cashPosition.revaluation_usd)} USD
                </div>
              </div>
            </>
          )}
          {binanceRate && (
            <div className="card" style={{ padding: '0.75rem', textAlign: 'center', border: '2px solid #f59e0b' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 600 }}>Tasa Binance P2P</div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: '#f59e0b' }}>{fmtRate(binanceRate.rate)}</div>
              {cashPosition && binanceRate.rate > 0 && (
                <div style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>
                  Equiv: {fmtNum(cashPosition.balance_ves / binanceRate.rate)} USD
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Dual Currency Summary ── */}
        {cashPosition && cashPosition.movements_count > 0 && (
          <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
            <h4 style={{ fontSize: '0.82rem', textTransform: 'uppercase', color: 'var(--gray-500)', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>Resumen Contable Dual (VES / USD)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)', textTransform: 'uppercase' }}>Ingresos</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--success)' }}>{fmtNum(cashPosition.total_ingresos_ves)} VES</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--gray-500)' }}>{fmtNum(cashPosition.total_ingresos_usd_entry)} USD</div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)', textTransform: 'uppercase' }}>Egresos</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--danger)' }}>{fmtNum(cashPosition.total_egresos_ves)} VES</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--gray-500)' }}>{fmtNum(cashPosition.total_egresos_usd_entry)} USD</div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)', textTransform: 'uppercase' }}>Resultado Neto</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: cashPosition.balance_ves >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtNum(cashPosition.balance_ves)} VES</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600, color: cashPosition.balance_usd_at_entry >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtNum(cashPosition.balance_usd_at_entry)} USD (histórico)</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600, color: cashPosition.balance_usd_today >= 0 ? 'var(--primary)' : 'var(--danger)' }}>{fmtNum(cashPosition.balance_usd_today)} USD (hoy BCV)</div>
                {binanceRate && cashPosition.balance_ves > 0 && (
                  <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600, color: '#f59e0b' }}>{fmtNum(cashPosition.balance_ves / binanceRate.rate)} USD (Binance)</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Cash Flow Form ── */}
        {showCashForm && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Registrar Movimiento</h3>
            {cashFormError && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{cashFormError}</div>}
            <form onSubmit={handleCashCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Fecha *</label>
                  <input type="date" value={cashForm.flow_date} onChange={(e) => setCashForm({ ...cashForm, flow_date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Tipo *</label>
                  <select value={cashForm.flow_type} onChange={(e) => setCashForm({ ...cashForm, flow_type: e.target.value })}>
                    <option value="ingreso">Ingreso (dinero entra)</option>
                    <option value="egreso">Egreso (dinero sale)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Moneda *</label>
                  <select value={cashForm.currency_mode} onChange={(e) => {
                    const mode = e.target.value;
                    const update = { ...cashForm, currency_mode: mode };
                    if (mode === 'binance' && binanceRate) update.custom_rate = String(binanceRate.rate);
                    setCashForm(update);
                  }}>
                    <option value="usd">Dólares (USD) - sin tasa</option>
                    <option value="ves">Bolívares (VES) - tasa BCV referencia</option>
                    <option value="binance">Dólares (USD) - tasa Binance P2P</option>
                    <option value="custom">Dólares (USD) - tasa personalizada</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Banco</label>
                  <select value={cashForm.bank_account_id} onChange={(e) => setCashForm({ ...cashForm, bank_account_id: e.target.value })}>
                    <option value="">-- Sin banco (solo tesorería) --</option>
                    {bankAccounts.map((ba) => <option key={ba.id} value={ba.id}>{ba.bank_name} ({ba.currency}) - {ba.account_number}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                {/* USD input (for usd, custom, and binance modes) */}
                {(cashForm.currency_mode === 'usd' || cashForm.currency_mode === 'custom' || cashForm.currency_mode === 'binance') && (
                  <div className="form-group">
                    <label><DollarSign size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Monto USD *</label>
                    <input type="number" step="0.01" value={cashForm.amount_usd} onChange={(e) => setCashForm({ ...cashForm, amount_usd: e.target.value })} required placeholder="Ej: 100" style={{ border: '2px solid var(--success)' }} />
                  </div>
                )}

                {/* VES input (for ves mode) */}
                {cashForm.currency_mode === 'ves' && (
                  <div className="form-group">
                    <label>Monto VES *</label>
                    <input type="number" step="0.01" value={cashForm.amount_ves} onChange={(e) => setCashForm({ ...cashForm, amount_ves: e.target.value })} required placeholder="Ej: 5000000" />
                  </div>
                )}

                {/* BCV rate (for ves mode and as reference for custom/usd/binance) */}
                {(cashForm.currency_mode === 'ves' || cashForm.currency_mode === 'custom' || cashForm.currency_mode === 'binance') && (
                  <div className="form-group">
                    <label>Tasa BCV {cashForm.currency_mode === 'custom' ? '(referencia)' : '*'}</label>
                    <input type="number" step="0.000001" value={cashForm.bcv_rate} onChange={(e) => setCashForm({ ...cashForm, bcv_rate: e.target.value })} required={cashForm.currency_mode === 'ves'} style={{ background: '#f0f9ff' }} />
                  </div>
                )}

                {/* Custom rate (for custom mode) */}
                {cashForm.currency_mode === 'custom' && (
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Tasa Personalizada * <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>(USD x Tasa = VES)</span></span>
                      {binanceRate && (
                        <button type="button" style={{ fontSize: '0.68rem', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '4px', padding: '1px 6px', cursor: 'pointer', color: '#92400e', fontWeight: 600 }}
                          onClick={() => setCashForm({ ...cashForm, custom_rate: String(binanceRate.rate) })}>
                          Usar Binance ({fmtRate(binanceRate.rate)})
                        </button>
                      )}
                    </label>
                    <input type="number" step="0.000001" value={cashForm.custom_rate} onChange={(e) => setCashForm({ ...cashForm, custom_rate: e.target.value })} required placeholder="Ej: 55.00" style={{ border: '2px solid var(--warning)' }} />
                  </div>
                )}
                {cashForm.currency_mode === 'binance' && (
                  <div className="form-group">
                    <label>Tasa Binance P2P <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>(auto)</span></label>
                    <input type="number" step="0.000001" value={cashForm.custom_rate} readOnly style={{ background: '#fffbeb', border: '2px solid #f59e0b', fontWeight: 600 }} />
                    {binanceRate && parseFloat(cashForm.bcv_rate) > 0 && (
                      <div style={{ fontSize: '0.72rem', color: '#92400e', marginTop: '2px' }}>
                        +{fmtNum(((binanceRate.rate / parseFloat(cashForm.bcv_rate) - 1) * 100))}% sobre BCV
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Live preview */}
              {(() => {
                const mode = cashForm.currency_mode;
                let previewUsd = 0, previewVes = 0, showPreview = false;
                if (mode === 'usd' && parseFloat(cashForm.amount_usd) > 0) {
                  previewUsd = parseFloat(cashForm.amount_usd);
                  const bcv = parseFloat(cashForm.bcv_rate) || 0;
                  previewVes = bcv > 0 ? previewUsd * bcv : 0;
                  showPreview = true;
                } else if ((mode === 'custom' || mode === 'binance') && parseFloat(cashForm.amount_usd) > 0 && parseFloat(cashForm.custom_rate) > 0) {
                  previewUsd = parseFloat(cashForm.amount_usd);
                  previewVes = previewUsd * parseFloat(cashForm.custom_rate);
                  showPreview = true;
                } else if (mode === 'ves' && parseFloat(cashForm.amount_ves) > 0 && parseFloat(cashForm.bcv_rate) > 0) {
                  previewVes = parseFloat(cashForm.amount_ves);
                  previewUsd = previewVes / parseFloat(cashForm.bcv_rate);
                  showPreview = true;
                }
                if (!showPreview) return null;
                return (
                  <div style={{ padding: '0.75rem', background: '#f0f9ff', border: '1px solid var(--info)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {cashForm.flow_type === 'ingreso'
                      ? <ArrowUpCircle size={24} color="var(--success)" />
                      : <ArrowDownCircle size={24} color="var(--danger)" />
                    }
                    <div>
                      <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: cashForm.flow_type === 'ingreso' ? 'var(--success)' : 'var(--danger)' }}>
                        {mode === 'usd' ? `${fmtNum(previewUsd)} USD` : mode === 'custom' ? `${fmtNum(previewUsd)} USD = ${fmtNum(previewVes)} VES` : `${fmtNum(previewVes)} VES = ${fmtNum(previewUsd)} USD`}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--gray-500)' }}>
                        {mode === 'usd' && 'Operación directa en dólares, no requiere conversión de tasa.'}
                        {mode === 'custom' && `Tasa personalizada: ${fmtRate(parseFloat(cashForm.custom_rate))}`}
                        {mode === 'binance' && `Tasa Binance P2P: ${fmtRate(parseFloat(cashForm.custom_rate))}`}
                        {mode === 'ves' && `Tasa BCV: ${fmtRate(parseFloat(cashForm.bcv_rate))}`}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="form-row">
                <div className="form-group">
                  <label>Descripción</label>
                  <input value={cashForm.description} onChange={(e) => setCashForm({ ...cashForm, description: e.target.value })} placeholder="Ej: Pago recibido de cliente X" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={cashSubmitting}>{cashSubmitting ? 'Registrando...' : 'Registrar'}</button>
                <button type="button" className="btn" onClick={() => setShowCashForm(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}

        {/* ── Cash Flow Filters ── */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Tipo</label>
              <select value={cashFilters.flow_type} onChange={(e) => { setCashFilters({ ...cashFilters, flow_type: e.target.value }); setCashPagination((p) => ({ ...p, page: 1 })); }}>
                <option value="">Todos</option>
                <option value="ingreso">Ingresos</option>
                <option value="egreso">Egresos</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Desde</label>
              <input type="date" value={cashFilters.from_date} onChange={(e) => { setCashFilters({ ...cashFilters, from_date: e.target.value }); setCashPagination((p) => ({ ...p, page: 1 })); }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Hasta</label>
              <input type="date" value={cashFilters.to_date} onChange={(e) => { setCashFilters({ ...cashFilters, to_date: e.target.value }); setCashPagination((p) => ({ ...p, page: 1 })); }} />
            </div>
            {(cashFilters.flow_type || cashFilters.from_date || cashFilters.to_date) && (
              <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => { setCashFilters({ flow_type: '', from_date: '', to_date: '' }); setCashPagination((p) => ({ ...p, page: 1 })); }}><X size={14} /> Limpiar</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Cash Flow Table ── */}
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>VES</th>
                <th>USD (al ingresar)</th>
                <th>Tasa BCV</th>
                <th>USD (hoy)</th>
                <th>Origen</th>
                <th>Descripción</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cashFlows.map((f) => (
                <tr key={f.id} style={f.status === 'anulado' ? { opacity: 0.5 } : {}}>
                  <td>{fmtDate(f.flow_date)}</td>
                  <td>
                    <span className={`badge ${f.flow_type === 'ingreso' ? 'badge-green' : 'badge-red'}`}>
                      {f.flow_type === 'ingreso' ? 'Ingreso' : 'Egreso'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: f.flow_type === 'ingreso' ? 'var(--success)' : 'var(--danger)' }}>
                    {f.flow_type === 'ingreso' ? '+' : '-'}{fmtNum(f.amount_ves)}
                  </td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--gray-600)' }}>{fmtNum(f.usd_equivalent)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{fmtRate(f.bcv_rate)}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--info)' }}>{f.usd_today ? fmtNum(f.usd_today) : '-'}</td>
                  <td style={{ fontSize: '0.78rem' }}>
                    {f.reference_type === 'treasury_operation' ? <span className="badge badge-gray">Compra USD</span> : <span className="badge badge-gray">Manual</span>}
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--gray-500)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.description || '-'}</td>
                  <td>
                    {f.status !== 'anulado' && f.reference_type !== 'treasury_operation' && (
                      <button className="btn btn-sm btn-danger" onClick={() => voidCashFlow(f.id)} title="Anular"><XCircle size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
              {!cashFlows.length && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>{cashLoading ? 'Cargando...' : 'No hay movimientos'}</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {cashPagination.total > 20 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn btn-sm" disabled={cashPagination.page <= 1} onClick={() => setCashPagination((p) => ({ ...p, page: p.page - 1 }))}>Anterior</button>
            <span style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>Página {cashPagination.page} de {Math.ceil(cashPagination.total / 20)} ({cashPagination.total} movimientos)</span>
            <button className="btn btn-sm" disabled={cashPagination.page >= Math.ceil(cashPagination.total / 20)} onClick={() => setCashPagination((p) => ({ ...p, page: p.page + 1 }))}>Siguiente</button>
          </div>
        )}

      </>}

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

            {/* Ledger with narrative */}
            {detail.ledger?.length > 0 && (() => {
              const ves = parseFloat(detail.amount_ves) || 0;
              const usd = parseFloat(detail.amount_usd) || 0;
              const diffU = parseFloat(detail.diff_usd) || 0;
              const bcvR = parseFloat(detail.bcv_rate) || 0;
              const pR = parseFloat(detail.purchase_rate || detail.parallel_rate) || 0;
              const typeLabel = purchaseTypes[detail.purchase_type] || 'tasa paralela';
              const isLoss = diffU < 0;
              const usdBcvCalc = bcvR > 0 ? ves / bcvR : 0;

              return (
                <div style={{ marginTop: '1rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Asientos Contables (Partida Doble):</strong>

                  {/* Narrative explanation */}
                  <div style={{ margin: '0.5rem 0', padding: '0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '0.82rem', color: '#78350f', lineHeight: '1.5' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Cómo leer estos asientos:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div>
                        <span style={{ display: 'inline-block', background: '#dbeafe', padding: '0 4px', borderRadius: '3px', fontWeight: 600, fontSize: '0.75rem' }}>PASO 1 - Salida VES</span>{' '}
                        El accionista "presta" {fmtNum(ves)} VES a la empresa. Se debita <em>Préstamos Accionistas</em> (deuda) y se acredita <em>Banco VES</em> (el dinero sale del banco).
                      </div>
                      <div>
                        <span style={{ display: 'inline-block', background: '#dcfce7', padding: '0 4px', borderRadius: '3px', fontWeight: 600, fontSize: '0.75rem' }}>PASO 2 - Entrada USD</span>{' '}
                        Se compran {fmtNum(usd)} USD a {typeLabel} (tasa {fmtRate(pR)}). Se debita <em>{detail.destination_type === 'caja_usd' ? 'Caja USD' : 'Banco USD'}</em> (dólares entran) y se acredita <em>Préstamos Accionistas</em> (se "cancela" el préstamo).
                      </div>
                      {diffU !== 0 && (
                        <div>
                          <span style={{ display: 'inline-block', background: isLoss ? '#fee2e2' : '#dcfce7', padding: '0 4px', borderRadius: '3px', fontWeight: 600, fontSize: '0.75rem' }}>PASO 3 - Diferencial</span>{' '}
                          {isLoss
                            ? `A BCV (${fmtRate(bcvR)}) los ${fmtNum(ves)} VES serían ${fmtNum(usdBcvCalc)} USD, pero a ${typeLabel} solo se consiguieron ${fmtNum(usd)} USD. Pérdida de ${fmtNum(Math.abs(diffU))} USD registrada en Pérdida Cambiaria.`
                            : `A BCV (${fmtRate(bcvR)}) los ${fmtNum(ves)} VES serían ${fmtNum(usdBcvCalc)} USD, pero a ${typeLabel} se consiguieron ${fmtNum(usd)} USD. Ganancia de ${fmtNum(diffU)} USD registrada en Ganancia Cambiaria.`
                          }
                        </div>
                      )}
                    </div>
                  </div>

                  <table style={{ marginTop: '0.5rem' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '30px' }}>#</th>
                        <th>Cuenta</th>
                        <th>Débito</th>
                        <th>Crédito</th>
                        <th>Moneda</th>
                        <th>Concepto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.ledger.map((l, idx) => {
                        const isDebit = l.movement_type === 'debito';
                        const bgColor = l.account_code === 'PERD_CAMB' ? '#fef2f2'
                          : l.account_code === 'GAN_CAMB' ? '#f0fdf4'
                          : idx < 2 ? '#eff6ff' : idx < 4 ? '#f0fdf4' : 'transparent';
                        return (
                          <tr key={l.id} style={{ background: bgColor }}>
                            <td style={{ color: 'var(--gray-400)', fontSize: '0.75rem' }}>{idx + 1}</td>
                            <td style={{ fontWeight: 500 }}>{l.account_name}</td>
                            <td style={{ fontFamily: 'monospace', fontWeight: isDebit ? 600 : 400 }}>{isDebit ? fmtNum(l.amount) : ''}</td>
                            <td style={{ fontFamily: 'monospace', fontWeight: !isDebit ? 600 : 400 }}>{!isDebit ? fmtNum(l.amount) : ''}</td>
                            <td><span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{l.currency}</span></td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--gray-500)' }}>{l.description}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
