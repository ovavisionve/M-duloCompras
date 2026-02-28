import React, { useState, useEffect } from 'react';
import { RefreshCw, Link2, AlertTriangle, Settings, Wifi, WifiOff, Save } from 'lucide-react';
import api from '../api';

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
};

export default function Banking() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiConfig, setApiConfig] = useState(null);
  const [showApiSetup, setShowApiSetup] = useState(false);
  const [apiForm, setApiForm] = useState({ bank_api_provider: '', bank_api_url: '', bank_api_key: '', bank_api_enabled: 'false' });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.get('/banking/bank-accounts').then((r) => setAccounts(r.data.data)).catch(console.error);
    api.get('/banking/api-config').then((r) => {
      setApiConfig(r.data.data);
      setApiForm({
        bank_api_provider: r.data.data.bank_api_provider || '',
        bank_api_url: r.data.data.bank_api_url || '',
        bank_api_key: '',
        bank_api_enabled: r.data.data.bank_api_enabled || 'false',
      });
    }).catch(() => { setApiConfig({ is_configured: false }); });
  }, []);

  const loadMovements = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/banking/bank-accounts/${selectedAccount}/movements`, { params: { limit: 100 } });
      setMovements(data.data || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { if (selectedAccount) loadMovements(); }, [selectedAccount]);

  const autoReconcile = async () => {
    try {
      const { data } = await api.post('/banking/reconciliation/auto', { bank_account_id: selectedAccount });
      alert(`Conciliacion automatica: ${data.data.matched} conciliados de ${data.data.total_processed} procesados`);
      loadMovements();
    } catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  const saveApiConfig = async (e) => {
    e.preventDefault();
    try {
      await api.put('/banking/api-config', apiForm);
      const { data } = await api.get('/banking/api-config');
      setApiConfig(data.data);
      setShowApiSetup(false);
      alert('Configuracion de API bancaria guardada');
    } catch (err) { alert(err.response?.data?.error?.message || 'Error al guardar'); }
  };

  const syncFromApi = async () => {
    setSyncing(true);
    try {
      await api.post('/banking/sync');
      loadMovements();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error de sincronizacion');
    }
    setSyncing(false);
  };

  const statusBadge = { pendiente: 'badge-yellow', conciliado: 'badge-green', no_identificado: 'badge-red' };
  const statusLabel = { pendiente: 'Pendiente', conciliado: 'Conciliado', no_identificado: 'No Identificado' };

  return (
    <div>
      <div className="page-header">
        <h1>Conciliacion Bancaria</h1>
        <button className="btn" onClick={() => setShowApiSetup(!showApiSetup)}>
          <Settings size={14} /> API Bancaria
        </button>
      </div>

      {/* Bank API Banner */}
      {apiConfig && !apiConfig.is_configured && !showApiSetup && (
        <div className="card" style={{
          marginBottom: '1rem',
          borderLeft: '4px solid var(--warning)',
          background: '#fffbeb',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <WifiOff size={24} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#92400e' }}>API Bancaria no configurada</h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#a16207' }}>
                Para sincronizar movimientos automaticamente desde su banco, configure la conexion API.
                Solicite las credenciales a su banco y registrelas aqui.
              </p>
              <button className="btn" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }} onClick={() => setShowApiSetup(true)}>
                <Settings size={12} /> Configurar API Bancaria
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configured API Banner */}
      {apiConfig?.is_configured && apiConfig.bank_api_enabled === 'true' && !showApiSetup && (
        <div className="card" style={{
          marginBottom: '1rem',
          borderLeft: '4px solid var(--success)',
          background: '#f0fdf4',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Wifi size={20} style={{ color: 'var(--success)' }} />
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#166534' }}>
                  API Bancaria: {apiConfig.bank_api_provider}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#15803d', marginLeft: '0.5rem' }}>
                  Conectado ({apiConfig.bank_api_key_masked || '****'})
                </span>
              </div>
            </div>
            <button className="btn btn-primary" onClick={syncFromApi} disabled={syncing} style={{ fontSize: '0.8rem' }}>
              <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Sincronizando...' : 'Sincronizar Movimientos'}
            </button>
          </div>
        </div>
      )}

      {/* API Setup Form */}
      {showApiSetup && (
        <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Configuracion API Bancaria</h3>
            <button className="btn btn-sm" onClick={() => setShowApiSetup(false)}>Cerrar</button>
          </div>
          <form onSubmit={saveApiConfig}>
            <div className="form-row">
              <div className="form-group">
                <label>Proveedor / Banco</label>
                <select value={apiForm.bank_api_provider} onChange={(e) => setApiForm({ ...apiForm, bank_api_provider: e.target.value })}>
                  <option value="">Seleccione...</option>
                  <option value="Banesco">Banesco</option>
                  <option value="Mercantil">Mercantil</option>
                  <option value="Provincial">Provincial</option>
                  <option value="BNC">BNC</option>
                  <option value="Venezuela">Banco de Venezuela</option>
                  <option value="Bancamiga">Bancamiga</option>
                  <option value="Banplus">Banplus</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div className="form-group">
                <label>URL del API</label>
                <input
                  type="url"
                  value={apiForm.bank_api_url}
                  onChange={(e) => setApiForm({ ...apiForm, bank_api_url: e.target.value })}
                  placeholder="https://api.banco.com/v1"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>API Key / Token</label>
                <input
                  type="password"
                  value={apiForm.bank_api_key}
                  onChange={(e) => setApiForm({ ...apiForm, bank_api_key: e.target.value })}
                  placeholder={apiConfig?.bank_api_key_masked || 'Ingrese la clave API'}
                />
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select value={apiForm.bank_api_enabled} onChange={(e) => setApiForm({ ...apiForm, bank_api_enabled: e.target.value })}>
                  <option value="false">Deshabilitado</option>
                  <option value="true">Habilitado</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button type="submit" className="btn btn-primary"><Save size={14} /> Guardar Configuracion</button>
              <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                Nota: Cuando su banco le proporcione el API, registre aqui las credenciales para habilitar la sincronizacion automatica.
              </span>
            </div>
          </form>
        </div>
      )}

      {/* Account selector + actions */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-row" style={{ alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Cuenta Bancaria</label>
            <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
              <option value="">Seleccione cuenta...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.bank_name} - {a.account_number} ({a.currency})</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={autoReconcile} disabled={!selectedAccount}>
            <RefreshCw size={14} /> Conciliar Automatico
          </button>
        </div>
      </div>

      {/* Bank Accounts Summary */}
      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        {accounts.map((a) => (
          <div className="stat-card" key={a.id}>
            <div className="label">{a.bank_name} ({a.currency})</div>
            <div className="value" style={{ fontSize: '1.1rem' }}>
              {a.currency === 'VES' ? 'Bs.' : '$'} {Number(a.current_balance).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
            </div>
            <div className="sub">{a.account_number}</div>
          </div>
        ))}
      </div>

      {selectedAccount && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Referencia</th>
                <th>Descripcion</th>
                <th>Debito</th>
                <th>Credito</th>
                <th>Saldo</th>
                <th>Conciliacion</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{fmtDate(m.movement_date)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{m.reference || '-'}</td>
                  <td>{m.description || '-'}</td>
                  <td style={{ fontFamily: 'monospace', color: parseFloat(m.debit) > 0 ? 'var(--danger)' : 'inherit' }}>
                    {parseFloat(m.debit) > 0 ? Number(m.debit).toFixed(2) : '-'}
                  </td>
                  <td style={{ fontFamily: 'monospace', color: parseFloat(m.credit) > 0 ? 'var(--success)' : 'inherit' }}>
                    {parseFloat(m.credit) > 0 ? Number(m.credit).toFixed(2) : '-'}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{m.balance != null ? Number(m.balance).toFixed(2) : '-'}</td>
                  <td>
                    <span className={`badge ${statusBadge[m.reconciliation_status]}`}>
                      {statusLabel[m.reconciliation_status]}
                    </span>
                  </td>
                </tr>
              ))}
              {!movements.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>{loading ? 'Cargando...' : 'Sin movimientos'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
