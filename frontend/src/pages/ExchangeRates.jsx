import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { RefreshCw, Plus } from 'lucide-react';
import api from '../api';
import { fmtNum } from '../utils/format';

export default function ExchangeRates() {
  const [rates, setRates] = useState([]);
  const [todayRate, setTodayRate] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ date: new Date().toISOString().split('T')[0], rate: '' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get('/exchange-rates').then((r) => setRates(r.data.data || [])).catch(console.error).finally(() => setLoading(false));
    api.get('/exchange-rates/today').then((r) => setTodayRate(r.data.data)).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const fetchNow = async () => {
    try {
      await api.post('/exchange-rates/fetch');
      load();
    } catch (err) { alert(err.response?.data?.error?.message || 'Error al obtener tasa'); }
  };

  const submitManual = async (e) => {
    e.preventDefault();
    try {
      await api.post('/exchange-rates/manual', { date: manualForm.date, rate: parseFloat(manualForm.rate) });
      setShowManual(false);
      load();
    } catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  const chartData = [...rates].reverse().map((r) => ({ date: r.rate_date, rate: parseFloat(r.rate) }));

  return (
    <div>
      <div className="page-header">
        <h1>Tasas de Cambio BCV</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary" onClick={fetchNow}><RefreshCw size={14} /> Obtener Tasa BCV</button>
          <button className="btn" onClick={() => setShowManual(!showManual)}><Plus size={14} /> Tasa Manual</button>
        </div>
      </div>

      {todayRate && (
        <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
            <div className="label">Tasa BCV Hoy</div>
            <div className="value">Bs. {fmtNum(todayRate.rate)}</div>
            <div className="sub">Fecha: {todayRate.rate_date} | Fuente: {todayRate.source === 'bcv_api' ? 'BCV API' : 'Manual'}</div>
          </div>
        </div>
      )}

      {showManual && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Registrar Tasa Manual</h3>
          <form onSubmit={submitManual}>
            <div className="form-row" style={{ alignItems: 'end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Fecha</label>
                <input type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Tasa (Bs/USD)</label>
                <input type="number" step="0.000001" value={manualForm.rate} onChange={(e) => setManualForm({ ...manualForm, rate: e.target.value })} placeholder="36.50" required />
              </div>
              <button type="submit" className="btn btn-primary">Guardar</button>
              <button type="button" className="btn" onClick={() => setShowManual(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {chartData.length > 1 && (
        <div className="chart-card" style={{ marginBottom: '1.5rem' }}>
          <h3>Evolución de Tasa BCV (últimos 30 días)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} domain={['auto', 'auto']} />
              <Tooltip formatter={(v) => `Bs. ${fmtNum(v)}`} />
              <Line type="monotone" dataKey="rate" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tasa (Bs/USD)</th>
              <th>Fuente</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>{r.rate_date}</td>
                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{Number(r.rate).toFixed(6)}</td>
                <td><span className={`badge ${r.source === 'bcv_api' ? 'badge-green' : 'badge-yellow'}`}>{r.source === 'bcv_api' ? 'BCV API' : 'Manual'}</span></td>
              </tr>
            ))}
            {!rates.length && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>{loading ? 'Cargando...' : 'Sin tasas registradas'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
