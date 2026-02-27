import React, { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import api from '../api';

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ rif: '', business_name: '', fiscal_address: '', phone: '', email: '', taxpayer_type: 'ordinario', is_retention_agent: false });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/suppliers', { params: { search, limit: 50 } })
      .then((res) => setSuppliers(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/suppliers', form);
      setShowForm(false);
      setForm({ rif: '', business_name: '', fiscal_address: '', phone: '', email: '', taxpayer_type: 'ordinario', is_retention_agent: false });
      load();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Error al crear proveedor');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Proveedores</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Nuevo Proveedor
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Registrar Proveedor</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>RIF *</label>
                <input value={form.rif} onChange={(e) => setForm({ ...form, rif: e.target.value })} placeholder="J-12345678-9" required />
              </div>
              <div className="form-group">
                <label>Razón Social *</label>
                <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Tipo de Contribuyente</label>
                <select value={form.taxpayer_type} onChange={(e) => setForm({ ...form, taxpayer_type: e.target.value })}>
                  <option value="ordinario">Ordinario</option>
                  <option value="especial">Especial</option>
                  <option value="no_sujeto">No Sujeto</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Teléfono</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Dirección Fiscal</label>
                <input value={form.fiscal_address} onChange={(e) => setForm({ ...form, fiscal_address: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>
                <input type="checkbox" checked={form.is_retention_agent} onChange={(e) => setForm({ ...form, is_retention_agent: e.target.checked })} />
                {' '}Es agente de retención IVA
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary">Guardar</button>
              <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ position: 'relative', maxWidth: '300px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-500)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por RIF o nombre..." style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.25rem', border: '1px solid var(--gray-300)', borderRadius: 'var(--radius)', fontSize: '0.85rem' }} />
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>RIF</th>
              <th>Razón Social</th>
              <th>Tipo</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Ag. Retención</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td style={{ fontFamily: 'monospace' }}>{s.rif}</td>
                <td>{s.business_name}</td>
                <td><span className={`badge ${s.taxpayer_type === 'especial' ? 'badge-orange' : 'badge-blue'}`}>{s.taxpayer_type}</span></td>
                <td>{s.phone || '-'}</td>
                <td>{s.email || '-'}</td>
                <td>{s.is_retention_agent ? 'Sí' : 'No'}</td>
                <td><span className={`badge ${s.is_active ? 'badge-green' : 'badge-red'}`}>{s.is_active ? 'Activo' : 'Inactivo'}</span></td>
              </tr>
            ))}
            {!suppliers.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>{loading ? 'Cargando...' : 'No hay proveedores'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
