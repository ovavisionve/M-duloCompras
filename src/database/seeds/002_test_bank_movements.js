/**
 * Test seed: Creates bank accounts, bank movements, and treasury flows
 * Simulates a real scenario for WEFLY2022:
 *   - BFC (VES) receives bolivar payments for tickets
 *   - Chase (USD) receives USD from currency purchases
 *   - Treasury tracks the FX operations and gains/losses
 *
 * Run: npx knex seed:run --specific=002_test_bank_movements.js --knexfile src/database/knexfile.js
 */
exports.seed = async function (knex) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
  const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString().split('T')[0];

  // Get admin user
  const admin = await knex('users').where({ email: 'admin@wefly.com.ve' }).first();
  if (!admin) {
    console.log('SKIP: No admin user found');
    return;
  }

  // ─── 1. Ensure bank accounts exist ───
  const bfcExists = await knex('bank_accounts').where({ account_number: '0151-0001-00-0000001' }).first();
  let bfc;
  if (!bfcExists) {
    [bfc] = await knex('bank_accounts').insert({
      bank_name: 'BFC Banco Fondo Comun',
      account_type: 'corriente',
      account_number: '0151-0001-00-0000001',
      currency: 'VES',
      initial_balance: 0,
      current_balance: 0,
    }).returning('*');
  } else {
    bfc = bfcExists;
  }

  const chaseExists = await knex('bank_accounts').where({ account_number: 'CHASE-USD-001' }).first();
  let chase;
  if (!chaseExists) {
    [chase] = await knex('bank_accounts').insert({
      bank_name: 'Chase Bank',
      account_type: 'corriente',
      account_number: 'CHASE-USD-001',
      currency: 'USD',
      initial_balance: 0,
      current_balance: 0,
    }).returning('*');
  } else {
    chase = chaseExists;
  }

  const pncExists = await knex('bank_accounts').where({ account_number: 'PNC-USD-001' }).first();
  let pnc;
  if (!pncExists) {
    [pnc] = await knex('bank_accounts').insert({
      bank_name: 'PNC Bank',
      account_type: 'corriente',
      account_number: 'PNC-USD-001',
      currency: 'USD',
      initial_balance: 0,
      current_balance: 0,
    }).returning('*');
  } else {
    pnc = pncExists;
  }

  console.log(`Bank accounts: BFC=${bfc.id}, Chase=${chase.id}, PNC=${pnc.id}`);

  // ─── 2. Simulate bank movements (visible in Banking) ───
  const BCV_RATE = 431.01;
  const BINANCE_RATE = 629.00;

  const bankMovements = [
    // Ticket payments received in BFC (VES)
    { bank_account_id: bfc.id, movement_date: fourDaysAgo, reference: 'PM-20260302-001', description: 'Pago boleto CCS-MIA - Cliente Rodriguez', debit: 0, credit: 314500, balance: 314500, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: threeDaysAgo, reference: 'PM-20260303-001', description: 'Pago boleto CCS-BOG - Cliente Martinez', debit: 0, credit: 188700, balance: 503200, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: twoDaysAgo, reference: 'PM-20260304-001', description: 'Pago boleto CCS-PTY - Cliente Lopez', debit: 0, credit: 440300, balance: 943500, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: twoDaysAgo, reference: 'TR-20260304-002', description: 'Pago 2 boletos CCS-SCL - Grupo Empresarial', debit: 0, credit: 881000, balance: 1824500, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: yesterday, reference: 'PM-20260305-001', description: 'Pago boleto CCS-LIM - Cliente Fernandez', debit: 0, credit: 251600, balance: 2076100, reconciliation_status: 'pendiente' },
    // VES out for currency purchase
    { bank_account_id: bfc.id, movement_date: yesterday, reference: 'COMP-USD-001', description: 'Compra USD - Transferencia a cambista', debit: 500000, credit: 0, balance: 1576100, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: today, reference: 'PM-20260306-001', description: 'Pago boleto CCS-MDE - Cliente Gomez', debit: 0, credit: 125800, balance: 1701900, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: today, reference: 'COMP-USD-002', description: 'Compra USD - Pago movil cambista', debit: 300000, credit: 0, balance: 1401900, reconciliation_status: 'pendiente' },

    // USD received in Chase
    { bank_account_id: chase.id, movement_date: yesterday, reference: 'ZELLE-001', description: 'Zelle - USD from cambista (compra 500K VES)', debit: 0, credit: 794.91, balance: 794.91, reconciliation_status: 'pendiente' },
    { bank_account_id: chase.id, movement_date: today, reference: 'ZELLE-002', description: 'Zelle - USD from cambista (compra 300K VES)', debit: 0, credit: 476.95, balance: 1271.86, reconciliation_status: 'pendiente' },

    // Direct USD payment to airline (egreso in Chase)
    { bank_account_id: chase.id, movement_date: twoDaysAgo, reference: 'WIRE-KIU-001', description: 'Pago aerolinea KIU - Liquidacion semanal', debit: 2500, credit: 0, balance: -2500, reconciliation_status: 'pendiente' },
  ];

  for (const mov of bankMovements) {
    const exists = await knex('bank_movements').where({ reference: mov.reference, bank_account_id: mov.bank_account_id }).first();
    if (!exists) {
      await knex('bank_movements').insert(mov);
    }
  }

  // Update bank balances
  await knex('bank_accounts').where({ id: bfc.id }).update({ current_balance: 1401900 });
  await knex('bank_accounts').where({ id: chase.id }).update({ current_balance: 1271.86 - 2500 });

  console.log(`Bank movements: ${bankMovements.length} inserted`);

  // ─── 3. Treasury cash flows (Posicion Cambiaria - visible in hidden Treasury) ───
  const cashFlows = [
    // Ticket income at Binance rate (these are the VES received for selling tickets)
    { flow_date: fourDaysAgo, flow_type: 'ingreso', amount_ves: 314500, bcv_rate: BCV_RATE, usd_equivalent: 730.15, description: 'Boleto CCS-MIA - Rodriguez (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: admin.id, bank_account_id: bfc.id },
    { flow_date: threeDaysAgo, flow_type: 'ingreso', amount_ves: 188700, bcv_rate: BCV_RATE, usd_equivalent: 437.82, description: 'Boleto CCS-BOG - Martinez (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: admin.id, bank_account_id: bfc.id },
    { flow_date: twoDaysAgo, flow_type: 'ingreso', amount_ves: 440300, bcv_rate: BCV_RATE, usd_equivalent: 1021.56, description: 'Boleto CCS-PTY - Lopez (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: admin.id, bank_account_id: bfc.id },
    { flow_date: twoDaysAgo, flow_type: 'ingreso', amount_ves: 881000, bcv_rate: BCV_RATE, usd_equivalent: 2044.11, description: '2 Boletos CCS-SCL - Grupo Empresarial (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: admin.id, bank_account_id: bfc.id },
    { flow_date: yesterday, flow_type: 'ingreso', amount_ves: 251600, bcv_rate: BCV_RATE, usd_equivalent: 583.66, description: 'Boleto CCS-LIM - Fernandez (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: admin.id, bank_account_id: bfc.id },
    { flow_date: today, flow_type: 'ingreso', amount_ves: 125800, bcv_rate: BCV_RATE, usd_equivalent: 291.85, description: 'Boleto CCS-MDE - Gomez (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: admin.id, bank_account_id: bfc.id },
  ];

  for (const cf of cashFlows) {
    const exists = await knex('treasury_cash_flows')
      .where({ description: cf.description, flow_date: cf.flow_date })
      .first();
    if (!exists) {
      await knex('treasury_cash_flows').insert(cf);
    }
  }

  console.log(`Treasury cash flows: ${cashFlows.length} inserted`);

  // ─── 4. Treasury operations (Compra de Divisas) ───
  // Ensure internal accounts exist
  const accountCodes = ['PREST_ACC', 'BANCO_VES', 'BANCO_USD', 'CAJA_USD', 'GAN_CAMB', 'PERD_CAMB'];
  const intAccounts = await knex('internal_accounts').whereIn('code', accountCodes);
  if (intAccounts.length < 6) {
    const SEED = [
      { code: 'BANCO_VES', name: 'Banco VES (Salida)', type: 'activo', currency: 'VES' },
      { code: 'BANCO_USD', name: 'Banco USD (Entrada)', type: 'activo', currency: 'USD' },
      { code: 'CAJA_USD', name: 'Caja USD', type: 'activo', currency: 'USD' },
      { code: 'PREST_ACC', name: 'Prestamos Accionistas', type: 'pasivo', currency: 'VES' },
      { code: 'GAN_CAMB', name: 'Ganancia Cambiaria', type: 'ingreso', currency: 'VES' },
      { code: 'PERD_CAMB', name: 'Perdida Cambiaria', type: 'gasto', currency: 'VES' },
    ];
    const existingCodes = intAccounts.map((a) => a.code);
    const missing = SEED.filter((a) => !existingCodes.includes(a.code));
    if (missing.length > 0) await knex('internal_accounts').insert(missing);
  }
  const accs = await knex('internal_accounts').whereIn('code', accountCodes);
  const getAcc = (code) => accs.find((a) => a.code === code);

  const operations = [
    // Purchase 1: 500K VES at 629 = 794.91 USD (loss vs BCV at 431)
    {
      operation_date: yesterday,
      amount_ves: 500000, amount_usd: 794.91,
      bcv_rate: BCV_RATE, purchase_rate: BINANCE_RATE,
      purchase_type: 'pago_movil', destination_type: 'banco_usd',
      supplier_name: 'Cambista Carlos',
      diff_usd: -365.70, // 794.91 - 1160.60
      exchange_difference: -157616.70,
      status: 'completada', created_by: admin.id, description: 'Compra USD para operaciones',
    },
    // Purchase 2: 300K VES at 629 = 476.95 USD (loss vs BCV)
    {
      operation_date: today,
      amount_ves: 300000, amount_usd: 476.95,
      bcv_rate: BCV_RATE, purchase_rate: BINANCE_RATE,
      purchase_type: 'pago_movil', destination_type: 'banco_usd',
      supplier_name: 'Cambista Carlos',
      diff_usd: -219.42, // 476.95 - 696.36
      exchange_difference: -94574.42,
      status: 'completada', created_by: admin.id, description: 'Compra USD para pago aerolinea',
    },
  ];

  for (const op of operations) {
    const exists = await knex('treasury_operations')
      .where({ operation_date: op.operation_date, amount_ves: op.amount_ves })
      .first();
    if (exists) continue;

    const [inserted] = await knex('treasury_operations').insert(op).returning('*');

    // Create ledger entries
    const ledger = [
      { operation_id: inserted.id, account_id: getAcc('PREST_ACC').id, movement_type: 'debito', amount: op.amount_ves, currency: 'VES', description: 'Salida VES - Compra USD', movement_date: op.operation_date },
      { operation_id: inserted.id, account_id: getAcc('BANCO_VES').id, movement_type: 'credito', amount: op.amount_ves, currency: 'VES', description: 'Salida banco VES', movement_date: op.operation_date },
      { operation_id: inserted.id, account_id: getAcc('BANCO_USD').id, movement_type: 'debito', amount: op.amount_usd, currency: 'USD', description: `Ingreso ${op.amount_usd} USD (tasa ${BINANCE_RATE})`, movement_date: op.operation_date },
      { operation_id: inserted.id, account_id: getAcc('PREST_ACC').id, movement_type: 'credito', amount: op.amount_ves, currency: 'VES', description: 'Liquidacion prestamo', movement_date: op.operation_date },
      { operation_id: inserted.id, account_id: getAcc('PERD_CAMB').id, movement_type: 'debito', amount: Math.abs(op.exchange_difference), currency: 'VES', description: 'Perdida cambiaria', movement_date: op.operation_date },
    ];
    await knex('treasury_ledger').insert(ledger);

    // Create corresponding cash flow (egreso for VES leaving)
    await knex('treasury_cash_flows').insert({
      flow_date: op.operation_date,
      flow_type: 'egreso',
      amount_ves: op.amount_ves,
      bcv_rate: BCV_RATE,
      usd_equivalent: op.amount_usd,
      description: `Compra USD: ${op.amount_ves} VES a tasa ${BINANCE_RATE}`,
      reference_type: 'treasury_operation',
      reference_id: inserted.id,
      status: 'activo',
      created_by: admin.id,
      bank_account_id: bfc.id,
    });
  }

  console.log(`Treasury operations: ${operations.length} inserted with ledger entries`);

  // ─── 5. Exchange rates for the period ───
  const rates = [
    { rate_date: fourDaysAgo, rate: 430.50, source: 'bcv_api' },
    { rate_date: threeDaysAgo, rate: 430.75, source: 'bcv_api' },
    { rate_date: twoDaysAgo, rate: 431.01, source: 'bcv_api' },
    { rate_date: yesterday, rate: 431.01, source: 'bcv_api' },
    { rate_date: today, rate: 431.01, source: 'bcv_api' },
  ];

  for (const rate of rates) {
    const exists = await knex('exchange_rates').where({ rate_date: rate.rate_date }).first();
    if (!exists) {
      await knex('exchange_rates').insert(rate);
    }
  }

  console.log('Test seed completed! Data visible in:');
  console.log('  - Banking > BFC account: ticket payments + currency purchase debits');
  console.log('  - Banking > Chase account: USD zelle receipts + airline payment');
  console.log('  - Treasury > Dashboard: KPIs and charts');
  console.log('  - Treasury > Compra de Divisas: 2 USD purchase operations');
  console.log('  - Treasury > Posicion Cambiaria: 6 ticket income flows + 2 egress flows');
};
