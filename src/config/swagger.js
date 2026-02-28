const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Comprar-IA API',
      version: '1.0.0',
      description: 'Comprar-IA - API para gestión inteligente de Compras, Gastos, Retenciones, Pagos y Libro de Compras. Adaptado a la normativa fiscal venezolana (SENIAT).',
      contact: { name: 'Soporte Comprar-IA', email: 'soporte@comprar-ia.com' },
    },
    servers: [
      { url: '/api/v1', description: 'API v1' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        Supplier: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            rif: { type: 'string', example: 'J-12345678-9' },
            business_name: { type: 'string' },
            fiscal_address: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
            taxpayer_type: { type: 'string', enum: ['ordinario', 'especial', 'no_sujeto'] },
            is_retention_agent: { type: 'boolean' },
          },
        },
        Invoice: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            supplier_id: { type: 'string', format: 'uuid' },
            document_type: { type: 'string', enum: ['FC', 'FG', 'ND', 'NC', 'DSF'] },
            invoice_number: { type: 'string' },
            control_number: { type: 'string' },
            emission_date: { type: 'string', format: 'date' },
            currency: { type: 'string', enum: ['VES', 'USD'] },
            exchange_rate: { type: 'number' },
            taxable_amount: { type: 'number' },
            exempt_amount: { type: 'number' },
            vat_rate: { type: 'number' },
            vat_amount: { type: 'number' },
            total_amount: { type: 'number' },
            total_ves: { type: 'number' },
            total_usd: { type: 'number' },
            status: { type: 'string', enum: ['borrador', 'registrada', 'pago_parcial', 'pagada', 'anulada', 'en_disputa'] },
          },
        },
        Payment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            payment_date: { type: 'string', format: 'date' },
            payment_method: { type: 'string' },
            currency: { type: 'string', enum: ['VES', 'USD'] },
            amount: { type: 'number' },
            exchange_rate: { type: 'number' },
            reference_number: { type: 'string' },
            status: { type: 'string', enum: ['activo', 'anulado'] },
          },
        },
        Withholding: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            voucher_number: { type: 'string' },
            type: { type: 'string', enum: ['ISLR', 'IVA'] },
            base_amount: { type: 'number' },
            rate: { type: 'number' },
            amount_ves: { type: 'number' },
            amount_usd: { type: 'number' },
          },
        },
        ExchangeRate: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            rate_date: { type: 'string', format: 'date' },
            rate: { type: 'number' },
            source: { type: 'string', enum: ['bcv_api', 'manual'] },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [], // We define schemas inline above
};

module.exports = swaggerJsdoc(options);
