const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  // Skip if data already exists (idempotent for production)
  const existingUsers = await knex('users').where({ email: 'admin@wefly.com.ve' }).first();
  if (existingUsers) {
    console.log('Seed data already exists, skipping...');
    return;
  }

  // ─── USERS ───
  const passwordHash = await bcrypt.hash('admin123', 12);
  const [adminUser] = await knex('users').insert([
    { email: 'admin@wefly.com.ve', password_hash: passwordHash, full_name: 'Administrador WEFLY', role: 'admin' },
  ]).returning('*');
  await knex('users').insert([
    { email: 'contador@wefly.com.ve', password_hash: passwordHash, full_name: 'Contador WEFLY', role: 'contador' },
    { email: 'tesorero@wefly.com.ve', password_hash: passwordHash, full_name: 'Tesorero WEFLY', role: 'tesorero' },
    { email: 'operador@wefly.com.ve', password_hash: passwordHash, full_name: 'Operador WEFLY', role: 'operador' },
  ]);

  // ─── COMPANY CONFIG: WEFLY2022 C.A. ───
  await knex('config').insert([
    { key: 'company_rif', value: 'J-503159952', description: 'RIF de la empresa' },
    { key: 'company_name', value: 'WEFLY2022 C.A.', description: 'Razón social' },
    { key: 'company_address', value: 'Av La Estancia con calle Ernesto Blohm edif torre D piso 1 of D-102 Urb Chuao Caracas (Chacao) Miranda zona postal 1060', description: 'Dirección fiscal' },
    { key: 'tax_unit_value', value: '9.00', description: 'Valor Unidad Tributaria (Bs.)' },
    { key: 'is_special_taxpayer', value: 'false', description: 'Es contribuyente especial (NO)' },
    { key: 'is_retention_agent_iva', value: 'false', description: 'Es agente de retención de IVA (NO)' },
    { key: 'default_vat_rate', value: '16', description: 'Alícuota IVA del fee (16%)' },
    { key: 'ticket_vat_rate', value: '8', description: 'Alícuota IVA del boleto KIU (8%)' },
    { key: 'igtf_rate', value: '3', description: 'Tasa IGTF (%)' },
    { key: 'withholding_counter_islr', value: '0', description: 'Contador correlativo retenciones ISLR' },
    { key: 'withholding_counter_iva', value: '0', description: 'Contador correlativo retenciones IVA' },
  ]);

  // ─── EXPENSE CATEGORIES ───
  // Categorías existentes del sistema + nuevas del cliente
  const categories = await knex('expense_categories').insert([
    { name: 'Comisiones GDS', code: 'COM-GDS', description: 'Comisiones KIU y sistemas GDS' },
    { name: 'Boletos Aéreos', code: 'BOL-AER', description: 'Compra de boletos aéreos' },
    { name: 'Servicios Tecnológicos', code: 'SER-TEC', description: 'Software, hosting, desarrollo' },
    { name: 'Alquiler', code: 'ALQ', description: 'Alquiler de oficina' },
    { name: 'Papelería', code: 'PAP', description: 'Papelería y suministros de oficina' },
    { name: 'Servicios Profesionales', code: 'SER-PRO', description: 'Consultorías, asesorías legales/contables' },
    { name: 'Publicidad y Marketing', code: 'PUB-MKT', description: 'Publicidad y propaganda' },
    { name: 'Hosting y Dominios', code: 'HOS-DOM', description: 'Hosting web y dominios' },
    { name: 'Servicios Básicos', code: 'SER-BAS', description: 'Electricidad, agua, etc.' },
    { name: 'Transporte y Fletes', code: 'TRA-FLE', description: 'Fletes y transporte' },
    { name: 'Otros Gastos', code: 'OTR', description: 'Gastos no clasificados' },
    // Categorías específicas de WEFLY
    { name: 'Servidores (Amazon AWS)', code: 'SRV-AWS', description: 'Servidores cloud Amazon' },
    { name: 'Google Workspace', code: 'GOO-WS', description: 'Google emails y workspace' },
    { name: 'Nómina', code: 'NOM', description: 'Sueldos y salarios' },
    { name: 'Telefonía (Digitel)', code: 'TEL-DIG', description: 'Línea telefónica Digitel' },
    { name: 'Internet (NetUno)', code: 'INT-NET', description: 'Servicio WiFi NetUno' },
    { name: 'Oficina', code: 'OFI', description: 'Gastos generales de oficina' },
    { name: 'Estacionamiento', code: 'EST', description: 'Tarjetas de estacionamiento' },
    { name: 'Licencias GDS', code: 'LIC-GDS', description: 'Licencias KIU, Duffel' },
  ]).returning('*');

  // ─── COST CENTERS ───
  const costCenters = await knex('cost_centers').insert([
    { name: 'Operaciones', code: 'OPE', description: 'Operaciones de vuelo y reservas' },
    { name: 'Administración', code: 'ADM', description: 'Administración general' },
    { name: 'Ventas', code: 'VEN', description: 'Ventas y comercialización' },
    { name: 'Tecnología', code: 'TEC', description: 'Departamento de tecnología' },
  ]).returning('*');

  // ─── WITHHOLDING RULES (Decreto 1808, Art. 9 — Códigos oficiales SENIAT) ───
  await knex('withholding_rules').insert([
    // ── ISLR - Persona Natural Residente (PNR) ──
    { type: 'ISLR', concept_code: '002', concept_name: 'Honorarios profesionales no mercantiles (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '012', concept_name: 'Honorarios profesionales pagados por clínicas, hospitales y similares (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '018', concept_name: 'Comisiones distintas a remuneraciones salariales (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '025', concept_name: 'Intereses pagados por PJ o comunidades (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '053', concept_name: 'Contratistas y subcontratistas - ejecución de obras o servicios (PNR)', rate: 1.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '057', concept_name: 'Arrendamiento de bienes inmuebles (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '061', concept_name: 'Arrendamiento de bienes muebles (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '071', concept_name: 'Fletes nacionales (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '083', concept_name: 'Publicidad y propaganda (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },

    // ── ISLR - Persona Jurídica Domiciliada (PJD) ──
    { type: 'ISLR', concept_code: '004', concept_name: 'Honorarios profesionales no mercantiles (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '020', concept_name: 'Comisiones distintas a remuneraciones salariales (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '027', concept_name: 'Intereses pagados por PJ o comunidades (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '055', concept_name: 'Contratistas y subcontratistas - ejecución de obras o servicios (PJD)', rate: 2.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '059', concept_name: 'Arrendamiento de bienes inmuebles (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '063', concept_name: 'Arrendamiento de bienes muebles (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '072', concept_name: 'Fletes nacionales (PJD)', rate: 1.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '084', concept_name: 'Publicidad y propaganda (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },

    // ── IVA (Providencia SNAT/2025/000054, Art. 16) ──
    // WEFLY no es agente de retención de IVA aún, pero se dejan configuradas las reglas
    { type: 'IVA', concept_code: 'IVA-75', concept_name: 'Retención IVA 75% (contribuyente ordinario)', rate: 75.00, applies_to: 'ambos' },
    { type: 'IVA', concept_code: 'IVA-100', concept_name: 'Retención IVA 100% (sin RIF / factura incumple requisitos)', rate: 100.00, applies_to: 'ambos' },
  ]);

  // ─── BANK ACCOUNTS: BFC (VES), Chase (USD), PNC (USD) ───
  await knex('bank_accounts').insert([
    { bank_name: 'BFC Banco Fondo Común', account_type: 'corriente', account_number: '01510000000000000001', currency: 'VES', initial_balance: 0, current_balance: 0 },
    { bank_name: 'Chase Bank', account_type: 'corriente', account_number: 'CHASE-USD-001', currency: 'USD', initial_balance: 0, current_balance: 0 },
    { bank_name: 'PNC Bank', account_type: 'corriente', account_number: 'PNC-USD-001', currency: 'USD', initial_balance: 0, current_balance: 0 },
  ]);

  // ─── EXCHANGE RATES (last 7 days - realistic BCV) ───
  const today = new Date();
  const rates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const rate = 419.00 + (Math.random() * 2.5).toFixed(2) * 1;
    rates.push({ rate_date: dateStr, rate: parseFloat(rate.toFixed(6)), source: i === 0 ? 'manual' : 'bcv_api' });
  }
  await knex('exchange_rates').insert(rates);

  // ─── NO SAMPLE INVOICES, PAYMENTS, SUPPLIERS ───
  // Client will configure their own data manually
  // Suppliers, invoices, and payments are left empty for fresh start

  console.log('WEFLY2022 C.A. seed data created successfully.');
  console.log('Users: admin@wefly.com.ve, contador@wefly.com.ve, tesorero@wefly.com.ve, operador@wefly.com.ve');
  console.log('Password: admin123 (change immediately)');
};
