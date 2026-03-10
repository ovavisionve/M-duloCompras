import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { fmtNum } from '../utils/format';

const INVOICE_DRAFT_KEY = 'draft_invoice';

function loadDraft(key, defaults) {
  try { const saved = JSON.parse(localStorage.getItem(key)); return saved ? { ...defaults, ...saved } : defaults; }
  catch { return defaults; }
}

export default function InvoiceForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const presetType = searchParams.get('type'); // NC or ND from credit notes page
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [supplierInvoices, setSupplierInvoices] = useState([]);
  const [rate, setRate] = useState(null);
  const [binanceRate, setBinanceRate] = useState(null);
  const [error, setError] = useState('');
  const [editLoading, setEditLoading] = useState(!!editId);
  const today = new Date().toISOString().split('T')[0];
  const defaultForm = {
    supplier_id: '', document_type: presetType || 'FC', invoice_number: '', control_number: '',
    emission_date: today, reception_date: today,
    fiscal_period: '', currency: 'VES', exchange_rate: '',
    exchange_rate_date: today,
    description: '', expense_category_id: '', cost_center_id: '',
    taxable_amount: '', exempt_amount: '0', non_subject_amount: '0',
    vat_rate: '16', igtf_amount: '0', status: 'registrada',
    related_invoice_id: '', note_reason: '', affected_invoice_number: '',
  };
  const [form, setForm] = useState(() => editId ? defaultForm : loadDraft(INVOICE_DRAFT_KEY, defaultForm));

  const isNCND = ['NC', 'ND'].includes(form.document_type);
  const isNC = form.document_type === 'NC';

  useEffect(() => { if (!editId) localStorage.setItem(INVOICE_DRAFT_KEY, JSON.stringify(form)); }, [form, editId]);

  useEffect(() => {
    api.get('/suppliers', { params: { limit: 200 } }).then((r) => setSuppliers(r.data.data));
    api.get('/config/expense-categories').then((r) => setCategories(r.data.data));
    api.get('/config/cost-centers').then((r) => setCostCenters(r.data.data));
    api.get('/exchange-rates/today').then((r) => {
      if (r.data.data) {
        setRate(r.data.data);
        if (!editId) setForm((f) => ({ ...f, exchange_rate: r.data.data.rate }));
      }
    }).catch(() => {});
    api.get('/exchange-rates/binance').then((r) => {
      if (r.data.data) setBinanceRate(r.data.data);
    }).catch(() => {});

    // Load existing invoice for editing
    if (editId) {
      api.get(`/invoices/${editId}`).then((r) => {
        const inv = r.data.data;
        if (inv.status !== 'borrador') {
          setError('Solo se pueden editar facturas en estado Borrador. Las facturas registradas son documentos fiscales y no se pueden modificar; emita una Nota de Credito para corregir.');
          setEditLoading(false);
          return;
        }
        setForm({
          supplier_id: inv.supplier_id || '',
          document_type: inv.document_type || 'FC',
          invoice_number: inv.invoice_number || '',
          control_number: inv.control_number || '',
          emission_date: inv.emission_date ? inv.emission_date.split('T')[0] : today,
          reception_date: inv.reception_date ? inv.reception_date.split('T')[0] : today,
          fiscal_period: inv.fiscal_period || '',
          currency: inv.currency || 'VES',
          exchange_rate: inv.exchange_rate || '',
          exchange_rate_date: today,
          description: inv.description || '',
          expense_category_id: inv.expense_category_id || '',
          cost_center_id: inv.cost_center_id || '',
          taxable_amount: inv.taxable_amount || '',
          exempt_amount: inv.exempt_amount || '0',
          non_subject_amount: inv.non_subject_amount || '0',
          vat_rate: inv.vat_rate || '16',
          igtf_amount: inv.igtf_amount || '0',
          status: inv.status || 'borrador',
          related_invoice_id: inv.related_invoice_id || '',
          note_reason: inv.note_reason || '',
          affected_invoice_number: inv.affected_invoice_number || '',
        });
        setEditLoading(false);
      }).catch((err) => {
        setError(err.response?.data?.error?.message || 'Error al cargar factura');
        setEditLoading(false);
      });
    }
  }, []);

  // Load supplier's invoices when supplier changes and doc type is NC/ND
  useEffect(() => {
    if (form.supplier_id && isNCND) {
      api.get('/invoices', { params: { supplier_id: form.supplier_id, limit: 100 } })
        .then((r) => {
          const invs = (r.data.data || []).filter(
            (inv) => ['FC', 'FG', 'ND'].includes(inv.document_type) &&
                     !['anulada', 'borrador'].includes(inv.status)
          );
          setSupplierInvoices(invs);
        })
        .catch(() => setSupplierInvoices([]));
    } else {
      setSupplierInvoices([]);
    }
  }, [form.supplier_id, form.document_type]);

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

  const docTypeNames = { FC: 'Factura', FG: 'Factura de Gasto', NC: 'Nota de Credito', ND: 'Nota de Debito', DSF: 'Doc. Sin Factura' };
  const returnPath = isNC ? '/credit-notes' : '/invoices';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        exchange_rate: parseFloat(form.exchange_rate),
        taxable_amount: parseFloat(form.taxable_amount) || 0,
        exempt_amount: parseFloat(form.exempt_amount) || 0,
        non_subject_amount: parseFloat(form.non_subject_amount) || 0,
        vat_rate: parseFloat(form.vat_rate),
        igtf_amount: parseFloat(form.igtf_amount) || 0,
        expense_category_id: form.expense_category_id || null,
        cost_center_id: form.cost_center_id || null,
        related_invoice_id: form.related_invoice_id || null,
        note_reason: form.note_reason || null,
        affected_invoice_number: form.affected_invoice_number || null,
      };
      if (editId) {
        await api.put(`/invoices/${editId}`, payload);
      } else {
        await api.post('/invoices', payload);
      }
      localStorage.removeItem(INVOICE_DRAFT_KEY);
      navigate(returnPath);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error al registrar');
    }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  if (editLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</div>;

  const title = editId
    ? `Editar ${docTypeNames[form.document_type] || 'Documento'} (Borrador)`
    : `Registrar ${docTypeNames[form.document_type] || 'Documento'}`;

  return (
    <div>
      <div className="page-header">
        <h1>{title}</h1>
        <button className="btn" onClick={() => navigate(returnPath)}>Volver</button>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</div>}

      {error && editId ? null : <form onSubmit={handleSubmit}>
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
                <option value="ND">Nota de Debito</option>
                <option value="NC">Nota de Credito</option>
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
              <label>{isNCND ? 'Nro. Nota' : 'Nro. Factura'} *</label>
              <input value={form.invoice_number} onChange={set('invoice_number')} required />
            </div>
            <div className="form-group">
              <label>Nro. Control {form.document_type !== 'DSF' ? '*' : ''}</label>
              <input value={form.control_number} onChange={set('control_number')} placeholder="00-00000000" required={form.document_type !== 'DSF'} />
            </div>
            <div className="form-group">
              <label>Fecha Emision *</label>
              <input type="date" value={form.emission_date} onChange={set('emission_date')} required />
            </div>
            <div className="form-group">
              <label>Fecha Recepcion *</label>
              <input type="date" value={form.reception_date} onChange={set('reception_date')} required />
            </div>
          </div>

          {/* NC/ND specific fields */}
          {isNCND && (
            <div className="form-row" style={{ background: isNC ? '#eff6ff' : '#fef3c7', padding: '0.75rem', borderRadius: 'var(--radius)', marginTop: '0.5rem' }}>
              <div className="form-group">
                <label>Factura Afectada *</label>
                <select value={form.related_invoice_id} onChange={(e) => {
                  const inv = supplierInvoices.find((i) => i.id === e.target.value);
                  setForm({
                    ...form,
                    related_invoice_id: e.target.value,
                    affected_invoice_number: inv ? inv.invoice_number : form.affected_invoice_number,
                  });
                }} required>
                  <option value="">Seleccione factura...</option>
                  {supplierInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.document_type} {inv.invoice_number} - {fmtNum(inv.total_amount)} {inv.currency}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Nro. Factura Afectada</label>
                <input value={form.affected_invoice_number} onChange={set('affected_invoice_number')}
                  placeholder="Si no esta en el sistema" />
              </div>
              {isNC && (
                <div className="form-group">
                  <label>Razon de la NC *</label>
                  <select value={form.note_reason} onChange={set('note_reason')} required>
                    <option value="">Seleccione...</option>
                    <option value="devolucion">Devolucion</option>
                    <option value="ajuste_precio">Ajuste de precio</option>
                    <option value="descuento_pronto_pago">Descuento pronto pago</option>
                    <option value="regularizacion_anticipo">Regularizacion de anticipo</option>
                    <option value="error_facturacion">Error de facturacion</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="form-row" style={{ marginTop: isNCND ? '0.5rem' : 0 }}>
            <div className="form-group">
              <label>Periodo Fiscal</label>
              <input value={form.fiscal_period} onChange={set('fiscal_period')} placeholder="MM/YYYY" />
            </div>
            <div className="form-group">
              <label>Moneda *</label>
              <select value={form.currency} onChange={set('currency')}>
                <option value="VES">VES - Bolivar</option>
                <option value="USD">USD - Dolar</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tasa de Cambio *</label>
              <input type="number" step="0.000001" value={form.exchange_rate} onChange={set('exchange_rate')} required />
              <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
                {rate && (
                  <button type="button" className="btn btn-sm" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}
                    onClick={() => setForm({ ...form, exchange_rate: rate.rate })}>
                    BCV: {Number(rate.rate).toFixed(2)}
                  </button>
                )}
                {binanceRate && (
                  <button type="button" className="btn btn-sm" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#fef3c7', border: '1px solid #f59e0b' }}
                    onClick={() => setForm({ ...form, exchange_rate: binanceRate.rate })}>
                    Binance: {Number(binanceRate.rate).toFixed(2)}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Descripcion / Concepto *</label>
              <textarea value={form.description} onChange={set('description')} rows={2} required />
            </div>
            <div className="form-group">
              <label>Categoria de Gasto</label>
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
              <label>Alicuota IVA (%)</label>
              <select value={form.vat_rate} onChange={set('vat_rate')}>
                <option value="16">16%</option>
                <option value="8">8%</option>
                <option value="31">31%</option>
                <option value="0">0% (Exento)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Monto IVA (calculado)</label>
              <input type="text" value={fmtNum(calculated.vatAmount)} readOnly style={{ background: 'var(--gray-100)' }} />
            </div>
            <div className="form-group">
              <label>IGTF (si aplica)</label>
              <input type="number" step="0.01" value={form.igtf_amount} onChange={set('igtf_amount')} />
            </div>
          </div>

          <div style={{ background: 'var(--gray-50)', padding: '1rem', borderRadius: 'var(--radius)', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div><strong>Total ({form.currency}):</strong> {fmtNum(calculated.total)}</div>
              <div><strong>Total VES:</strong> Bs. {fmtNum(calculated.totalVes)}</div>
              <div><strong>Total USD:</strong> $ {fmtNum(calculated.totalUsd)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" className="btn btn-primary">
            {editId ? 'Guardar Cambios' : `Registrar ${docTypeNames[form.document_type] || 'Documento'}`}
          </button>
          <button type="button" className="btn" onClick={() => navigate(returnPath)}>Cancelar</button>
        </div>
      </form>}
    </div>
  );
}
