import React, { useState, useEffect } from 'react';
import { Save, X, EyeOff, Eye } from 'lucide-react';
import api from '../api';

export default function Configuration() {
  const [company, setCompany] = useState({});
  const [taxUnit, setTaxUnit] = useState('');
  const [categories, setCategories] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [rules, setRules] = useState([]);
  const [newCat, setNewCat] = useState({ name: '', code: '' });
  const [newCC, setNewCC] = useState({ name: '', code: '' });

  useEffect(() => {
    api.get('/config/company').then((r) => setCompany(r.data.data));
    api.get('/config/tax-unit').then((r) => setTaxUnit(r.data.data.value));
    api.get('/config/expense-categories?all=true').then((r) => setCategories(r.data.data));
    api.get('/config/cost-centers?all=true').then((r) => setCostCenters(r.data.data));
    api.get('/config/withholding-rules').then((r) => setRules(r.data.data));
  }, []);

  const saveCompany = async () => {
    try {
      await api.put('/config/company', company);
      alert('Datos de empresa actualizados');
    } catch (err) { alert('Error al guardar'); }
  };

  const saveTaxUnit = async () => {
    try {
      await api.put('/config/tax-unit', { value: parseFloat(taxUnit) });
      alert('Unidad Tributaria actualizada');
    } catch (err) { alert('Error al guardar'); }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/config/expense-categories', newCat);
      setCategories([...categories, data.data]);
      setNewCat({ name: '', code: '' });
    } catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  const addCostCenter = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/config/cost-centers', newCC);
      setCostCenters([...costCenters, data.data]);
      setNewCC({ name: '', code: '' });
    } catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  const toggleCategory = async (id) => {
    try {
      const { data } = await api.patch(`/config/expense-categories/${id}/toggle`);
      setCategories(categories.map((c) => c.id === id ? data.data : c));
    } catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  const deleteCategory = async (id, name) => {
    if (!window.confirm(`¿Eliminar la categoría "${name}"?`)) return;
    try {
      await api.delete(`/config/expense-categories/${id}`);
      setCategories(categories.filter((c) => c.id !== id));
    } catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  const toggleCostCenter = async (id) => {
    try {
      const { data } = await api.patch(`/config/cost-centers/${id}/toggle`);
      setCostCenters(costCenters.map((c) => c.id === id ? data.data : c));
    } catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  const deleteCostCenter = async (id, name) => {
    if (!window.confirm(`¿Eliminar el centro de costo "${name}"?`)) return;
    try {
      await api.delete(`/config/cost-centers/${id}`);
      setCostCenters(costCenters.filter((c) => c.id !== id));
    } catch (err) { alert(err.response?.data?.error?.message || 'Error'); }
  };

  return (
    <div>
      <div className="page-header"><h1>Configuración</h1></div>

      {/* Company Info */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Datos de la Empresa</h3>
        <div className="form-row">
          <div className="form-group">
            <label>RIF</label>
            <input value={company.company_rif || ''} onChange={(e) => setCompany({ ...company, company_rif: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Razón Social</label>
            <input value={company.company_name || ''} onChange={(e) => setCompany({ ...company, company_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Dirección Fiscal</label>
            <input value={company.company_address || ''} onChange={(e) => setCompany({ ...company, company_address: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label>
            <input type="checkbox" checked={company.is_special_taxpayer === 'true'} onChange={(e) => setCompany({ ...company, is_special_taxpayer: String(e.target.checked) })} />
            {' '}Es Contribuyente Especial
          </label>
        </div>
        <button className="btn btn-primary" onClick={saveCompany}><Save size={14} /> Guardar</button>
      </div>

      {/* Tax Unit */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Unidad Tributaria</h3>
        <div className="form-row" style={{ alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Valor UT (Bs.)</label>
            <input type="number" step="0.01" value={taxUnit} onChange={(e) => setTaxUnit(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={saveTaxUnit}><Save size={14} /> Actualizar</button>
        </div>
      </div>

      {/* Expense Categories */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Categorías de Gasto</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {categories.map((c) => (
            <span key={c.id} className={`badge ${c.is_active ? 'badge-blue' : 'badge-gray'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', opacity: c.is_active ? 1 : 0.5 }}>
              {c.code} - {c.name}
              <button onClick={() => toggleCategory(c.id)} title={c.is_active ? 'Desactivar' : 'Activar'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit' }}>
                {c.is_active ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button onClick={() => deleteCategory(c.id, c.name)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit' }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={addCategory}>
          <div className="form-row" style={{ alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Código</label>
              <input value={newCat.code} onChange={(e) => setNewCat({ ...newCat, code: e.target.value })} placeholder="SER-NUE" required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nombre</label>
              <input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="Nueva categoría" required />
            </div>
            <button type="submit" className="btn btn-primary">Agregar</button>
          </div>
        </form>
      </div>

      {/* Cost Centers */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Centros de Costo</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {costCenters.map((c) => (
            <span key={c.id} className={`badge ${c.is_active ? 'badge-green' : 'badge-gray'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', opacity: c.is_active ? 1 : 0.5 }}>
              {c.code} - {c.name}
              <button onClick={() => toggleCostCenter(c.id)} title={c.is_active ? 'Desactivar' : 'Activar'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit' }}>
                {c.is_active ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button onClick={() => deleteCostCenter(c.id, c.name)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit' }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={addCostCenter}>
          <div className="form-row" style={{ alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Código</label>
              <input value={newCC.code} onChange={(e) => setNewCC({ ...newCC, code: e.target.value })} required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nombre</label>
              <input value={newCC.name} onChange={(e) => setNewCC({ ...newCC, name: e.target.value })} required />
            </div>
            <button type="submit" className="btn btn-primary">Agregar</button>
          </div>
        </form>
      </div>

      {/* Withholding Rules */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Reglas de Retención</h3>
        <div className="table-container" style={{ boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Código</th>
                <th>Concepto</th>
                <th>Porcentaje</th>
                <th>Sustraendo (UT)</th>
                <th>Aplica a</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td><span className={`badge ${r.type === 'ISLR' ? 'badge-blue' : 'badge-orange'}`}>{r.type}</span></td>
                  <td style={{ fontFamily: 'monospace' }}>{r.concept_code}</td>
                  <td>{r.concept_name}</td>
                  <td>{r.rate}%</td>
                  <td>{r.subtract_ut}</td>
                  <td>{r.applies_to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
