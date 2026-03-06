import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, FileText, AlertTriangle, TrendingUp } from 'lucide-react';
import api from '../api';
import { fmtNum, fmtVES, fmtUSD } from '../utils/format';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const formatVes = fmtVES;
const formatUsd = fmtUSD;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard').then((res) => setData(res.data.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando dashboard...</div>;
  if (!data) return <div style={{ padding: '2rem' }}>Error cargando datos</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {data.exchange_rate && (
            <div className="badge badge-green" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
              <DollarSign size={14} /> Tasa BCV: {fmtNum(data.exchange_rate.rate)} Bs/$
            </div>
          )}
          <span style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>Período: {data.period}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Compras del Mes</div>
          <div className="value">{formatVes(data.monthly_totals?.total_ves)}</div>
          <div className="sub">{formatUsd(data.monthly_totals?.total_usd)} | {data.monthly_totals?.invoice_count} facturas</div>
        </div>
        <div className="stat-card">
          <div className="label">Pendientes por Pagar</div>
          <div className="value" style={{ color: 'var(--warning)' }}>{formatVes(data.pending_invoices?.total_ves)}</div>
          <div className="sub">{data.pending_invoices?.count} facturas pendientes</div>
        </div>
        <div className="stat-card">
          <div className="label">Facturas Vencidas (+30d)</div>
          <div className="value" style={{ color: 'var(--danger)' }}>{data.overdue_invoices?.count || 0}</div>
          <div className="sub">{formatVes(data.overdue_invoices?.total_ves)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Retenciones del Período</div>
          <div className="value">{data.withholdings_summary?.count || 0}</div>
          <div className="sub">{formatVes(data.withholdings_summary?.total_ves)}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3>Evolución Mensual de Compras (VES)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.monthly_evolution || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fiscal_period" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v) => formatVes(v)} />
              <Bar dataKey="total_ves" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Gastos por Categoría</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={data.expenses_by_category || []} dataKey="total_ves" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                {(data.expenses_by_category || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatVes(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3>Top 5 Proveedores</h3>
          {(data.top_suppliers || []).map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--gray-200)' }}>
              <span style={{ fontSize: '0.85rem' }}>{s.business_name}</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatVes(s.total_ves)}</span>
            </div>
          ))}
          {(!data.top_suppliers?.length) && <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>Sin datos para el período</p>}
        </div>

        <div className="chart-card">
          <h3>Saldos Bancarios</h3>
          {(data.bank_balances || []).map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--gray-200)' }}>
              <span style={{ fontSize: '0.85rem' }}>{b.bank_name} ({b.currency})</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {b.currency === 'VES' ? formatVes(b.current_balance) : formatUsd(b.current_balance)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
