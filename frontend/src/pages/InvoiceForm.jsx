import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function InvoiceForm() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [rate, setRate] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    supplier_id: '', document_type: 'FC', invoice_number: '', control_number: '',
    emission_date: new Date().toISOString().split('T')[0],
    reception_date: new Date().toISOString().split('T')[0],
    fiscal_period: '', currency: 'VES', exchange_rate: '',
    exchange_rate_date: new Date().toISOString().split('T')[0],
    description: '', expense_category_id: '', cost_center_id: '',
    taxable_amount: '', exempt_amount: '0', non_subject_amount: '0',
    vat_rate: '16', igtf_amount: '0', status: 'registrada',
  });

  useEffect(() => {
    api.get('/suppliers', { params: { limit: 200 } }).then((r) => setSuppliers(r.data.data));
    api.get('/config/expense-categories').then((r) => setCategories(r.data.data));
    api.get('/config/cost-centers').then((r) => setCostCenters(r.data.data));
    api.get('/exchange-rates/today').then((r) => {
      if (r.data.data) {
        setRate(r.data.data);
        setForm((f) => ({ ...f, exchange_rate: r.data.data.rate }));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.emission_date) {
      const d = new Date(form.emission_date);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      setForm((f) => ({ ...f, fiscal_period: `${mm}/${d.getFullYear()}` }));
    }
  }, [form.emission_date]);

  const calculated = (() => {
    const taxable = parseFloat(form.taxable_amount) || 0;
    const exempt = parseFloat(form.exempt_amount) || 0;
    const nonSubject = parseFloat(form.non_subject_amount) || 0;
    const vatRate = parseFloat(form.vat_rate) || 16;
    const exchangeRate = parseFloat(form.exchange_rate) || 1;
    const igtf = parseFloat(form.igtf_amount) || 0;
    const vatAmount = Math.round(taxable * vatRate / 100 * 100) / 100;
    const total = taxable + exempt + nonSubject + vatAmount + igtf;
    const totalVes = form.currency === 'USD' ? total * exchangeRate : total;
    const totalUsd = form.currency === 'VES' ? total / exchangeRate : total;
    return { vatAmount, total, totalVes, totalUsd };
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/invoices', {
        ...form,
        exchange_rate: parseFloat(form.exchange_rate),
        taxable_amount: parseFloat(form.taxable_amount) || 0,
        exempt_amount: parseFloat(form.exempt_amount) || 0,
        non_subject_amount: parseFloat(form.non_subject_amount) || 0,
        vat_rate: parseFloat(form.vat_rate),
        igtf_amount: parseFloat(form.igtf_amount) || 0,
        expense_category_id: form.expense_category_id || null,
        cost_center_id: form.cost_center_id || null,
      });
      navigate('/invoices');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error al registrar factura');
    }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div>
      <div className="page-header">
        <h1>Registrar Factura</h1>
        <button className="btn" onClick={() => navigate('/invoices')}>Volver</button>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Supplier & Doc Type */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>Datos del Documento</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Proveedor *</label>
              <select value={form.supplier_id} onChange={set('supplier_id')} required>
                <option value="">Seleccione proveedor...</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.rif} - {s.business_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Tipo de Documento *</label>
              <select value={form.document_type} onChange={set('document_type')}>
                <option value="FC">Factura de Compra</option>
                <option value="FG">Factura de Gasto</option>
                <option value="ND">Nota de Débito</option>
                <option value="NC">Nota de Crédito</option>
                <option value="DSF">Documento Sin Factura</option>
              </select>
            </div>
            <div className="form-group">
              <label>Estatus</label>
              <select value={form.status} onChange={set('status')}>
                <option value="borrador">Borrador</option>
                <option value="registrada">Registrada</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Nº Factura *</label>
              <input value={form.invoice_number} onChange={set('invoice_number')} required />
            </div>
            <div className="form-group">
              <label>Nº Control {form.document_type !== 'DSF' ? '*' : ''}</label>
              <input value={form.control_number} onChange={set('control_number')} placeholder="00-00000000" required={form.document_type !== 'DSF'} />
            </div>
            <div className="form-group">
              <label>Fecha Emisión *</label>
              <input type="date" value={form.emission_date} onChange={set('emission_date')} required />
            </div>
            <div className="form-group">
              <label>Fecha Recepción *</label>
              <input type="date" value={form.reception_date} onChange={set('reception_date')} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Período Fiscal</label>
              <input value={form.fiscal_period} onChange={set('fiscal_period')} placeholder="MM/YYYY" />
            </div>
            <div className="form-group">
              <label>Moneda *</label>
              <select value={form.currency} onChange={set('currency')}>
                <option value="VES">VES - Bolívar</option>
                <option value="USD">USD - Dólar</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tasa BCV *</label>
              <input type="number" step="0.000001" value={form.exchange_rate} onChange={set('exchange_rate')} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Descripción / Concepto *</label>
              <textarea value={form.description} onChange={set('description')} rows={2} required />
            </div>
            <div className="form-group">
              <label>Categoría de Gasto</label>
              <select value={form.expense_category_id} onChange={set('expense_category_id')}>
                <option value="">Seleccione...</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Amounts */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>Desglose de Montos ({form.currency})</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Base Imponible (Gravable) *</label>
              <input type="number" step="0.01" value={form.taxable_amount} onChange={set('taxable_amount')} required />
            </div>
            <div className="form-group">
              <label>Monto Exento</label>
              <input type="number" step="0.01" value={form.exempt_amount} onChange={set('exempt_amount')} />
            </div>
            <div className="form-group">
              <label>Monto No Sujeto</label>
              <input type="number" step="0.01" value={form.non_subject_amount} onChange={set('non_subject_amount')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Alícuota IVA (%)</label>
              <select value={form.vat_rate} onChange={set('vat_rate')}>
                <option value="16">16%</option>
                <option value="8">8%</option>
                <option value="31">31%</option>
                <option value="0">0% (Exento)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Monto IVA (calculado)</label>
              <input type="text" value={calculated.vatAmount.toFixed(2)} readOnly style={{ background: 'var(--gray-100)' }} />
            </div>
            <div className="form-group">
              <label>IGTF (si aplica)</label>
              <input type="number" step="0.01" value={form.igtf_amount} onChange={set('igtf_amount')} />
            </div>
          </div>

          <div style={{ background: 'var(--gray-50)', padding: '1rem', borderRadius: 'var(--radius)', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div><strong>Total ({form.currency}):</strong> {calculated.total.toFixed(2)}</div>
              <div><strong>Total VES:</strong> Bs. {calculated.totalVes.toFixed(2)}</div>
              <div><strong>Total USD:</strong> $ {calculated.totalUsd.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" className="btn btn-primary">Registrar Factura</button>
          <button type="button" className="btn" onClick={() => navigate('/invoices')}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
