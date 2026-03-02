const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Comprar-IA API',
      version: '1.0.0',
      description: `API para gestión inteligente de Compras, Gastos, Retenciones, Pagos y Libro de Compras.
Adaptado a la normativa fiscal venezolana (SENIAT).

## Autenticación
Todas las rutas (excepto \`/auth/login\`) requieren un token JWT en el header:
\`Authorization: Bearer <token>\`

## Monedas
El sistema maneja VES (Bolívares) y USD. Los montos siempre incluyen la tasa de cambio BCV del día.

## Roles
- **admin** — Acceso completo
- **contador** — Facturas, retenciones, libro de compras, reportes
- **tesorero** — Pagos, bancos, conciliación
- **operador** — Registro de facturas y proveedores`,
      contact: { name: 'Soporte Comprar-IA', email: 'soporte@comprar-ia.com' },
    },
    servers: [
      { url: '/api/v1', description: 'API v1' },
    ],
    tags: [
      { name: 'Auth', description: 'Autenticación y gestión de usuarios' },
      { name: 'Proveedores', description: 'CRUD de proveedores' },
      { name: 'Facturas', description: 'Gestión de facturas de compra' },
      { name: 'Retenciones', description: 'Retenciones IVA e ISLR (SENIAT)' },
      { name: 'Pagos', description: 'Registro y control de pagos' },
      { name: 'Libro de Compras', description: 'Libro de compras fiscal (Art. 75 RLIVA)' },
      { name: 'Banca', description: 'Cuentas bancarias, movimientos y conciliación' },
      { name: 'Tasas de Cambio', description: 'Tasas BCV y registro manual' },
      { name: 'Configuración', description: 'Empresa, categorías, centros de costo, reglas de retención' },
      { name: 'Reportes', description: 'Cuentas por pagar, gastos, movimientos, diferencias cambiarias' },
      { name: 'Webhooks', description: 'Suscripciones a eventos para integraciones' },
      { name: 'Dashboard', description: 'Resumen ejecutivo y KPIs' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            pages: { type: 'integer' },
          },
        },
        Supplier: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            rif: { type: 'string', example: 'J-12345678-9' },
            business_name: { type: 'string', example: 'Empresa Ejemplo C.A.' },
            fiscal_address: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string', format: 'email' },
            taxpayer_type: { type: 'string', enum: ['ordinario', 'especial', 'no_sujeto'] },
            is_retention_agent: { type: 'boolean' },
            is_active: { type: 'boolean' },
          },
        },
        SupplierInput: {
          type: 'object',
          required: ['rif', 'business_name'],
          properties: {
            rif: { type: 'string', example: 'J-12345678-9', description: 'Formato: J-XXXXXXXX-X, V-XXXXXXXX-X, G-XXXXXXXX-X, E-XXXXXXXX-X' },
            business_name: { type: 'string' },
            fiscal_address: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string', format: 'email' },
            taxpayer_type: { type: 'string', enum: ['ordinario', 'especial', 'no_sujeto'] },
            is_retention_agent: { type: 'boolean' },
          },
        },
        Invoice: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            supplier_id: { type: 'string', format: 'uuid' },
            document_type: { type: 'string', enum: ['FC', 'FG', 'ND', 'NC', 'DSF'], description: 'FC=Factura, FG=Factura Gubernamental, ND=Nota Débito, NC=Nota Crédito, DSF=Doc Sin Factura' },
            invoice_number: { type: 'string' },
            control_number: { type: 'string' },
            emission_date: { type: 'string', format: 'date' },
            reception_date: { type: 'string', format: 'date' },
            fiscal_period: { type: 'string', example: '03/2026' },
            currency: { type: 'string', enum: ['VES', 'USD'] },
            exchange_rate: { type: 'number', example: 420.50 },
            taxable_amount: { type: 'number' },
            exempt_amount: { type: 'number' },
            non_subject_amount: { type: 'number' },
            vat_rate: { type: 'number', example: 16 },
            vat_amount: { type: 'number' },
            igtf_amount: { type: 'number', description: 'IGTF 3% para pagos en divisas' },
            total_amount: { type: 'number' },
            total_ves: { type: 'number' },
            total_usd: { type: 'number' },
            status: { type: 'string', enum: ['borrador', 'registrada', 'pago_parcial', 'pagada', 'anulada', 'en_disputa'] },
          },
        },
        InvoiceInput: {
          type: 'object',
          required: ['supplier_id', 'document_type', 'invoice_number', 'emission_date', 'currency', 'taxable_amount', 'vat_rate'],
          properties: {
            supplier_id: { type: 'string', format: 'uuid' },
            document_type: { type: 'string', enum: ['FC', 'FG', 'ND', 'NC', 'DSF'] },
            invoice_number: { type: 'string' },
            control_number: { type: 'string' },
            emission_date: { type: 'string', format: 'date' },
            reception_date: { type: 'string', format: 'date' },
            fiscal_period: { type: 'string', example: '03/2026' },
            currency: { type: 'string', enum: ['VES', 'USD'], default: 'VES' },
            exchange_rate: { type: 'number' },
            description: { type: 'string' },
            expense_category_id: { type: 'string', format: 'uuid' },
            cost_center_id: { type: 'string', format: 'uuid' },
            taxable_amount: { type: 'number' },
            exempt_amount: { type: 'number', default: 0 },
            non_subject_amount: { type: 'number', default: 0 },
            vat_rate: { type: 'number', default: 16 },
            vat_amount: { type: 'number' },
            igtf_amount: { type: 'number' },
            total_amount: { type: 'number' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  quantity: { type: 'number' },
                  unit_price: { type: 'number' },
                  subtotal: { type: 'number' },
                  is_taxable: { type: 'boolean', default: true },
                },
              },
            },
            related_invoice_id: { type: 'string', format: 'uuid', description: 'Para NC/ND: factura relacionada' },
          },
        },
        Payment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            payment_date: { type: 'string', format: 'date' },
            payment_method: { type: 'string', enum: ['transferencia', 'cheque', 'efectivo', 'pago_movil', 'zelle', 'paypal'] },
            sender_bank_id: { type: 'string', format: 'uuid' },
            reference_number: { type: 'string' },
            currency: { type: 'string', enum: ['VES', 'USD'] },
            amount: { type: 'number' },
            exchange_rate: { type: 'number' },
            amount_other_currency: { type: 'number' },
            exchange_difference: { type: 'number' },
            status: { type: 'string', enum: ['activo', 'anulado'] },
          },
        },
        PaymentInput: {
          type: 'object',
          required: ['payment_date', 'payment_method', 'currency', 'amount', 'invoice_ids'],
          properties: {
            payment_date: { type: 'string', format: 'date' },
            payment_method: { type: 'string', enum: ['transferencia', 'cheque', 'efectivo', 'pago_movil', 'zelle', 'paypal'] },
            sender_bank_id: { type: 'string', format: 'uuid' },
            reference_number: { type: 'string' },
            currency: { type: 'string', enum: ['VES', 'USD'] },
            amount: { type: 'number' },
            exchange_rate: { type: 'number' },
            observations: { type: 'string' },
            invoice_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Facturas a las que se aplica el pago' },
            amounts: { type: 'array', items: { type: 'number' }, description: 'Monto aplicado a cada factura (mismo orden que invoice_ids)' },
          },
        },
        Withholding: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            voucher_number: { type: 'string', example: '2026-IVA-00000001' },
            type: { type: 'string', enum: ['ISLR', 'IVA'] },
            supplier_id: { type: 'string', format: 'uuid' },
            withholding_rule_id: { type: 'string', format: 'uuid' },
            withholding_date: { type: 'string', format: 'date' },
            fiscal_period: { type: 'string', example: '03/2026' },
            base_amount: { type: 'number' },
            rate: { type: 'number' },
            amount_ves: { type: 'number' },
            amount_usd: { type: 'number' },
            exchange_rate: { type: 'number' },
            status: { type: 'string', enum: ['activa', 'anulada'] },
          },
        },
        WithholdingInput: {
          type: 'object',
          required: ['type', 'rate', 'invoice_ids'],
          properties: {
            type: { type: 'string', enum: ['ISLR', 'IVA'] },
            rate: { type: 'number', example: 75 },
            withholding_rule_id: { type: 'string', format: 'uuid' },
            withholding_date: { type: 'string', format: 'date' },
            fiscal_period: { type: 'string' },
            exchange_rate: { type: 'number' },
            invoice_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
          },
        },
        WithholdingRule: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['ISLR', 'IVA'] },
            concept_code: { type: 'string', example: '002', description: 'Código SENIAT (Decreto 1808)' },
            concept_name: { type: 'string' },
            rate: { type: 'number' },
            subtract_ut: { type: 'number', description: 'Sustraendo en UT (solo ISLR PNR)' },
            applies_to: { type: 'string', enum: ['natural', 'juridica', 'ambos'] },
            is_active: { type: 'boolean' },
          },
        },
        ExchangeRate: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            rate_date: { type: 'string', format: 'date' },
            rate: { type: 'number', example: 420.5 },
            source: { type: 'string', enum: ['bcv_api', 'manual'] },
          },
        },
        BankAccount: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            bank_name: { type: 'string' },
            account_type: { type: 'string', enum: ['corriente', 'ahorro'] },
            account_number: { type: 'string' },
            currency: { type: 'string', enum: ['VES', 'USD'] },
            initial_balance: { type: 'number' },
            current_balance: { type: 'number' },
          },
        },
        WebhookSubscription: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string' } },
            secret: { type: 'string', description: 'HMAC secret para verificar firma' },
            is_active: { type: 'boolean' },
          },
        },
        CompanyConfig: {
          type: 'object',
          properties: {
            company_rif: { type: 'string', example: 'J-12345678-9' },
            company_name: { type: 'string' },
            company_address: { type: 'string' },
            is_special_taxpayer: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [path.resolve(__dirname, '../routes/*.js')],
};

module.exports = swaggerJsdoc(options);
