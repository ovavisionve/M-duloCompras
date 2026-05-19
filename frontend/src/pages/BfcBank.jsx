import React, { useState, useEffect, useCallback } from 'react';
import {
  Landmark, Settings, RefreshCw, Download, Trash2, Plus, CheckCircle, XCircle,
  AlertTriangle, Clock, Eye, Link, Unlink, ArrowDownCircle, Wifi, WifiOff,
  ChevronRight, ChevronLeft, Check, EyeOff, Printer, Shield, Key, RotateCcw,
  Bell, Inbox, Save
} from 'lucide-react';

const API = '/api/v1';
const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
});

export default function BfcBank() {
  const [tab, setTab] = useState('dashboard');
  const [config, setConfig] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, accRes, bankRes, logRes, notRes] = await Promise.all([
        fetch(`${API}/bfc/config`, { headers: headers() }),
        fetch(`${API}/bfc/accounts`, { headers: headers() }),
        fetch(`${API}/banking/bank-accounts`, { headers: headers() }),
        fetch(`${API}/bfc/logs?limit=20`, { headers: headers() }),
        fetch(`${API}/bfc/notifications?limit=50`, { headers: headers() }),
      ]);
      const cfgData = await cfgRes.json();
      const accData = await accRes.json();
      const bankData = await bankRes.json();
      const logData = await logRes.json();
      const notData = await notRes.json();
      setConfig(cfgData.data);
      setAccounts(accData.data || []);
      setBankAccounts(bankData.data || []);
      setLogs(logData.data || []);
      setNotifications(notData.data || []);
    } catch {
      setError('Error cargando datos BFC');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const flash = (msg, type = 'success') => {
    if (type === 'success') { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 5000);
  };

  const tabs = [
    { id: 'dashboard', label: 'Estado', icon: Landmark },
    { id: 'accounts', label: 'Cuentas', icon: Link },
    { id: 'import', label: 'Importar', icon: Download },
    { id: 'logs', label: 'Historial', icon: Clock },
    { id: 'notifications', label: 'Notificaciones', icon: Bell },
    { id: 'config', label: 'Configuración', icon: Settings },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>BFC - Banco Fondo Común</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Integración directa con API bancaria</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {config?.is_active ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#16a34a', fontSize: '0.8rem' }}>
              <Wifi size={14} /> Conectado
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#94a3b8', fontSize: '0.8rem' }}>
              <WifiOff size={14} /> Desconectado
            </span>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><AlertTriangle size={16} /> {error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1rem' }}><CheckCircle size={16} /> {success}</div>}

      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0' }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.6rem 1rem',
            border: 'none', background: tab === t.id ? '#fff' : 'transparent',
            borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
            color: tab === t.id ? '#2563eb' : '#64748b', cursor: 'pointer', fontWeight: tab === t.id ? 600 : 400,
            fontSize: '0.85rem', marginBottom: '-2px',
          }}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? <p>Cargando...</p> : (
        <>
          {tab === 'dashboard' && <DashboardTab config={config} accounts={accounts} logs={logs} />}
          {tab === 'accounts' && <AccountsTab accounts={accounts} bankAccounts={bankAccounts} onReload={loadData} flash={flash} />}
          {tab === 'import' && <ImportTab accounts={accounts} onReload={loadData} flash={flash} />}
          {tab === 'logs' && <LogsTab logs={logs} onReload={loadData} />}
          {tab === 'notifications' && <NotificationsTab notifications={notifications} onReload={loadData} flash={flash} />}
          {tab === 'config' && <ConfigTab config={config} bankAccounts={bankAccounts} onReload={loadData} flash={flash} />}
        </>
      )}
    </div>
  );
}

