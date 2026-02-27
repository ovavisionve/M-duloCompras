import React, { useState, useEffect } from 'react';
import { RefreshCw, Link2 } from 'lucide-react';
import api from '../api';

export default function Banking() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/banking/bank-accounts').then((r) => setAccounts(r.data.data)).catch(console.error);
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
      alert(`Conciliación automática: ${data.data.matched} conciliados de ${data.data.total_processed} procesados`);
      loadMovements();
    } catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  const statusBadge = { pendiente: 'badge-yellow', conciliado: 'badge-green', no_identificado: 'badge-red' };
  const statusLabel = { pendiente: 'Pendiente', conciliado: 'Conciliado', no_identificado: 'No Identificado' };

  return (
    <div>
      <div className="page-header">
        <h1>Conciliación Bancaria</h1>
      </div>

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
            <RefreshCw size={14} /> Conciliar Automático
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
                <th>Descripción</th>
                <th>Débito</th>
                <th>Crédito</th>
                <th>Saldo</th>
                <th>Conciliación</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.movement_date}</td>
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
