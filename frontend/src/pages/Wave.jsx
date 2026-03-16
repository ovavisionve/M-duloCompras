import React, { useState, useEffect } from 'react';
import api from '../api';
import { Waves, Settings, RefreshCw, CheckCircle, XCircle, AlertCircle, ArrowUpRight, Users, FileText, Plug, Trash2, Eye, EyeOff } from 'lucide-react';

export default function Wave() {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Setup form
  const [form, setForm] = useState({ access_token: '', business_id: '', business_name: '', sync_invoices: true, sync_suppliers: true });
  const [testResult, setTestResult] = useState(null);
  const [businesses, setBusinesses] = useState([]);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cfgRes, statusRes, logsRes] = await Promise.all([
        api.get('/wave/config').catch(() => ({ data: { data: null } })),
        api.get('/wave/status').catch(() => ({ data: { data: { configured: false } } })),
        api.get('/wave/logs?limit=20').catch(() => ({ data: { data: [] } })),
      ]);
      setConfig(cfgRes.data.data);
      setStatus(statusRes.data.data);
      setLogs(logsRes.data.data || []);
      if (!cfgRes.data.data) setShowSetup(true);
    } catch { /* ignore */ }
    setLoading(false);
  };

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
    if (!form.access_token || !form.business_id) return alert('Token y Business ID requeridos');
    try {
      await api.post('/wave/config', { ...form, is_active: true });
      setShowSetup(false);
      setTestResult(null);
      setBusinesses([]);
      await loadAll();
      alert('Wave conectado exitosamente');
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
      setShowSetup(true);
      setForm({ access_token: '', business_id: '', business_name: '', sync_invoices: true, sync_suppliers: true });
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error al desconectar');
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/wave/sync/invoices');
      const r = data.data;
      alert(`Sincronización completada:\n• ${r.synced} sincronizadas\n• ${r.skipped} ya existían\n• ${r.errors} errores`);
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error en sincronización');
    }
    setSyncing(false);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1><Waves size={24} /> Wave Accounting</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {config && (
            <>
              <button className="btn btn-primary" onClick={handleSyncAll} disabled={syncing}>
                <RefreshCw size={16} className={syncing ? 'spin' : ''} /> {syncing ? 'Sincronizando...' : 'Sincronizar Todo'}
              </button>
              <button className="btn" onClick={() => setShowSetup(!showSetup)}>
                <Settings size={16} /> Configurar
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── SETUP PANEL ─── */}
      {showSetup && (
        <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid var(--primary)' }}>
          <h3 style={{ marginBottom: '1rem' }}><Plug size={18} /> {config ? 'Configuración de Wave' : 'Conectar con Wave'}</h3>

          <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
            Para conectar necesitas un <strong>Full Access Token</strong> de Wave.
            Ve a <a href="https://developer.waveapps.com/hc/en-us/articles/360019493652" target="_blank" rel="noopener noreferrer">developer.waveapps.com</a>,
            crea una aplicación y genera un token.
          </p>

          <div style={{ display: 'grid', gap: '1rem', maxWidth: '600px' }}>
            <div>
              <label>Full Access Token</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={form.access_token}
                  onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                  placeholder="Pega tu token de Wave aquí..."
                  style={{ flex: 1 }}
                />
                <button className="btn" onClick={() => setShowToken(!showToken)} title={showToken ? 'Ocultar' : 'Mostrar'}>
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button className="btn btn-primary" onClick={handleTestConnection} disabled={testing}>
                  {testing ? 'Probando...' : 'Probar Conexión'}
                </button>
              </div>
            </div>

            {/* Test Result */}
            {testResult && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '1rem' }}>
                <p style={{ fontWeight: 600, color: '#166534' }}><CheckCircle size={16} style={{ verticalAlign: 'middle' }} /> Conexión exitosa</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Usuario: {testResult.user?.defaultEmail}</p>
                {businesses.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <label>Selecciona el negocio:</label>
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

            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={form.sync_invoices} onChange={(e) => setForm({ ...form, sync_invoices: e.target.checked })} />
                Sincronizar facturas
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={form.sync_suppliers} onChange={(e) => setForm({ ...form, sync_suppliers: e.target.checked })} />
                Sincronizar proveedores
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={handleSaveConfig} disabled={!form.access_token || !form.business_id}>
                <CheckCircle size={16} /> Guardar y Activar
              </button>
              {config && (
                <button className="btn" style={{ color: '#dc2626' }} onClick={handleDisconnect}>
                  <Trash2 size={16} /> Desconectar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── STATUS CARDS ─── */}
      {status?.configured && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem' }}>Estado</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: status.is_active ? '#16a34a' : '#dc2626' }}>
              {status.is_active ? '● Conectado' : '● Desconectado'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>{status.business_name}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <FileText size={20} style={{ color: 'var(--primary)', margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Facturas Sincronizadas</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{status.invoices?.synced || 0} / {status.invoices?.total || 0}</div>
            {status.invoices?.pending > 0 && (
              <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.25rem' }}>{status.invoices.pending} pendientes</div>
            )}
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <Users size={20} style={{ color: 'var(--primary)', margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Proveedores en Wave</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{status.suppliers_synced || 0}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <RefreshCw size={20} style={{ color: 'var(--primary)', margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Última Sincronización</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {status.last_sync ? new Date(status.last_sync).toLocaleString('es-VE') : 'Nunca'}
            </div>
          </div>
        </div>
      )}

      {/* ─── NOT CONFIGURED ─── */}
      {!status?.configured && !showSetup && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Waves size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
          <h2>Wave Accounting no está conectado</h2>
          <p style={{ color: '#666', marginTop: '0.5rem' }}>Conecta tu cuenta de Wave para sincronizar facturas y proveedores automáticamente.</p>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowSetup(true)}>
            <Plug size={16} /> Configurar Conexión
          </button>
        </div>
      )}

      {/* ─── SYNC LOGS ─── */}
      {logs.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Historial de Sincronización</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Dirección</th>
                  <th>Estado</th>
                  <th>Wave ID</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString('es-VE')}
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                        background: log.entity_type === 'invoice' ? '#dbeafe' : log.entity_type === 'supplier' ? '#fef3c7' : '#e5e7eb',
                        color: log.entity_type === 'invoice' ? '#1e40af' : log.entity_type === 'supplier' ? '#92400e' : '#374151',
                      }}>
                        {log.entity_type === 'invoice' ? 'Factura' : log.entity_type === 'supplier' ? 'Proveedor' : log.entity_type}
                      </span>
                    </td>
                    <td>
                      <ArrowUpRight size={14} style={{ color: '#6366f1' }} /> Push
                    </td>
                    <td>
                      {log.status === 'success' ? (
                        <span style={{ color: '#16a34a' }}><CheckCircle size={14} /> OK</span>
                      ) : log.status === 'error' ? (
                        <span style={{ color: '#dc2626' }}><XCircle size={14} /> Error</span>
                      ) : (
                        <span style={{ color: '#f59e0b' }}><AlertCircle size={14} /> Pendiente</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                      {log.wave_id ? log.wave_id.substring(0, 20) + '...' : '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#dc2626', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.error_message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── HELP SECTION ─── */}
      <div className="card" style={{ marginTop: '1.5rem', background: '#f8fafc' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>¿Cómo funciona?</h3>
        <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.7 }}>
          <p><strong>1.</strong> Crea una cuenta en <a href="https://www.waveapps.com" target="_blank" rel="noopener noreferrer">waveapps.com</a> (gratis)</p>
          <p><strong>2.</strong> Ve al <a href="https://developer.waveapps.com" target="_blank" rel="noopener noreferrer">Portal de Desarrolladores</a>, crea una App y genera un Full Access Token</p>
          <p><strong>3.</strong> Pega el token aquí, prueba la conexión y selecciona tu negocio</p>
          <p><strong>4.</strong> Las facturas aprobadas y pagadas se sincronizan a Wave como facturas SAVED</p>
          <p><strong>5.</strong> Los proveedores se crean automáticamente como Clientes en Wave al sincronizar facturas</p>
          <p style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#fef3c7', borderRadius: '6px' }}>
            <AlertCircle size={14} style={{ verticalAlign: 'middle' }} /> <strong>Nota:</strong> Desde mayo 2025, los usuarios de Wave necesitan un plan Pro para integraciones de terceros vía OAuth. El Full Access Token funciona sin suscripción para uso personal/desarrollo.
          </p>
        </div>
      </div>
    </div>
  );
}
