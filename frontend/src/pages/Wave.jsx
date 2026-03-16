import React, { useState, useEffect } from 'react';
import api from '../api';
import {
  Waves, Settings, RefreshCw, CheckCircle, XCircle, AlertCircle,
  ArrowUpRight, ArrowDownLeft, Users, FileText, Plug, Trash2,
  Eye, EyeOff, Package, BookOpen, Zap, Link2, Download, Upload
} from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Waves },
  { id: 'sync', label: 'Sincronización', icon: RefreshCw },
  { id: 'products', label: 'Productos', icon: Package },
  { id: 'accounts', label: 'Cuentas', icon: BookOpen },
  { id: 'config', label: 'Configuración', icon: Settings },
];

export default function Wave() {
  const [tab, setTab] = useState('dashboard');
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Setup form
  const [form, setForm] = useState({
    access_token: '', business_id: '', business_name: '',
    sync_invoices: true, sync_suppliers: true, auto_sync: false,
    default_wave_product_id: '', default_wave_product_name: '',
  });
  const [testResult, setTestResult] = useState(null);
  const [businesses, setBusinesses] = useState([]);

  // Wave data
  const [waveProducts, setWaveProducts] = useState([]);
  const [waveAccounts, setWaveAccounts] = useState([]);
  const [productMappings, setProductMappings] = useState([]);
  const [accountMappings, setAccountMappings] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);

  // Pull results
  const [pullResult, setPullResult] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cfgRes, statusRes, logsRes] = await Promise.all([
        api.get('/wave/config').catch(() => ({ data: { data: null } })),
        api.get('/wave/status').catch(() => ({ data: { data: { configured: false } } })),
        api.get('/wave/logs?limit=30').catch(() => ({ data: { data: [] } })),
      ]);
      const cfg = cfgRes.data.data;
      setConfig(cfg);
      setStatus(statusRes.data.data);
      setLogs(logsRes.data.data || []);
      if (!cfg) setTab('config');
      if (cfg) {
        setForm((f) => ({
          ...f,
          business_id: cfg.business_id || '',
          business_name: cfg.business_name || '',
          sync_invoices: cfg.sync_invoices ?? true,
          sync_suppliers: cfg.sync_suppliers ?? true,
          auto_sync: cfg.auto_sync ?? false,
          default_wave_product_id: cfg.default_wave_product_id || '',
          default_wave_product_name: cfg.default_wave_product_name || '',
        }));
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const loadWaveData = async () => {
    try {
      const [prodRes, accRes, pmRes, amRes, catRes] = await Promise.all([
        api.get('/wave/products').catch(() => ({ data: { data: [] } })),
        api.get('/wave/accounts').catch(() => ({ data: { data: [] } })),
        api.get('/wave/mappings/products').catch(() => ({ data: { data: [] } })),
        api.get('/wave/mappings/accounts').catch(() => ({ data: { data: [] } })),
        api.get('/config/expense-categories').catch(() => ({ data: { data: [] } })),
      ]);
      setWaveProducts(prodRes.data.data || []);
      setWaveAccounts((accRes.data.data || []).filter((a) => !a.isArchived));
      setProductMappings(pmRes.data.data || []);
      setAccountMappings(amRes.data.data || []);
      setExpenseCategories(catRes.data.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (config?.is_active && (tab === 'products' || tab === 'accounts')) {
      loadWaveData();
    }
  }, [tab, config?.is_active]);

  // Load categories for product/account mapping
  useEffect(() => {
    if (config?.is_active) {
      api.get('/config/expense-categories').then((res) => {
        setExpenseCategories(res.data.data || []);
      }).catch(() => null);
    }
  }, [config?.is_active]);

  const handleTestConnection = async () => {
    if (!form.access_token) return alert('Ingresa el Full Access Token de Wave');
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post('/wave/test-connection', { access_token: form.access_token });
      setTestResult(data.data);
      setBusinesses(data.data.businesses || []);
      if (data.data.businesses?.length === 1) {
        const biz = data.data.businesses[0];
        setForm((f) => ({ ...f, business_id: biz.id, business_name: biz.name }));
      }
    } catch (err) {
      alert(err.response?.data?.error?.message || 'No se pudo conectar con Wave');
    }
    setTesting(false);
  };

  const handleSaveConfig = async () => {
    if (!form.access_token && !config?.access_token) return alert('Token requerido');
    if (!form.business_id) return alert('Selecciona un negocio');
    try {
      const payload = { ...form, is_active: true };
      if (!payload.access_token) delete payload.access_token; // don't overwrite with empty
      await api.post('/wave/config', payload);
      setTestResult(null);
      setBusinesses([]);
      await loadAll();
      alert('Configuración guardada');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error guardando configuración');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Desconectar Wave? Se eliminará la configuración pero no los datos ya sincronizados.')) return;
    try {
      await api.delete('/wave/config');
      setConfig(null);
      setStatus({ configured: false });
      setTab('config');
      setForm({ access_token: '', business_id: '', business_name: '', sync_invoices: true, sync_suppliers: true, auto_sync: false, default_wave_product_id: '', default_wave_product_name: '' });
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error');
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/wave/sync/invoices');
      const r = data.data;
      alert(`Push completado:\n• ${r.synced} sincronizadas\n• ${r.skipped} ya existían\n• ${r.errors} errores`);
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error');
    }
    setSyncing(false);
  };

  const handlePullInvoices = async () => {
    setSyncing(true);
    setPullResult(null);
    try {
      const { data } = await api.post('/wave/pull/invoices');
      setPullResult(data.data);
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error');
    }
    setSyncing(false);
  };

  const handlePullCustomers = async () => {
    setSyncing(true);
    setPullResult(null);
    try {
      const { data } = await api.post('/wave/pull/customers');
      setPullResult(data.data);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error');
    }
    setSyncing(false);
  };

  const handleSaveProductMapping = async (waveProductId, waveProductName, categoryId) => {
    try {
      await api.post('/wave/mappings/products', {
        wave_product_id: waveProductId,
        wave_product_name: waveProductName,
        expense_category_id: categoryId || null,
      });
      await loadWaveData();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error');
    }
  };

  const handleSaveAccountMapping = async (categoryId, waveAccountId, waveAccountName) => {
    try {
      await api.post('/wave/mappings/accounts', {
        expense_category_id: categoryId,
        wave_account_id: waveAccountId,
        wave_account_name: waveAccountName,
      });
      await loadWaveData();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error');
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</div>;

  const isConnected = config && status?.is_active;

  return (
    <div>
      {/* HEADER */}
      <div className="page-header">
        <h1><Waves size={24} /> Wave Accounting</h1>
        {isConnected && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>● Conectado</span>
            {status.auto_sync && <span style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px' }}><Zap size={10} /> Auto-sync</span>}
          </div>
        )}
      </div>

      {/* TAB BAR */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem' }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '0.75rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                color: active ? 'var(--primary)' : '#64748b',
                fontWeight: active ? 600 : 400, fontSize: '0.85rem',
                display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '-2px',
              }}
            >
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ═══════════ DASHBOARD TAB ═══════════ */}
      {tab === 'dashboard' && (
        <>
          {isConnected ? (
            <>
              {/* STATUS CARDS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <StatCard label="Negocio" value={status.business_name || '—'} sub={status.auto_sync ? 'Auto-sync activo' : 'Sync manual'} />
                <StatCard label="Facturas" value={`${status.invoices?.synced || 0} / ${status.invoices?.total || 0}`}
                  sub={status.invoices?.pending > 0 ? `${status.invoices.pending} pendientes` : 'Todo sincronizado'}
                  subColor={status.invoices?.pending > 0 ? '#f59e0b' : '#16a34a'} />
                <StatCard label="Proveedores" value={`${status.suppliers?.synced || 0} / ${status.suppliers?.total || 0}`} />
                <StatCard label="Mapeos" value={`${status.mappings?.products || 0} prod / ${status.mappings?.accounts || 0} ctas`} />
                <StatCard label="Última Sync" value={status.last_sync ? new Date(status.last_sync).toLocaleString('es-VE') : 'Nunca'} />
              </div>

              {/* RECENT ERRORS */}
              {status.recent_errors?.length > 0 && (
                <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #dc2626' }}>
                  <h4 style={{ color: '#dc2626', marginBottom: '0.5rem' }}><XCircle size={16} /> Errores Recientes</h4>
                  {status.recent_errors.map((e, i) => (
                    <div key={i} style={{ fontSize: '0.8rem', color: '#666', padding: '0.25rem 0', borderBottom: '1px solid #f1f5f9' }}>
                      <strong>{e.entity_type}</strong>: {e.error_message}
                      <span style={{ marginLeft: '0.5rem', opacity: 0.6 }}>{new Date(e.created_at).toLocaleString('es-VE')}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <Waves size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
              <h2>Wave Accounting no está conectado</h2>
              <p style={{ color: '#666', marginTop: '0.5rem' }}>Conecta tu cuenta de Wave para sincronizar facturas y proveedores.</p>
              <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setTab('config')}>
                <Plug size={16} /> Configurar Conexión
              </button>
            </div>
          )}
        </>
      )}

      {/* ═══════════ SYNC TAB ═══════════ */}
      {tab === 'sync' && (
        <>
          {/* ACTIONS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <h4 style={{ marginBottom: '0.75rem' }}><Upload size={16} /> Push a Wave</h4>
              <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1rem' }}>Enviar facturas registradas/pagadas de Comprar-IA a Wave.</p>
              <button className="btn btn-primary" onClick={handleSyncAll} disabled={syncing || !isConnected}>
                <RefreshCw size={16} className={syncing ? 'spin' : ''} /> {syncing ? 'Sincronizando...' : 'Sincronizar Facturas'}
              </button>
            </div>

            <div className="card">
              <h4 style={{ marginBottom: '0.75rem' }}><Download size={16} /> Pull desde Wave</h4>
              <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1rem' }}>Ver facturas y clientes que existen en Wave.</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn" onClick={handlePullInvoices} disabled={syncing || !isConnected}>
                  <FileText size={16} /> Facturas
                </button>
                <button className="btn" onClick={handlePullCustomers} disabled={syncing || !isConnected}>
                  <Users size={16} /> Clientes
                </button>
              </div>
            </div>
          </div>

          {/* PULL RESULTS */}
          {pullResult && (
            <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid #86efac' }}>
              <h4 style={{ marginBottom: '0.75rem' }}><ArrowDownLeft size={16} /> Resultados del Pull</h4>
              <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Total: <strong>{pullResult.total ?? pullResult.fetched}</strong>
                {pullResult.new !== undefined && <> | Nuevos: <strong>{pullResult.new}</strong></>}
                {pullResult.existing !== undefined && <> | Ya mapeados: <strong>{pullResult.existing}</strong></>}
                {pullResult.mapped !== undefined && <> | Mapeados: <strong>{pullResult.mapped}</strong></>}
                {pullResult.unmapped !== undefined && <> | Sin mapear: <strong>{pullResult.unmapped}</strong></>}
              </div>
              {pullResult.details?.length > 0 && (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Nombre / Número</th>
                        <th>Estado</th>
                        <th>Total</th>
                        <th>Wave ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pullResult.details.map((d, i) => (
                        <tr key={i}>
                          <td>{d.name || d.number || d.customer || '—'}</td>
                          <td>{d.status || (d.mapped_to_local ? 'Mapeado' : 'Sin mapear')}</td>
                          <td>{d.total ? `${d.currency || '$'} ${parseFloat(d.total).toLocaleString()}` : '—'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{(d.wave_id || '').substring(0, 20)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SYNC LOGS */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Historial de Sincronización</h3>
            {logs.length === 0 ? (
              <p style={{ color: '#666', fontSize: '0.85rem' }}>No hay registros de sincronización aún.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>Fecha</th><th>Tipo</th><th>Dir</th><th>Estado</th><th>Wave ID</th><th>Error</th></tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString('es-VE')}</td>
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                            background: log.entity_type === 'invoice' ? '#dbeafe' : '#fef3c7',
                            color: log.entity_type === 'invoice' ? '#1e40af' : '#92400e',
                          }}>
                            {log.entity_type === 'invoice' ? 'Factura' : log.entity_type === 'supplier' ? 'Proveedor' : log.entity_type}
                          </span>
                        </td>
                        <td>
                          {log.direction === 'push' ? <ArrowUpRight size={14} style={{ color: '#6366f1' }} /> : <ArrowDownLeft size={14} style={{ color: '#059669' }} />}
                          {' '}{log.direction === 'push' ? 'Push' : 'Pull'}
                        </td>
                        <td>
                          {log.status === 'success' ? <span style={{ color: '#16a34a' }}><CheckCircle size={14} /> OK</span>
                            : <span style={{ color: '#dc2626' }}><XCircle size={14} /> Error</span>}
                        </td>
                        <td style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{log.wave_id ? log.wave_id.substring(0, 18) + '...' : '—'}</td>
                        <td style={{ fontSize: '0.8rem', color: '#dc2626', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.error_message || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════ PRODUCTS TAB ═══════════ */}
      {tab === 'products' && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}><Package size={18} /> Producto por Defecto</h3>
            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1rem' }}>
              Cuando una factura se sincroniza a Wave, sus líneas se asignan a este producto.
            </p>
            {waveProducts.length > 0 ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', maxWidth: '500px' }}>
                <select
                  value={form.default_wave_product_id}
                  onChange={(e) => {
                    const p = waveProducts.find((p) => p.id === e.target.value);
                    setForm({ ...form, default_wave_product_id: e.target.value, default_wave_product_name: p?.name || '' });
                  }}
                  style={{ flex: 1 }}
                >
                  <option value="">Sin producto por defecto</option>
                  {waveProducts.map((p) => <option key={p.id} value={p.id}>{p.name} (${p.unitPrice})</option>)}
                </select>
                <button className="btn btn-primary" onClick={handleSaveConfig}>Guardar</button>
              </div>
            ) : (
              <p style={{ color: '#f59e0b', fontSize: '0.85rem' }}><AlertCircle size={14} /> No hay productos en Wave. Crea uno primero en tu cuenta Wave.</p>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '0.5rem' }}><Link2 size={18} /> Mapeo de Productos</h3>
            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1rem' }}>
              Vincula productos de Wave con categorías de gasto locales para saber qué producto usar al sincronizar.
            </p>
            {waveProducts.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>Producto Wave</th><th>Precio</th><th>Categoría Local</th><th>Acción</th></tr>
                  </thead>
                  <tbody>
                    {waveProducts.map((p) => {
                      const mapping = productMappings.find((m) => m.wave_product_id === p.id);
                      return (
                        <tr key={p.id}>
                          <td><strong>{p.name}</strong></td>
                          <td>${p.unitPrice}</td>
                          <td>
                            <select
                              value={mapping?.expense_category_id || ''}
                              onChange={(e) => handleSaveProductMapping(p.id, p.name, e.target.value)}
                            >
                              <option value="">Sin vincular</option>
                              {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </td>
                          <td>
                            {mapping && <span style={{ color: '#16a34a', fontSize: '0.8rem' }}><CheckCircle size={14} /> Vinculado</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#666', fontSize: '0.85rem' }}>
                {isConnected ? 'Cargando productos de Wave...' : 'Conecta Wave primero.'}
              </p>
            )}
          </div>
        </>
      )}

      {/* ═══════════ ACCOUNTS TAB ═══════════ */}
      {tab === 'accounts' && (
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}><BookOpen size={18} /> Mapeo de Cuentas Contables</h3>
          <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1rem' }}>
            Vincula las categorías de gasto de Comprar-IA con cuentas contables de Wave.
            Esto permite registrar gastos directamente en las cuentas correctas.
          </p>
          {expenseCategories.length > 0 && waveAccounts.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th>Categoría Local</th><th>Cuenta Wave</th><th>Tipo</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {expenseCategories.map((cat) => {
                    const mapping = accountMappings.find((m) => m.expense_category_id === cat.id);
                    return (
                      <tr key={cat.id}>
                        <td><strong>{cat.name}</strong></td>
                        <td>
                          <select
                            value={mapping?.wave_account_id || ''}
                            onChange={(e) => {
                              const acc = waveAccounts.find((a) => a.id === e.target.value);
                              handleSaveAccountMapping(cat.id, e.target.value, acc?.name || '');
                            }}
                          >
                            <option value="">Sin vincular</option>
                            {waveAccounts.filter((a) => a.type?.value === 'EXPENSE' || a.type?.value === 'COST_OF_GOODS_SOLD').map((a) => (
                              <option key={a.id} value={a.id}>{a.name} ({a.subtype?.name || a.type?.name})</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#666' }}>
                          {mapping ? (waveAccounts.find((a) => a.id === mapping.wave_account_id)?.type?.name || '') : '—'}
                        </td>
                        <td>
                          {mapping ? <span style={{ color: '#16a34a', fontSize: '0.8rem' }}><CheckCircle size={14} /> Vinculado</span>
                            : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Pendiente</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#666', fontSize: '0.85rem' }}>
              {!isConnected ? 'Conecta Wave primero.'
                : waveAccounts.length === 0 ? 'Cargando cuentas de Wave...'
                : 'No hay categorías de gasto configuradas.'}
            </p>
          )}
        </div>
      )}

      {/* ═══════════ CONFIG TAB ═══════════ */}
      {tab === 'config' && (
        <div className="card" style={{ border: '2px solid var(--primary)' }}>
          <h3 style={{ marginBottom: '1rem' }}><Plug size={18} /> {config ? 'Configuración de Wave' : 'Conectar con Wave'}</h3>

          <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
            Necesitas un <strong>Full Access Token</strong> de Wave.
            Ve a <a href="https://developer.waveapps.com" target="_blank" rel="noopener noreferrer">developer.waveapps.com</a>,
            crea una App y genera un token.
          </p>

          <div style={{ display: 'grid', gap: '1rem', maxWidth: '600px' }}>
            {/* Token */}
            <div>
              <label>Full Access Token</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={form.access_token}
                  onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                  placeholder={config ? 'Dejar vacío para mantener el actual...' : 'Pega tu token aquí...'}
                  style={{ flex: 1 }}
                />
                <button className="btn" onClick={() => setShowToken(!showToken)} title={showToken ? 'Ocultar' : 'Mostrar'}>
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button className="btn btn-primary" onClick={handleTestConnection} disabled={testing}>
                  {testing ? 'Probando...' : 'Probar'}
                </button>
              </div>
            </div>

            {/* Test result */}
            {testResult && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '1rem' }}>
                <p style={{ fontWeight: 600, color: '#166534' }}><CheckCircle size={16} style={{ verticalAlign: 'middle' }} /> Conexión exitosa — {testResult.user?.defaultEmail}</p>
                {businesses.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <label>Negocio:</label>
                    <select
                      value={form.business_id}
                      onChange={(e) => {
                        const biz = businesses.find((b) => b.id === e.target.value);
                        setForm({ ...form, business_id: e.target.value, business_name: biz?.name || '' });
                      }}
                      style={{ marginTop: '0.25rem' }}
                    >
                      <option value="">-- Seleccionar --</option>
                      {businesses.map((b) => (
                        <option key={b.id} value={b.id}>{b.name} ({b.currency?.code})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Sync options */}
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={form.sync_invoices} onChange={(e) => setForm({ ...form, sync_invoices: e.target.checked })} />
                Facturas
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={form.sync_suppliers} onChange={(e) => setForm({ ...form, sync_suppliers: e.target.checked })} />
                Proveedores
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#6366f1' }}>
                <input type="checkbox" checked={form.auto_sync} onChange={(e) => setForm({ ...form, auto_sync: e.target.checked })} />
                <Zap size={14} /> Auto-sync
              </label>
            </div>

            {form.auto_sync && (
              <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '8px', fontSize: '0.8rem', color: '#1e40af' }}>
                <Zap size={14} style={{ verticalAlign: 'middle' }} /> <strong>Auto-sync activado:</strong> Las facturas se enviarán automáticamente a Wave al ser registradas, pagadas parcialmente o pagadas completamente. No necesitas hacer sync manual.
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={handleSaveConfig} disabled={!form.business_id}>
                <CheckCircle size={16} /> Guardar
              </button>
              {config && (
                <button className="btn" style={{ color: '#dc2626' }} onClick={handleDisconnect}>
                  <Trash2 size={16} /> Desconectar
                </button>
              )}
            </div>
          </div>

          {/* How it works */}
          <div style={{ marginTop: '2rem', borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
            <h4 style={{ marginBottom: '0.75rem' }}>¿Cómo funciona?</h4>
            <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.7 }}>
              <p><strong>1.</strong> Crea cuenta en <a href="https://www.waveapps.com" target="_blank" rel="noopener noreferrer">waveapps.com</a> (gratis)</p>
              <p><strong>2.</strong> Portal dev → Crear App → Generar Full Access Token</p>
              <p><strong>3.</strong> Pegar token, probar, seleccionar negocio, guardar</p>
              <p><strong>4.</strong> <strong>Sync manual:</strong> Click en "Sincronizar" para enviar facturas a Wave</p>
              <p><strong>5.</strong> <strong>Auto-sync:</strong> Cada factura se envía automáticamente al cambiar de estado</p>
              <p><strong>6.</strong> <strong>Pull:</strong> Consulta facturas/clientes que ya existen en Wave</p>
              <p style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#fef3c7', borderRadius: '6px' }}>
                <AlertCircle size={14} style={{ verticalAlign: 'middle' }} /> Plan Pro requerido para OAuth multi-usuario. Full Access Token funciona sin suscripción.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, subColor }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: subColor || '#64748b', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}