function DashboardTab({ config, accounts, logs }) {
  const activeAccounts = accounts.filter((a) => a.is_active);
  const linkedAccounts = accounts.filter((a) => a.bank_account_id);
  const recentErrors = logs.filter((l) => l.status === 'error').slice(0, 5);
  const recentImports = logs.filter((l) => l.action === 'import' && l.status === 'success').slice(0, 5);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard title="Estado" value={config?.is_active ? 'Activo' : 'Inactivo'} color={config?.is_active ? '#16a34a' : '#94a3b8'} icon={config?.is_active ? Wifi : WifiOff} />
        <StatCard title="Cuentas BFC" value={activeAccounts.length} color="#2563eb" icon={Landmark} />
        <StatCard title="Vinculadas" value={linkedAccounts.length} color="#7c3aed" icon={Link} />
        <StatCard title="Auto-importar" value={config?.auto_import ? 'Sí' : 'No'} color={config?.auto_import ? '#16a34a' : '#94a3b8'} icon={RefreshCw} />
      </div>

      {!config && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem', padding: '1.5rem', textAlign: 'center' }}>
          <Landmark size={40} style={{ color: '#2563eb', marginBottom: '0.5rem' }} />
          <h3 style={{ marginBottom: '0.5rem' }}>Configurar BFC</h3>
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Ve a la pestaña Configuración para conectar con el API de BFC.</p>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.5rem' }}>Requiere acceso VPN previamente configurado.</p>
        </div>
      )}

      {recentErrors.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: '#dc2626' }}>Errores recientes</h3>
          <div className="table-container">
            <table>
              <thead><tr><th>Fecha</th><th>Acción</th><th>Cuenta</th><th>Error</th></tr></thead>
              <tbody>
                {recentErrors.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: '0.8rem' }}>{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.action}</td>
                    <td>{l.account_number || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#dc2626' }}>{l.error_message?.substring(0, 80)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recentImports.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>Importaciones recientes</h3>
          <div className="table-container">
            <table>
              <thead><tr><th>Fecha</th><th>Cuenta</th><th>Obtenidos</th><th>Importados</th></tr></thead>
              <tbody>
                {recentImports.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: '0.8rem' }}>{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.account_number || '—'}</td>
                    <td>{l.records_fetched}</td>
                    <td>{l.records_imported}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color, icon: Icon }) {
  return (
    <div style={{ background: '#fff', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>{title}</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</div>
        </div>
        <Icon size={24} style={{ color, opacity: 0.5 }} />
      </div>
    </div>
  );
}

function AccountsTab({ accounts, bankAccounts, onReload, flash }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ account_number: '', account_alias: '', bank_account_id: '' });

  const handleAdd = async () => {
    if (!form.account_number) return flash('Número de cuenta requerido', 'error');
    try {
      const res = await fetch(`${API}/bfc/accounts`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...form, bank_account_id: form.bank_account_id || null }),
      });
      const data = await res.json();
      if (!data.success) return flash(data.error?.message || 'Error', 'error');
      flash('Cuenta BFC agregada');
      setShowForm(false);
      setForm({ account_number: '', account_alias: '', bank_account_id: '' });
      onReload();
    } catch { flash('Error de conexión', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta cuenta BFC?')) return;
    try {
      await fetch(`${API}/bfc/accounts/${id}`, { method: 'DELETE', headers: headers() });
      flash('Cuenta eliminada');
      onReload();
    } catch { flash('Error eliminando', 'error'); }
  };

  const handleLink = async (acc, bankId) => {
    try {
      const res = await fetch(`${API}/bfc/accounts`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ account_number: acc.account_number, bank_account_id: bankId || null }),
      });
      const data = await res.json();
      if (!data.success) return flash(data.error?.message || 'Error', 'error');
      flash(bankId ? 'Cuenta vinculada' : 'Cuenta desvinculada');
      onReload();
    } catch { flash('Error', 'error'); }
  };

  const vesBankAccounts = bankAccounts.filter((b) => b.currency === 'VES');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem' }}>Cuentas BFC registradas</h3>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Plus size={15} /> Agregar cuenta
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 500 }}>Nro. Cuenta BFC *</label>
              <input className="input" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} placeholder="01510000000000000000" />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 500 }}>Alias</label>
              <input className="input" value={form.account_alias} onChange={(e) => setForm({ ...form, account_alias: e.target.value })} placeholder="Cuenta principal" />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 500 }}>Vincular a cuenta local</label>
              <select className="input" value={form.bank_account_id} onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })}>
                <option value="">Sin vincular</option>
                {vesBankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.bank_name} - {b.account_number}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={handleAdd}>Guardar</button>
            <button className="btn" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>No hay cuentas BFC registradas</p>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>Nro. Cuenta</th><th>Alias</th><th>Vinculada a</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id}>
                  <td style={{ fontFamily: 'monospace' }}>{acc.account_number}</td>
                  <td>{acc.account_alias || '—'}</td>
                  <td>
                    {acc.bank_account_id ? (
                      <span style={{ color: '#16a34a', fontSize: '0.8rem' }}>{acc.bank_name} - {acc.local_account_number}</span>
                    ) : (
                      <select className="input" style={{ fontSize: '0.8rem', padding: '0.25rem' }}
                        value="" onChange={(e) => handleLink(acc, e.target.value)}>
                        <option value="">Vincular...</option>
                        {vesBankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>{b.bank_name} - {b.account_number}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {acc.is_active ? (
                      <span className="badge badge-success">Activa</span>
                    ) : (
                      <span className="badge badge-secondary">Inactiva</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {acc.bank_account_id && (
                        <button className="btn btn-sm" onClick={() => handleLink(acc, null)} title="Desvincular">
                          <Unlink size={14} />
                        </button>
                      )}
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(acc.id)} title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#92400e' }}>
        <strong>Nota:</strong> Las cuentas BFC deben vincularse a una cuenta bancaria local (VES) para poder importar movimientos automáticamente al módulo de conciliación.
      </div>
    </div>
  );
}

function ImportTab({ accounts, onReload, flash }) {
  const [selectedAccount, setSelectedAccount] = useState('');
  const [mode, setMode] = useState('today');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const linkedAccounts = accounts.filter((a) => a.bank_account_id && a.is_active);

  const banderaMap = { today: 1, yesterday: 2, last_month: 3, this_month: 4, range: 5 };

  const handleImport = async () => {
    if (!selectedAccount) return flash('Selecciona una cuenta', 'error');
    setImporting(true);
    setResult(null);
    try {
      const body = { bandera: banderaMap[mode] };
      if (mode === 'range') {
        if (!fromDate || !toDate) { flash('Selecciona rango de fechas', 'error'); setImporting(false); return; }
        body.from_date = fromDate;
        body.to_date = toDate;
      }
      const res = await fetch(`${API}/bfc/import/${selectedAccount}`, {
        method: 'POST', headers: headers(), body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) { flash(data.error?.message || 'Error importando', 'error'); setImporting(false); return; }
      setResult(data.data);
      flash(`Importados ${data.data.imported} movimientos`);
      onReload();
    } catch { flash('Error de conexión', 'error'); }
    setImporting(false);
  };

  const handleBalance = async () => {
    if (!selectedAccount) return flash('Selecciona una cuenta', 'error');
    setLoadingBalance(true);
    try {
      const res = await fetch(`${API}/bfc/balance/${selectedAccount}`, { headers: headers() });
      const data = await res.json();
      if (!data.success) { flash(data.error?.message || 'Error', 'error'); setLoadingBalance(false); return; }
      setBalance(data.data);
    } catch { flash('Error de conexión', 'error'); }
    setLoadingBalance(false);
  };

  const handleImportAll = async () => {
    setImporting(true);
    try {
      const res = await fetch(`${API}/bfc/import-all`, { method: 'POST', headers: headers() });
      const data = await res.json();
      if (!data.success) { flash(data.error?.message || 'Error', 'error'); setImporting(false); return; }
      const total = (data.data || []).reduce((s, r) => s + (r.imported || 0), 0);
      flash(`Importación masiva: ${total} movimientos importados`);
      onReload();
    } catch { flash('Error de conexión', 'error'); }
    setImporting(false);
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Importar movimientos</h3>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 500 }}>Cuenta BFC</label>
            <select className="input" value={selectedAccount} onChange={(e) => { setSelectedAccount(e.target.value); setBalance(null); setResult(null); }}>
              <option value="">Seleccionar cuenta...</option>
              {linkedAccounts.map((a) => (
                <option key={a.id} value={a.account_number}>{a.account_alias || a.account_number} ({a.bank_name})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 500 }}>Período</label>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="this_month">Este mes</option>
              <option value="last_month">Mes pasado</option>
              <option value="range">Rango de fechas</option>
            </select>
          </div>

          {mode === 'range' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 500 }}>Desde</label>
                <input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 500 }}>Hasta</label>
                <input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing || !selectedAccount}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {importing ? <RefreshCw size={15} className="spin" /> : <Download size={15} />}
              {importing ? 'Importando...' : 'Importar'}
            </button>
            <button className="btn" onClick={handleBalance} disabled={loadingBalance || !selectedAccount}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Eye size={15} /> Consultar saldo
            </button>
          </div>
        </div>

        <div>
          {balance && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#16a34a' }}>Saldo BFC</h4>
              <pre style={{ fontSize: '0.8rem', background: '#fff', padding: '0.75rem', borderRadius: '0.25rem', overflow: 'auto', maxHeight: '200px' }}>
                {JSON.stringify(balance, null, 2)}
              </pre>
            </div>
          )}

          {result && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem', padding: '1rem' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', color: '#2563eb' }}>Resultado de importación</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>{result.fetched}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Obtenidos</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{result.imported}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Importados</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#94a3b8' }}>{result.duplicates}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Duplicados</div>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <button className="btn" onClick={handleImportAll} disabled={importing}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', width: '100%', justifyContent: 'center' }}>
              <ArrowDownCircle size={15} /> Importar todas las cuentas (hoy)
            </button>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.35rem' }}>
              Importa movimientos del día de todas las cuentas vinculadas
            </p>
          </div>
        </div>
      </div>

      {linkedAccounts.length === 0 && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '0.5rem', textAlign: 'center' }}>
          <AlertTriangle size={20} style={{ color: '#d97706', marginBottom: '0.5rem' }} />
          <p style={{ fontSize: '0.85rem', color: '#92400e' }}>
            No hay cuentas BFC vinculadas. Ve a la pestaña Cuentas para vincular una cuenta BFC a una cuenta bancaria local.
          </p>
        </div>
      )}
    </div>
  );
}

