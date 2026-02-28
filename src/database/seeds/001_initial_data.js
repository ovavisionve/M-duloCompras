const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  // Skip if data already exists (idempotent for production)
  const existingUsers = await knex('users').where({ email: 'admin@empresa.com' }).first();
  if (existingUsers) {
    console.log('Seed data already exists, skipping...');
    return;
  }

  // ─── USERS ───
  const passwordHash = await bcrypt.hash('admin123', 12);
  const [adminUser] = await knex('users').insert([
    { email: 'admin@empresa.com', password_hash: passwordHash, full_name: 'Administrador', role: 'admin' },
  ]).returning('*');
  await knex('users').insert([
    { email: 'contador@empresa.com', password_hash: passwordHash, full_name: 'Contador Principal', role: 'contador' },
    { email: 'tesorero@empresa.com', password_hash: passwordHash, full_name: 'Tesorero', role: 'tesorero' },
    { email: 'operador@empresa.com', password_hash: passwordHash, full_name: 'Operador de Compras', role: 'operador' },
  ]);

  // ─── COMPANY CONFIG ───
  await knex('config').insert([
    { key: 'company_rif', value: 'J-12345678-9', description: 'RIF de la empresa' },
    { key: 'company_name', value: 'Mi Empresa de Viajes C.A.', description: 'Razón social' },
    { key: 'company_address', value: 'Caracas, Venezuela', description: 'Dirección fiscal' },
    { key: 'tax_unit_value', value: '9.00', description: 'Valor Unidad Tributaria (Bs.)' },
    { key: 'is_special_taxpayer', value: 'false', description: 'Es contribuyente especial' },
    { key: 'default_vat_rate', value: '16', description: 'Alícuota IVA por defecto (%)' },
    { key: 'igtf_rate', value: '3', description: 'Tasa IGTF (%)' },
    { key: 'withholding_counter_islr', value: '0', description: 'Contador correlativo retenciones ISLR' },
    { key: 'withholding_counter_iva', value: '0', description: 'Contador correlativo retenciones IVA' },
  ]);

  // ─── EXPENSE CATEGORIES ───
  const [catGDS, catBoletos, catSerTec, catAlquiler, catPapeleria] = await knex('expense_categories').insert([
    { name: 'Comisiones GDS', code: 'COM-GDS' },
    { name: 'Boletos Aéreos', code: 'BOL-AER' },
    { name: 'Servicios Tecnológicos', code: 'SER-TEC' },
    { name: 'Alquiler', code: 'ALQ' },
    { name: 'Papelería', code: 'PAP' },
    { name: 'Servicios Profesionales', code: 'SER-PRO' },
    { name: 'Publicidad y Marketing', code: 'PUB-MKT' },
    { name: 'Hosting y Dominios', code: 'HOS-DOM' },
    { name: 'Servicios Básicos', code: 'SER-BAS' },
    { name: 'Transporte y Fletes', code: 'TRA-FLE' },
    { name: 'Otros Gastos', code: 'OTR' },
  ]).returning('*');

  // ─── COST CENTERS ───
  const [ccOpe, ccAdm, ccVen, ccTec] = await knex('cost_centers').insert([
    { name: 'Operaciones', code: 'OPE' },
    { name: 'Administración', code: 'ADM' },
    { name: 'Ventas', code: 'VEN' },
    { name: 'Tecnología', code: 'TEC' },
  ]).returning('*');

  // ─── WITHHOLDING RULES ───
  await knex('withholding_rules').insert([
    { type: 'ISLR', concept_code: 'ISLR-SP-PN', concept_name: 'Servicios profesionales (persona natural)', rate: 2.00, subtract_ut: 0, applies_to: 'natural' },
    { type: 'ISLR', concept_code: 'ISLR-SP-PJ', concept_name: 'Servicios profesionales (persona jurídica)', rate: 2.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: 'ISLR-ALQ', concept_name: 'Alquileres de inmuebles', rate: 3.00, subtract_ut: 0, applies_to: 'ambos' },
    { type: 'ISLR', concept_code: 'ISLR-COM', concept_name: 'Comisiones mercantiles', rate: 3.00, subtract_ut: 0, applies_to: 'ambos' },
    { type: 'ISLR', concept_code: 'ISLR-PUB', concept_name: 'Publicidad y propaganda', rate: 1.00, subtract_ut: 0, applies_to: 'ambos' },
    { type: 'ISLR', concept_code: 'ISLR-TRA', concept_name: 'Transporte (fletes)', rate: 1.00, subtract_ut: 0, applies_to: 'ambos' },
    { type: 'IVA', concept_code: 'IVA-75', concept_name: 'Retención IVA 75%', rate: 75.00, applies_to: 'ambos' },
    { type: 'IVA', concept_code: 'IVA-100', concept_name: 'Retención IVA 100%', rate: 100.00, applies_to: 'ambos' },
  ]);

  // ─── BANK ACCOUNTS ───
  const [bankBanesco, bankProvincial] = await knex('bank_accounts').insert([
    { bank_name: 'Banesco', account_type: 'corriente', account_number: '01340000000000000001', currency: 'VES', initial_balance: 5000000, current_balance: 5000000 },
    { bank_name: 'Provincial', account_type: 'corriente', account_number: '01080000000000000001', currency: 'VES', initial_balance: 3000000, current_balance: 3000000 },
  ]).returning('*');

  // ─── EXCHANGE RATES (last 7 days) ───
  const today = new Date();
  const rates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    // Realistic BCV rate ~419-421 Bs/$
    const rate = 419.00 + (Math.random() * 2.5).toFixed(2) * 1;
    rates.push({ rate_date: dateStr, rate: parseFloat(rate.toFixed(6)), source: i === 0 ? 'manual' : 'bcv_api' });
  }
  await knex('exchange_rates').insert(rates);

  // Get today's rate for invoice calculations
  const todayRate = rates[rates.length - 1].rate;
  const todayStr = today.toISOString().split('T')[0];

  // ─── SUPPLIERS ───
  const [supAmadeus, supSabre, supInmobiliaria, supPapelera, supTecno] = await knex('suppliers').insert([
    {
      rif: 'J-40100000-1',
      business_name: 'Amadeus IT Group Venezuela C.A.',
      fiscal_address: 'Torre Amadeus, Av. Francisco de Miranda, Caracas',
      phone: '0212-5551234',
      email: 'facturacion@amadeus.com.ve',
      taxpayer_type: 'ordinario',
    },
    {
      rif: 'J-30200000-2',
      business_name: 'Sabre Travel Network de Venezuela C.A.',
      fiscal_address: 'Centro Empresarial Sabana Grande, Caracas',
      phone: '0212-5555678',
      email: 'ap@sabre.com.ve',
      taxpayer_type: 'ordinario',
    },
    {
      rif: 'J-29800000-3',
      business_name: 'Inmobiliaria Centro Plaza C.A.',
      fiscal_address: 'Av. Principal de Los Ruices, Caracas',
      phone: '0212-5559012',
      email: 'cobranzas@centroplaza.com.ve',
      taxpayer_type: 'especial',
      is_retention_agent: true,
    },
    {
      rif: 'J-00100000-4',
      business_name: 'Distribuidora de Papelería Nacional C.A.',
      fiscal_address: 'Zona Industrial La Yaguara, Caracas',
      phone: '0212-5553456',
      email: 'ventas@papelera.com.ve',
      taxpayer_type: 'ordinario',
    },
    {
      rif: 'V-18500000-5',
      business_name: 'Carlos Rodríguez (Consultor IT)',
      fiscal_address: 'Res. Los Pinos, Baruta, Miranda',
      phone: '0414-5557890',
      email: 'carlos.it@gmail.com',
      taxpayer_type: 'ordinario',
    },
  ]).returning('*');

  // ─── INVOICES ───
  // Helper to compute fiscal period
  const fiscalPeriod = `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  // Invoice 1: Amadeus - Comisiones GDS (VES)
  const inv1Taxable = 150000.00;
  const inv1Vat = inv1Taxable * 0.16;
  const inv1Total = inv1Taxable + inv1Vat;
  const [invoice1] = await knex('invoices').insert({
    supplier_id: supAmadeus.id,
    document_type: 'FC',
    invoice_number: 'FAC-2026-0001',
    control_number: '00-0001001',
    emission_date: todayStr,
    reception_date: todayStr,
    fiscal_period: fiscalPeriod,
    currency: 'VES',
    exchange_rate: todayRate,
    exchange_rate_date: todayStr,
    description: 'Comisiones GDS Amadeus - Enero 2026',
    expense_category_id: catGDS.id,
    cost_center_id: ccOpe.id,
    taxable_amount: inv1Taxable,
    exempt_amount: 0,
    non_subject_amount: 0,
    vat_rate: 16,
    vat_amount: inv1Vat,
    total_amount: inv1Total,
    total_ves: inv1Total,
    total_usd: parseFloat((inv1Total / todayRate).toFixed(2)),
    status: 'registrada',
  }).returning('*');

  // Items for invoice 1
  await knex('invoice_items').insert([
    { invoice_id: invoice1.id, description: 'Comisión segmentos aéreos', quantity: 500, unit_price: 200, subtotal: 100000, is_taxable: true },
    { invoice_id: invoice1.id, description: 'Comisión segmentos hotel', quantity: 100, unit_price: 500, subtotal: 50000, is_taxable: true },
  ]);

  // Invoice 2: Sabre - Licencia USD
  const inv2Taxable = 2500.00;
  const inv2Vat = inv2Taxable * 0.16;
  const inv2Total = inv2Taxable + inv2Vat;
  const inv2Igtf = parseFloat((inv2Total * 0.03).toFixed(2));
  const [invoice2] = await knex('invoices').insert({
    supplier_id: supSabre.id,
    document_type: 'FC',
    invoice_number: 'INV-2026-0045',
    control_number: '00-0002045',
    emission_date: todayStr,
    reception_date: todayStr,
    fiscal_period: fiscalPeriod,
    currency: 'USD',
    exchange_rate: todayRate,
    exchange_rate_date: todayStr,
    description: 'Licencia Sabre Red Workspace - Feb 2026',
    expense_category_id: catSerTec.id,
    cost_center_id: ccTec.id,
    taxable_amount: inv2Taxable,
    exempt_amount: 0,
    non_subject_amount: 0,
    vat_rate: 16,
    vat_amount: inv2Vat,
    total_amount: inv2Total + inv2Igtf,
    total_ves: parseFloat(((inv2Total + inv2Igtf) * todayRate).toFixed(2)),
    total_usd: inv2Total + inv2Igtf,
    igtf_amount: inv2Igtf,
    status: 'registrada',
  }).returning('*');

  await knex('invoice_items').insert([
    { invoice_id: invoice2.id, description: 'Licencia Sabre Red Workspace (5 puestos)', quantity: 5, unit_price: 500, subtotal: 2500, is_taxable: true },
  ]);

  // Invoice 3: Inmobiliaria - Alquiler (partially exempt)
  const inv3Taxable = 800000.00;
  const inv3Exempt = 200000.00;
  const inv3Vat = inv3Taxable * 0.16;
  const inv3Total = inv3Taxable + inv3Exempt + inv3Vat;
  const [invoice3] = await knex('invoices').insert({
    supplier_id: supInmobiliaria.id,
    document_type: 'FC',
    invoice_number: 'A-0000123',
    control_number: '00-0003123',
    emission_date: todayStr,
    reception_date: todayStr,
    fiscal_period: fiscalPeriod,
    currency: 'VES',
    exchange_rate: todayRate,
    exchange_rate_date: todayStr,
    description: 'Alquiler oficina principal - Feb 2026',
    expense_category_id: catAlquiler.id,
    cost_center_id: ccAdm.id,
    taxable_amount: inv3Taxable,
    exempt_amount: inv3Exempt,
    non_subject_amount: 0,
    vat_rate: 16,
    vat_amount: inv3Vat,
    total_amount: inv3Total,
    total_ves: inv3Total,
    total_usd: parseFloat((inv3Total / todayRate).toFixed(2)),
    status: 'registrada',
  }).returning('*');

  // Invoice 4: Papelera - Suministros (small, for quick pay test)
  const inv4Taxable = 5000.00;
  const inv4Vat = inv4Taxable * 0.16;
  const inv4Total = inv4Taxable + inv4Vat;
  const [invoice4] = await knex('invoices').insert({
    supplier_id: supPapelera.id,
    document_type: 'FC',
    invoice_number: 'B-0005678',
    control_number: '00-0045678',
    emission_date: todayStr,
    reception_date: todayStr,
    fiscal_period: fiscalPeriod,
    currency: 'VES',
    exchange_rate: todayRate,
    exchange_rate_date: todayStr,
    description: 'Resmas de papel y tóner',
    expense_category_id: catPapeleria.id,
    cost_center_id: ccAdm.id,
    taxable_amount: inv4Taxable,
    exempt_amount: 0,
    non_subject_amount: 0,
    vat_rate: 16,
    vat_amount: inv4Vat,
    total_amount: inv4Total,
    total_ves: inv4Total,
    total_usd: parseFloat((inv4Total / todayRate).toFixed(2)),
    status: 'registrada',
  }).returning('*');

  // Invoice 5: Consultor IT - Servicios profesionales (for ISLR withholding test)
  const inv5Taxable = 45000.00;
  const inv5Vat = inv5Taxable * 0.16;
  const inv5Total = inv5Taxable + inv5Vat;
  const [invoice5] = await knex('invoices').insert({
    supplier_id: supTecno.id,
    document_type: 'FC',
    invoice_number: 'CR-2026-008',
    control_number: '00-0008008',
    emission_date: todayStr,
    reception_date: todayStr,
    fiscal_period: fiscalPeriod,
    currency: 'VES',
    exchange_rate: todayRate,
    exchange_rate_date: todayStr,
    description: 'Consultoría desarrollo sistema interno - Feb 2026',
    expense_category_id: catSerTec.id,
    cost_center_id: ccTec.id,
    taxable_amount: inv5Taxable,
    exempt_amount: 0,
    non_subject_amount: 0,
    vat_rate: 16,
    vat_amount: inv5Vat,
    total_amount: inv5Total,
    total_ves: inv5Total,
    total_usd: parseFloat((inv5Total / todayRate).toFixed(2)),
    status: 'registrada',
  }).returning('*');

  // Invoice 6: Amadeus - Nota de Crédito
  const inv6Taxable = 10000.00;
  const inv6Vat = inv6Taxable * 0.16;
  const inv6Total = inv6Taxable + inv6Vat;
  await knex('invoices').insert({
    supplier_id: supAmadeus.id,
    document_type: 'NC',
    invoice_number: 'NC-2026-0001',
    control_number: '00-0001500',
    emission_date: todayStr,
    reception_date: todayStr,
    fiscal_period: fiscalPeriod,
    currency: 'VES',
    exchange_rate: todayRate,
    exchange_rate_date: todayStr,
    description: 'Nota de Crédito - Ajuste comisiones enero',
    expense_category_id: catGDS.id,
    cost_center_id: ccOpe.id,
    taxable_amount: inv6Taxable,
    exempt_amount: 0,
    non_subject_amount: 0,
    vat_rate: 16,
    vat_amount: inv6Vat,
    total_amount: inv6Total,
    total_ves: inv6Total,
    total_usd: parseFloat((inv6Total / todayRate).toFixed(2)),
    related_invoice_id: invoice1.id,
    status: 'registrada',
  });

  // ─── SAMPLE PAYMENT: Pay invoice 4 fully ───
  const [payment1] = await knex('payments').insert({
    payment_date: todayStr,
    payment_method: 'transferencia',
    sender_bank_id: bankBanesco.id,
    reference_number: 'TRF-20260228-001',
    currency: 'VES',
    amount: inv4Total,
    exchange_rate: todayRate,
    amount_other_currency: parseFloat((inv4Total / todayRate).toFixed(2)),
    exchange_difference: 0,
    observations: 'Pago suministros papelería',
    created_by: adminUser.id,
  }).returning('*');

  await knex('payment_invoices').insert({
    payment_id: payment1.id,
    invoice_id: invoice4.id,
    amount_applied: inv4Total,
  });

  // Mark invoice 4 as paid
  await knex('invoices').where({ id: invoice4.id }).update({ status: 'pagada' });

  // ─── SAMPLE WITHHOLDING: IVA 75% on invoice 5 ───
  const whIvaBase = inv5Vat; // withhold on VAT
  const whIvaAmount = parseFloat((whIvaBase * 0.75).toFixed(2));
  await knex('config').where({ key: 'withholding_counter_iva' }).update({ value: '1' });

  const [withholding1] = await knex('withholdings').insert({
    voucher_number: `${today.getFullYear()}-IVA-000001`,
    type: 'IVA',
    supplier_id: supTecno.id,
    withholding_date: todayStr,
    fiscal_period: fiscalPeriod,
    base_amount: whIvaBase,
    rate: 75,
    amount_ves: whIvaAmount,
    amount_usd: parseFloat((whIvaAmount / todayRate).toFixed(2)),
    exchange_rate: todayRate,
    created_by: adminUser.id,
  }).returning('*');

  await knex('withholding_invoices').insert({
    withholding_id: withholding1.id,
    invoice_id: invoice5.id,
    base_amount: whIvaBase,
    withheld_amount: whIvaAmount,
  });

  // Update invoice 5 to pago_parcial since withholding partially covers it
  await knex('invoices').where({ id: invoice5.id }).update({ status: 'pago_parcial' });
};
