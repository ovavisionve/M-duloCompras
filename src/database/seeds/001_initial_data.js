const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  // Clean tables in order
  await knex('audit_logs').del();
  await knex('webhook_subscriptions').del();
  await knex('payment_invoices').del();
  await knex('payments').del();
  await knex('withholding_invoices').del();
  await knex('withholdings').del();
  await knex('withholding_rules').del();
  await knex('invoice_items').del();
  await knex('invoices').del();
  await knex('suppliers').del();
  await knex('exchange_rates').del();
  await knex('cost_centers').del();
  await knex('expense_categories').del();
  await knex('config').del();
  await knex('api_keys').del();
  await knex('users').del();
  await knex('bank_accounts').del();

  // Admin user
  const passwordHash = await bcrypt.hash('admin123', 12);
  await knex('users').insert([
    { email: 'admin@empresa.com', password_hash: passwordHash, full_name: 'Administrador', role: 'admin' },
    { email: 'contador@empresa.com', password_hash: passwordHash, full_name: 'Contador Principal', role: 'contador' },
    { email: 'tesorero@empresa.com', password_hash: passwordHash, full_name: 'Tesorero', role: 'tesorero' },
    { email: 'operador@empresa.com', password_hash: passwordHash, full_name: 'Operador de Compras', role: 'operador' },
  ]);

  // Company config
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

  // Expense categories
  await knex('expense_categories').insert([
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
  ]);

  // Cost centers
  await knex('cost_centers').insert([
    { name: 'Operaciones', code: 'OPE' },
    { name: 'Administración', code: 'ADM' },
    { name: 'Ventas', code: 'VEN' },
    { name: 'Tecnología', code: 'TEC' },
  ]);

  // Withholding rules (ISLR)
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

  // Venezuelan banks
  await knex('bank_accounts').insert([
    { bank_name: 'Banesco', account_type: 'corriente', account_number: '01340000000000000001', currency: 'VES', initial_balance: 0 },
    { bank_name: 'Provincial', account_type: 'corriente', account_number: '01080000000000000001', currency: 'VES', initial_balance: 0 },
  ]);
};