function LogsTab({ logs, onReload }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem' }}>Historial de sincronización</h3>
        <button className="btn" onClick={onReload} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {logs.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>No hay registros</p>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>Fecha</th><th>Acción</th><th>Cuenta</th><th>Estado</th><th>Obtenidos</th><th>Importados</th><th>Detalle</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontSize: '0.8rem' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td>
                    <span className={`badge ${l.action === 'import' ? 'badge-info' : l.action === 'login' ? 'badge-secondary' : 'badge-primary'}`}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{l.account_number || '—'}</td>
                  <td>
                    {l.status === 'success' ? (
                      <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><CheckCircle size={14} /> OK</span>
                    ) : (
                      <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><XCircle size={14} /> Error</span>
                    )}
                  </td>
                  <td>{l.records_fetched}</td>
                  <td>{l.records_imported}</td>
                  <td style={{ fontSize: '0.75rem', color: l.status === 'error' ? '#dc2626' : '#64748b', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {l.error_message || (l.metadata ? JSON.stringify(l.metadata) : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── BFC CONFIG WIZARD ────────────────────────────────────────────
function ConfigTab({ config, onReload, flash, bankAccounts }) {
  const [mode, setMode] = useState(config ? 'view' : 'wizard');

  if (mode === 'wizard') {
    return <BfcWizard config={config} bankAccounts={bankAccounts} onDone={() => { onReload(); setMode('view'); }} flash={flash} />;
  }

  return <BfcConfigView config={config} bankAccounts={bankAccounts} onReload={onReload} flash={flash} onReconfigure={() => setMode('wizard')} />;
}

function BfcConfigView({ config, onReload, flash, onReconfigure }) {
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(`${API}/bfc/test-connection`, { method: 'POST', headers: headers() });
      const data = await res.json();
      if (data.success) flash('Conexión exitosa con BFC');
      else flash(data.error?.message || 'Error de conexión', 'error');
    } catch { flash('Error de conexión', 'error'); }
    setTesting(false);
  };

  const handleDelete = async () => {
    if (!confirm('¿Eliminar toda la configuración BFC? Esto eliminará cuentas, tokens y logs.')) return;
    try {
      await fetch(`${API}/bfc/config`, { method: 'DELETE', headers: headers() });
      flash('Configuración eliminada');
      onReload();
    } catch { flash('Error eliminando', 'error'); }
  };

  return (
    <div style={{ maxWidth: '560px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '1rem', margin: 0 }}>Configuración BFC activa</h3>
        <button onClick={onReconfigure} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '0.375rem', padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <RotateCcw size={13} /> Reconfigurar
        </button>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
        <ConfigRow label="URL Base" value={config.base_url || '—'} />
        <ConfigRow label="Usuario" value={config.username || '—'} />
        <ConfigRow label="Cédula / RIF" value={config.cedula || '—'} />
        <ConfigRow label="Proxy API Key" value={config.proxy_api_key ? '••••••••' : '—'} />
        <ConfigRow label="Auto-importar" value={config.auto_import ? 'Sí' : 'No'} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className="btn" onClick={handleTest} disabled={testing} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {testing ? <RefreshCw size={14} className="spin" /> : <Wifi size={14} />}
          Probar conexión
        </button>
        <button className="btn btn-danger" onClick={handleDelete} style={{ marginLeft: 'auto' }}>
          Desconectar BFC
        </button>
      </div>

      <NotificationCredsSection config={config} flash={flash} onSaved={onReload} />

      <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.8rem', marginTop: '1.25rem' }}>
        <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Información técnica</h4>
        <ul style={{ paddingLeft: '1.25rem', color: '#64748b', lineHeight: '1.6' }}>
          <li>Los tokens JWT se renuevan automáticamente cada 2 horas</li>
          <li>El proxy EC2 maneja el túnel VPN hacia la red interna de BFC</li>
          <li>El auto-importar ejecuta diariamente al iniciar sesión</li>
          <li>Endpoint receptor de push: <code style={{ fontSize: '0.78rem' }}>POST /api/v1/bfc/notifications</code></li>
        </ul>
      </div>
    </div>
  );
}

// Inline editor para configurar el HMAC secret y las IPs permitidas del banco.
function NotificationCredsSection({ config, flash, onSaved }) {
  const [secret, setSecret] = useState('');
  const [ips, setIps] = useState(config?.notification_allowed_ips || '');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body = { notification_allowed_ips: ips };
      if (secret) body.notification_secret = secret;
      const res = await fetch(`${API}/bfc/config`, {
        method: 'POST', headers: headers(), body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) { flash(data.error?.message || 'Error guardando', 'error'); setSaving(false); return; }
      flash('Credenciales de notificaciones actualizadas');
      setSecret('');
      onSaved();
    } catch { flash('Error de conexión', 'error'); }
    setSaving(false);
  };

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
      <h4 style={{ fontSize: '0.9rem', margin: '0 0 0.5rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <Bell size={15} /> Credenciales para notificaciones push
      </h4>
      <p style={{ fontSize: '0.78rem', color: '#92400e', margin: '0 0 0.75rem' }}>
        Se usan para verificar que las notificaciones que llegan al endpoint <code>POST /api/v1/bfc/notifications</code> vengan del banco.
        Configurar cuando BFC entregue el secret HMAC y la(s) IP(s) origen.
      </p>

      <div style={{ marginBottom: '0.6rem' }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, marginBottom: '0.25rem' }}>
          Secret HMAC {config?.has_notification_secret && <span style={{ color: '#16a34a', fontSize: '0.72rem' }}>(✓ configurado)</span>}
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={showSecret ? 'text' : 'password'}
            value={secret} onChange={(e) => setSecret(e.target.value)}
            placeholder={config?.has_notification_secret ? 'Dejar vacío para mantener el actual' : 'Pegar el secret que envíe BFC'}
            style={{ width: '100%', padding: '0.45rem 2.5rem 0.45rem 0.6rem', border: '1px solid #fcd34d', borderRadius: '0.375rem', fontSize: '0.85rem', boxSizing: 'border-box', fontFamily: 'monospace' }}
          />
          <button type="button" onClick={() => setShowSecret(!showSecret)} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#92400e' }}>
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, marginBottom: '0.25rem' }}>
          IPs permitidas (CSV)
        </label>
        <input
          value={ips} onChange={(e) => setIps(e.target.value)}
          placeholder="192.168.1.1, 10.0.0.5"
          style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #fcd34d', borderRadius: '0.375rem', fontSize: '0.85rem', boxSizing: 'border-box', fontFamily: 'monospace' }}
        />
        <p style={{ fontSize: '0.72rem', color: '#92400e', margin: '0.2rem 0 0' }}>
          Si está vacío, no se filtra por IP. Recomendado restringir a las IPs de BFC una vez se conozcan.
        </p>
      </div>

      <button onClick={save} disabled={saving} className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
        <Save size={13} /> {saving ? 'Guardando...' : 'Guardar credenciales'}
      </button>
    </div>
  );
}

// Lista de notificaciones recibidas con detalle expandible.
function NotificationsTab({ notifications, onReload, flash }) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(null);

  const filtered = filter ? notifications.filter((n) => n.status === filter) : notifications;

  const retry = async (id) => {
    try {
      const res = await fetch(`${API}/bfc/notifications/${id}/retry`, { method: 'POST', headers: headers() });
      const data = await res.json();
      if (!data.success) return flash(data.error?.message || 'Error', 'error');
      flash('Notificación reprocesada');
      onReload();
    } catch { flash('Error de conexión', 'error'); }
  };

  const statusBadge = (s) => {
    const map = {
      processed: { bg: '#dcfce7', fg: '#16a34a', label: 'Procesada' },
      received: { bg: '#dbeafe', fg: '#2563eb', label: 'Recibida' },
      ignored: { bg: '#f1f5f9', fg: '#64748b', label: 'Ignorada (duplicado)' },
      orphan: { bg: '#fef3c7', fg: '#d97706', label: 'Huérfana (sin cuenta)' },
      error: { bg: '#fee2e2', fg: '#dc2626', label: 'Error' },
    };
    const { bg, fg, label } = map[s] || map.received;
    return <span style={{ background: bg, color: fg, fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 500 }}>{label}</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Inbox size={17} /> Notificaciones push recibidas
          </h3>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.25rem 0 0' }}>
            Endpoint: <code>POST /api/v1/bfc/notifications</code>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '0.35rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '0.375rem', fontSize: '0.8rem' }}>
            <option value="">Todas</option>
            <option value="processed">Procesadas</option>
            <option value="received">Recibidas</option>
            <option value="ignored">Ignoradas</option>
            <option value="orphan">Huérfanas</option>
            <option value="error">Error</option>
          </select>
          <button onClick={onReload} className="btn" style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}>
            <RefreshCw size={13} /> Recargar
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '0.5rem', padding: '2.5rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
          <Inbox size={28} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '0.9rem' }}>No hay notificaciones recibidas</div>
          <div style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}>
            Cuando BFC envíe eventos al endpoint, aparecerán aquí
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>
                {['Fecha', 'Evento', 'Cuenta', 'Referencia', 'Monto', 'Firma', 'Estado', ''].map((h) => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((n) => (
                <React.Fragment key={n.id}>
                  <tr style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                    <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.78rem', color: '#64748b' }}>
                      {new Date(n.received_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>{n.event_type || '—'}</td>
                    <td style={{ padding: '0.55rem 0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{n.account_number || '—'}</td>
                    <td style={{ padding: '0.55rem 0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{n.reference || '—'}</td>
                    <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                      {n.amount != null ? `${Number(n.amount).toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${n.currency || ''}` : '—'}
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>
                      {n.signature_valid
                        ? <CheckCircle size={14} style={{ color: '#16a34a' }} />
                        : <XCircle size={14} style={{ color: '#dc2626' }} />}
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>{statusBadge(n.status)}</td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>
                      {(n.status === 'orphan' || n.status === 'error') && (
                        <button onClick={(e) => { e.stopPropagation(); retry(n.id); }} title="Reintentar" style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '0.25rem', padding: '0.25rem 0.4rem', cursor: 'pointer', color: '#64748b' }}>
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === n.id && (
                    <tr style={{ background: '#f8fafc' }}>
                      <td colSpan={8} style={{ padding: '1rem 1.5rem' }}>
                        {n.error_message && (
                          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                            <strong>Error:</strong> {n.error_message}
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8rem' }}>
                          <div>
                            <strong style={{ display: 'block', marginBottom: '0.35rem', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Payload</strong>
                            <pre style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.375rem', padding: '0.6rem', fontSize: '0.72rem', maxHeight: '240px', overflow: 'auto', margin: 0 }}>
{JSON.stringify(n.raw_payload, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <strong style={{ display: 'block', marginBottom: '0.35rem', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Metadata</strong>
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.375rem', padding: '0.6rem', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                              <div>IP origen: {n.source_ip || '—'}</div>
                              <div>Firma válida: {n.signature_valid ? 'sí' : 'no'}</div>
                              <div>Bank movement: {n.bank_movement_id || '—'}</div>
                            </div>
                            <strong style={{ display: 'block', margin: '0.6rem 0 0.35rem', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Headers</strong>
                            <pre style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.375rem', padding: '0.6rem', fontSize: '0.72rem', maxHeight: '160px', overflow: 'auto', margin: 0 }}>
{JSON.stringify(n.headers || {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConfigRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', padding: '0.4rem 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ width: '120px', color: '#94a3b8', flexShrink: 0, fontSize: '0.8rem' }}>{label}</div>
      <div style={{ fontFamily: value?.startsWith('http') ? 'monospace' : 'inherit', fontSize: '0.85rem', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}

// ─── WIZARD ────────────────────────────────────────────────────────
function BfcWizard({ config, bankAccounts, onDone, flash }) {
  const [step, setStep] = useState(1);
  const [creds, setCreds] = useState({
    base_url: config?.base_url || '',
    username: config?.username || '',
    password: '',
    cedula: config?.cedula || '',
    proxy_api_key: config?.proxy_api_key || '',
    auto_import: config?.auto_import ?? false,
  });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // null | 'loading' | 'ok' | 'error'
  const [testMsg, setTestMsg] = useState('');
  const [showDoc, setShowDoc] = useState(false);

  const steps = [
    { n: 1, label: 'Credenciales', icon: Key },
    { n: 2, label: 'Conexión', icon: Wifi },
    { n: 3, label: 'Finalizar', icon: Check },
  ];

  const saveCredentials = async () => {
    if (!creds.proxy_api_key && !creds.base_url) {
      flash('Ingresa la URL base o la API Key del proxy', 'error');
      return false;
    }
    setSaving(true);
    try {
      const body = { ...creds };
      if (!body.password) delete body.password;
      const res = await fetch(`${API}/bfc/config`, {
        method: 'POST', headers: headers(), body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) { flash(data.error?.message || 'Error guardando', 'error'); setSaving(false); return false; }
      setSaving(false);
      return true;
    } catch { flash('Error de conexión', 'error'); setSaving(false); return false; }
  };

  const handleStep1Next = async () => {
    const ok = await saveCredentials();
    if (ok) { setTestStatus(null); setStep(2); }
  };

  const handleTest = async () => {
    setTestStatus('loading');
    setTestMsg('');
    try {
      const res = await fetch(`${API}/bfc/test-connection`, { method: 'POST', headers: headers() });
      const data = await res.json();
      if (data.success) { setTestStatus('ok'); setTestMsg('Conexión exitosa'); }
      else { setTestStatus('error'); setTestMsg(data.error?.message || 'Falló la conexión'); }
    } catch { setTestStatus('error'); setTestMsg('Error de red'); }
  };

  const handleFinish = () => {
    onDone();
    setShowDoc(true);
  };

  if (showDoc) {
    return <BfcDocument creds={creds} onClose={onDone} />;
  }

  return (
    <div style={{ maxWidth: '580px' }}>
      {/* Steps */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '2rem' }}>
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = step > s.n;
          const active = step === s.n;
          return (
            <React.Fragment key={s.n}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? '#2563eb' : active ? '#eff6ff' : '#f1f5f9',
                  border: `2px solid ${done || active ? '#2563eb' : '#e2e8f0'}`,
                  color: done ? '#fff' : active ? '#2563eb' : '#94a3b8',
                }}>
                  {done ? <Check size={15} /> : <Icon size={15} />}
                </div>
                <div style={{ fontSize: '0.72rem', color: active ? '#2563eb' : '#94a3b8', marginTop: '0.3rem', fontWeight: active ? 600 : 400 }}>{s.label}</div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: '2px', background: step > s.n ? '#2563eb' : '#e2e8f0', marginTop: '18px' }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Step 1: Credenciales ── */}
      {step === 1 && (
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>Credenciales de acceso</h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem' }}>
            Datos proporcionados por BFC para el acceso a su API. Requiere túnel VPN activo.
          </p>

          <WizField label="URL Base del API" hint="Ej: https://api.bfc.com.ve/v1 — proporcionada por BFC">
            <input className="input" value={creds.base_url} onChange={(e) => setCreds({ ...creds, base_url: e.target.value })} placeholder="https://..." />
          </WizField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <WizField label="Usuario">
              <input className="input" value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })} autoComplete="username" />
            </WizField>
            <WizField label={`Contraseña${config ? ' (vacío = mantener)' : ''}`}>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} className="input" value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} style={{ paddingRight: '2.5rem' }} autoComplete="current-password" />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </WizField>
          </div>

          <WizField label="Cédula / RIF" hint="Sin guiones. Ej: J503159952">
            <input className="input" value={creds.cedula} onChange={(e) => setCreds({ ...creds, cedula: e.target.value })} placeholder="J503159952" />
          </WizField>

          <WizField label="API Key del Proxy EC2" hint="Valor de BFC_PROXY_API_KEY en el servidor proxy">
            <input className="input" value={creds.proxy_api_key} onChange={(e) => setCreds({ ...creds, proxy_api_key: e.target.value })} placeholder="proxy-api-key..." />
          </WizField>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
            <input type="checkbox" checked={creds.auto_import} onChange={(e) => setCreds({ ...creds, auto_import: e.target.checked })} />
            Auto-importar movimientos diariamente
          </label>

          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.375rem', padding: '0.75rem', fontSize: '0.78rem', color: '#92400e', marginBottom: '1.5rem' }}>
            <strong>Requisito previo:</strong> El túnel VPN IPSec site-to-site con BFC debe estar configurado y activo en el servidor antes de continuar.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleStep1Next} disabled={saving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {saving ? <RefreshCw size={14} className="spin" /> : null}
              {saving ? 'Guardando...' : 'Guardar y continuar'} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Test de conexión ── */}
      {step === 2 && (
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>Probar conexión</h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.5rem' }}>
            Verifica que las credenciales son correctas y que el servidor tiene acceso a la API del banco.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', background: '#f8fafc', borderRadius: '0.75rem', marginBottom: '1.5rem', gap: '1rem' }}>
            {testStatus === null && (
              <>
                <Wifi size={48} style={{ color: '#94a3b8' }} />
                <p style={{ color: '#64748b', margin: 0, fontSize: '0.9rem' }}>Haz clic en "Probar" para verificar la conexión con el servidor de BFC.</p>
              </>
            )}
            {testStatus === 'loading' && (
              <>
                <RefreshCw size={48} style={{ color: '#2563eb' }} className="spin" />
                <p style={{ color: '#2563eb', margin: 0 }}>Conectando con BFC...</p>
              </>
            )}
            {testStatus === 'ok' && (
              <>
                <CheckCircle size={48} style={{ color: '#16a34a' }} />
                <p style={{ color: '#16a34a', margin: 0, fontWeight: 600 }}>{testMsg}</p>
              </>
            )}
            {testStatus === 'error' && (
              <>
                <XCircle size={48} style={{ color: '#dc2626' }} />
                <p style={{ color: '#dc2626', margin: 0 }}>{testMsg}</p>
                <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0, textAlign: 'center' }}>
                  Revisa el túnel VPN, las credenciales y la URL base. Puedes volver al paso anterior para corregir.
                </p>
              </>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(1)} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ChevronLeft size={16} /> Atrás
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={handleTest} disabled={testStatus === 'loading'} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Wifi size={14} /> {testStatus === 'loading' ? 'Probando...' : 'Probar conexión'}
              </button>
              <button onClick={() => setStep(3)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {testStatus === 'ok' ? 'Continuar' : 'Saltar'} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Finalizar + documento ── */}
      {step === 3 && (
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>Configuración completada</h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem' }}>
            La integración BFC está lista. Ahora puedes agregar cuentas y comenzar a importar movimientos.
          </p>

          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
            <h4 style={{ color: '#16a34a', fontSize: '0.9rem', marginBottom: '0.5rem' }}>✓ Resumen de configuración</h4>
            <ConfigRow label="URL Base" value={creds.base_url || '—'} />
            <ConfigRow label="Usuario" value={creds.username || '—'} />
            <ConfigRow label="Cédula / RIF" value={creds.cedula || '—'} />
            <ConfigRow label="Proxy Key" value={creds.proxy_api_key ? '••••••••' : '—'} />
            <ConfigRow label="Auto-importar" value={creds.auto_import ? 'Sí' : 'No'} />
          </div>

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.82rem', color: '#1e40af' }}>
            <strong>Próximos pasos:</strong>
            <ol style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', lineHeight: '1.7' }}>
              <li>Ve a la pestaña <strong>Cuentas</strong> y agrega los números de cuenta BFC</li>
              <li>Vincula cada cuenta BFC a su cuenta bancaria local correspondiente</li>
              <li>Usa la pestaña <strong>Importar</strong> para traer los movimientos al sistema</li>
            </ol>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(2)} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ChevronLeft size={16} /> Atrás
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowDoc(true)} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Printer size={14} /> Ver documento
              </button>
              <button onClick={handleFinish} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Check size={14} /> Finalizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DOCUMENTO / RESUMEN IMPRIMIBLE ───────────────────────────────
function BfcDocument({ creds, onClose }) {
  const today = new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });
  const orgName = JSON.parse(localStorage.getItem('user') || '{}').orgName || '—';

  const print = () => window.print();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }} className="no-print">
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Documento de configuración BFC</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={print} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Printer size={14} /> Imprimir
          </button>
          <button onClick={onClose} className="btn">Cerrar</button>
        </div>
      </div>

      <div style={{ border: '2px solid #1e293b', borderRadius: '0.5rem', padding: '2rem', maxWidth: '540px', background: '#fff' }} id="bfc-document">
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem' }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b' }}>COMPRAR-IA</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Configuración de Integración BFC</div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.25rem' }}>{today}</div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Organización</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{orgName}</div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Parámetros de conexión</div>
          {[
            ['URL Base', creds.base_url || '(pendiente)'],
            ['Usuario', creds.username || '(pendiente)'],
            ['Contraseña', '(configurada en el sistema)'],
            ['Cédula / RIF', creds.cedula || '(pendiente)'],
            ['Proxy EC2 API Key', creds.proxy_api_key ? '(configurada en el sistema)' : '(no aplica)'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', gap: '1rem', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
              <div style={{ width: '140px', color: '#64748b', flexShrink: 0 }}>{label}</div>
              <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Opciones</div>
          {[
            ['Auto-importar', creds.auto_import ? 'Activado' : 'Desactivado'],
            ['Renovación token', 'Automática cada 2 horas'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', gap: '1rem', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
              <div style={{ width: '140px', color: '#64748b', flexShrink: 0 }}>{label}</div>
              <div>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#f8fafc', borderRadius: '0.375rem', padding: '0.75rem', fontSize: '0.78rem', color: '#64748b', marginTop: '1.5rem' }}>
          <strong>Nota de seguridad:</strong> Este documento no incluye contraseñas ni claves completas. Las credenciales se almacenan cifradas con AES-256 en la base de datos del sistema. Mantenga este documento en un lugar seguro.
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.72rem', color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
          Generado por Comprar-IA · {today}
        </div>
      </div>
    </div>
  );
}

function WizField({ label, hint, children }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.3rem', color: '#374151' }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>{hint}</div>}
    </div>
  );
}
