#!/usr/bin/env node
/**
 * Script de prueba para el Libro de Compras
 *
 * Prueba:
 *  1. Login
 *  2. Crear proveedores de prueba
 *  3. Registrar facturas variadas (FC, FG, ND, NC)
 *  4. Consultar libro de compras del período
 *  5. Validar integridad del libro
 *  6. Exportar PDF, Excel, y TXT SENIAT
 *  7. Cerrar período
 *
 * Uso:
 *   node scripts/test-purchase-book.js
 *
 * Requiere: servidor corriendo en localhost:7000
 */

const API = process.env.API_URL || 'http://localhost:7000/api/v1';

// ── Helpers ──────────────────────────────────────────────────

async function request(method, path, body, token) {
  const url = `${API}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const contentType = res.headers.get('content-type') || '';

  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = { _raw: true, status: res.status, type: contentType, size: res.headers.get('content-length') };
  }

  return { status: res.status, data };
}

function assert(condition, msg, detail) {
  if (!condition) {
    console.error(`  FALLO: ${msg}`);
    if (detail) console.error(`         ${JSON.stringify(detail)}`);
    process.exit(1);
  }
  console.log(`  OK: ${msg}`);
}

const now = new Date();
const period = `${String(now.getUTCMonth() + 1).padStart(2, '0')}/${now.getUTCFullYear()}`;
const today = now.toISOString().slice(0, 10);
const ts = Date.now();

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log('=== PRUEBA LIBRO DE COMPRAS ===');
  console.log(`Periodo: ${period}  |  Fecha: ${today}\n`);

  // ── 1. Login ──
  console.log('1. Login como admin...');
  const loginRes = await request('POST', '/auth/login', {
    email: 'admin@empresa.com',
    password: 'admin123',
  });
  assert(loginRes.status === 200, 'Login exitoso', loginRes.data);
  const token = loginRes.data.data.token;

  // ── 2. Verificar/crear config ──
  console.log('\n2. Verificando configuracion...');

  // Tasa de cambio para hoy
  const rateRes = await request('GET', '/exchange-rates/today', null, token);
  let exchangeRate;
  if (!rateRes.data?.data?.rate) {
    console.log('   Registrando tasa de cambio manual...');
    const manualRate = await request('POST', '/exchange-rates/manual', {
      rate: 51.87,
      source: 'manual',
    }, token);
    assert(manualRate.status === 201 || manualRate.status === 200, 'Tasa registrada', manualRate.data);
    exchangeRate = 51.87;
  } else {
    exchangeRate = parseFloat(rateRes.data.data.rate);
    console.log(`   Tasa existente: ${exchangeRate}`);
  }

  // Categorias de gasto
  const catRes = await request('GET', '/config/expense-categories', null, token);
  assert(catRes.status === 200, `${catRes.data.data.length} categorias encontradas`);
  const categories = catRes.data.data;

  // Centros de costo
  const ccRes = await request('GET', '/config/cost-centers', null, token);
  assert(ccRes.status === 200, `${ccRes.data.data.length} centros de costo encontrados`);
  const costCenters = ccRes.data.data;

  // ── 3. Crear proveedores de prueba ──
  console.log('\n3. Creando proveedores de prueba...');

  const testSuppliers = [
    { rif: 'J-99990001-0', business_name: 'Test Proveedor Uno S.A.', taxpayer_type: 'ordinario' },
    { rif: 'J-99990002-0', business_name: 'Test Proveedor Dos C.A.', taxpayer_type: 'especial' },
    { rif: 'V-12345001-0', business_name: 'Test Persona Natural', taxpayer_type: 'ordinario' },
  ];

  const supplierIds = [];
  for (const sup of testSuppliers) {
    const listRes = await request('GET', `/suppliers?search=${encodeURIComponent(sup.rif)}&limit=5`, null, token);
    const existing = listRes.data?.data?.find((s) => s.rif === sup.rif);
    if (existing) {
      supplierIds.push(existing.id);
      console.log(`   Ya existe: ${sup.business_name} (${sup.rif})`);
    } else {
      const createRes = await request('POST', '/suppliers', sup, token);
      assert(createRes.status === 201, `Proveedor creado: ${sup.business_name}`, createRes.data);
      supplierIds.push(createRes.data.data.id);
    }
  }

  const catId = categories[0]?.id;
  const ccId = costCenters[0]?.id;
  assert(catId, 'Categoria disponible');
  assert(ccId, 'Centro de costo disponible');

  // ── 4. Registrar facturas variadas ──
  console.log('\n4. Registrando facturas de prueba...');

  // Campos base comunes
  const base = {
    emission_date: today,
    reception_date: today,
    exchange_rate: exchangeRate,
    fiscal_period: period,
    expense_category_id: catId,
    cost_center_id: ccId,
    status: 'registrada',
    non_subject_amount: 0,
    igtf_amount: 0,
  };

  // FC - Factura Compra gravada en USD
  const fcRes = await request('POST', '/invoices', {
    ...base,
    supplier_id: supplierIds[0],
    document_type: 'FC',
    invoice_number: `TEST-FC-${ts}`,
    control_number: `00-${String(ts).slice(-8)}`,
    currency: 'USD',
    taxable_amount: 1000.00,
    exempt_amount: 0,
    vat_rate: 16,
    description: 'Factura de compra de prueba - gravada USD',
  }, token);
  assert(fcRes.status === 201, `FC creada: ${fcRes.data?.data?.invoice_number || 'error'}`, fcRes.status !== 201 ? fcRes.data : undefined);
  const fcId = fcRes.data.data.id;

  // FG - Factura Gasto mixta en VES
  const fgRes = await request('POST', '/invoices', {
    ...base,
    supplier_id: supplierIds[1],
    document_type: 'FG',
    invoice_number: `TEST-FG-${ts}`,
    control_number: `00-${String(ts + 1).slice(-8)}`,
    currency: 'VES',
    taxable_amount: 500.00,
    exempt_amount: 200.00,
    vat_rate: 16,
    description: 'Factura de gasto con monto exento',
  }, token);
  assert(fgRes.status === 201, `FG creada: ${fgRes.data?.data?.invoice_number || 'error'}`, fgRes.status !== 201 ? fgRes.data : undefined);

  // ND - Nota de Debito (requiere related_invoice_id)
  const ndRes = await request('POST', '/invoices', {
    ...base,
    supplier_id: supplierIds[0],
    document_type: 'ND',
    invoice_number: `TEST-ND-${ts}`,
    control_number: `00-${String(ts + 2).slice(-8)}`,
    currency: 'USD',
    taxable_amount: 50.00,
    exempt_amount: 0,
    vat_rate: 16,
    description: 'Nota de debito de prueba',
    related_invoice_id: fcId,
  }, token);
  assert(ndRes.status === 201, `ND creada: ${ndRes.data?.data?.invoice_number || 'error'}`, ndRes.status !== 201 ? ndRes.data : undefined);

  // NC - Nota de Credito (requiere related_invoice_id)
  const ncRes = await request('POST', '/invoices', {
    ...base,
    supplier_id: supplierIds[0],
    document_type: 'NC',
    invoice_number: `TEST-NC-${ts}`,
    control_number: `00-${String(ts + 3).slice(-8)}`,
    currency: 'USD',
    taxable_amount: 100.00,
    exempt_amount: 0,
    vat_rate: 16,
    description: 'Nota de credito de prueba',
    related_invoice_id: fcId,
  }, token);
  assert(ncRes.status === 201, `NC creada: ${ncRes.data?.data?.invoice_number || 'error'}`, ncRes.status !== 201 ? ncRes.data : undefined);

  const invoiceIds = [fcRes.data.data.id, fgRes.data.data.id, ndRes.data.data.id, ncRes.data.data.id];
  console.log(`   Total facturas creadas: ${invoiceIds.length}`);

  // ── 5. Consultar libro de compras ──
  console.log('\n5. Consultando Libro de Compras...');
  const bookRes = await request('GET', `/purchase-book?period=${period}`, null, token);
  assert(bookRes.status === 200, 'Libro generado exitosamente', bookRes.data);

  const book = bookRes.data.data;
  console.log(`\n   === RESUMEN LIBRO DE COMPRAS - ${period} ===`);
  console.log(`   Entradas:        ${book.entry_count}`);
  console.log(`   Base Imponible:  ${book.totals.total_taxable.toFixed(2)}`);
  console.log(`   Exento:          ${book.totals.total_exempt.toFixed(2)}`);
  console.log(`   IVA:             ${book.totals.total_vat.toFixed(2)}`);
  console.log(`   IVA Retenido:    ${book.totals.total_iva_withheld.toFixed(2)}`);
  console.log(`   Total General:   ${book.totals.grand_total.toFixed(2)}`);

  assert(book.entry_count > 0, `Libro tiene ${book.entry_count} entradas`);
  assert(book.totals.total_taxable > 0, 'Base imponible > 0');
  assert(book.totals.total_vat > 0, 'IVA total > 0');

  // Verificar que las notas de credito restan
  const ncEntry = book.entries.find((e) => e.document_type === 'NC');
  if (ncEntry) {
    assert(ncEntry.taxable_purchases < 0, `NC tiene base imponible negativa: ${ncEntry.taxable_purchases}`);
    assert(ncEntry.vat_amount < 0, `NC tiene IVA negativo: ${ncEntry.vat_amount}`);
  }

  // Imprimir tabla de entradas
  console.log('\n   No  | Fecha       | RIF             | Proveedor                      | Tipo | Base Imp.  | Exento    | IVA');
  console.log('   ' + '-'.repeat(120));
  for (const e of book.entries) {
    console.log(
      `   ${String(e.operation_number).padStart(3)} | ${(e.emission_date || '').padEnd(11)} | ${(e.supplier_rif || '').padEnd(15)} | ${(e.supplier_name || '').substring(0, 30).padEnd(30)} | ${e.document_type.padEnd(4)} | ${String(e.taxable_purchases?.toFixed(2)).padStart(10)} | ${String(e.exempt_purchases?.toFixed(2)).padStart(9)} | ${String(e.vat_amount?.toFixed(2)).padStart(9)}`
    );
  }

  // ── 6. Validar libro ──
  console.log('\n6. Validando integridad del libro...');
  const valRes = await request('GET', `/purchase-book/validate?period=${period}`, null, token);
  assert(valRes.status === 200, 'Validacion ejecutada');

  const validation = valRes.data.data;
  console.log(`   Valido: ${validation.is_valid ? 'SI' : 'NO'}`);
  if (validation.issues.length > 0) {
    for (const issue of validation.issues) {
      console.log(`   [${issue.type.toUpperCase()}] ${issue.message}`);
    }
  } else {
    console.log('   Sin observaciones');
  }

  // ── 7. Probar exportaciones ──
  console.log('\n7. Probando exportaciones...');

  const pdfRes = await request('GET', `/purchase-book/pdf?period=${period}`, null, token);
  assert(pdfRes.status === 200, `PDF generado (${pdfRes.data.type || 'application/pdf'})`);

  const excelRes = await request('GET', `/purchase-book/excel?period=${period}`, null, token);
  assert(excelRes.status === 200, `Excel generado (${excelRes.data.type || 'xlsx'})`);

  const seniatRes = await request('GET', `/purchase-book/seniat?period=${period}`, null, token);
  assert(seniatRes.status === 200, `SENIAT TXT generado (${seniatRes.data.type || 'text/plain'})`);

  // ── 8. Cerrar periodo ──
  console.log('\n8. Cerrando periodo fiscal...');
  const closeRes = await request('POST', `/purchase-book/close?period=${period}`, null, token);
  if (closeRes.status === 400 && closeRes.data?.error?.code === 'PERIOD_ALREADY_CLOSED') {
    console.log('   Periodo ya estaba cerrado (OK - probablemente corriste el script antes)');
  } else {
    assert(closeRes.status === 200, 'Periodo cerrado exitosamente', closeRes.data);
    console.log(`   Estado: ${closeRes.data.data.status}`);
    console.log(`   Total registrado: ${closeRes.data.data.grand_total}`);
  }

  // Intentar cerrar de nuevo (debe fallar)
  console.log('\n   Intentando cerrar de nuevo (debe fallar)...');
  const closeAgain = await request('POST', `/purchase-book/close?period=${period}`, null, token);
  assert(closeAgain.status === 400, 'Re-cierre rechazado correctamente');
  console.log(`   Mensaje: ${closeAgain.data.error?.message}`);

  // ── Resumen final ──
  console.log('\n' + '='.repeat(50));
  console.log('TODAS LAS PRUEBAS PASARON EXITOSAMENTE');
  console.log('='.repeat(50));
  console.log(`\nFacturas creadas: ${invoiceIds.length}`);
  console.log(`Entradas en libro: ${book.entry_count}`);
  console.log(`Periodo probado: ${period}`);
  console.log(`Exportaciones: PDF, Excel, SENIAT TXT`);
  console.log(`Cierre de periodo: OK\n`);
}

main().catch((err) => {
  console.error('\nERROR FATAL:', err.message);
  process.exit(1);
});
