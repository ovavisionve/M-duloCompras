# Comprar-IA - Referencia API

Base URL: `http://localhost:7000/api/v1`
Documentación interactiva: `http://localhost:7000/api-docs`

## Autenticación

Todas las rutas (excepto login/register) requieren un token JWT en el header:
```
Authorization: Bearer <token>
```

O una API Key:
```
X-API-Key: <api-key>
```

---

## Auth (`/api/v1/auth`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| POST | `/auth/register` | Registrar usuario | Admin |
| POST | `/auth/login` | Iniciar sesión | Público |
| POST | `/auth/refresh` | Renovar token | Autenticado |
| GET | `/auth/profile` | Perfil del usuario | Autenticado |
| PUT | `/auth/change-password` | Cambiar contraseña | Autenticado |
| POST | `/auth/api-keys` | Generar API key | Admin |
| GET | `/auth/api-keys` | Listar API keys | Admin |
| DELETE | `/auth/api-keys/:id` | Revocar API key | Admin |
| GET | `/auth/users` | Listar usuarios | Admin |
| PUT | `/auth/users/:id/role` | Cambiar rol | Admin |
| PUT | `/auth/users/:id/status` | Activar/desactivar | Admin |

### Login
```bash
curl -X POST http://localhost:7000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","password":"admin123"}'
```

Respuesta:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "email": "admin@empresa.com",
      "fullName": "Administrador",
      "role": "admin"
    }
  }
}
```

---

## Proveedores (`/api/v1/suppliers`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/suppliers` | Listar proveedores | Autenticado |
| GET | `/suppliers/:id` | Detalle proveedor | Autenticado |
| POST | `/suppliers` | Crear proveedor | Admin, Contador, Operador |
| PUT | `/suppliers/:id` | Actualizar proveedor | Admin, Contador |
| DELETE | `/suppliers/:id` | Desactivar proveedor | Admin |
| GET | `/suppliers/:id/invoices` | Facturas del proveedor | Autenticado |
| GET | `/suppliers/:id/payments` | Pagos al proveedor | Autenticado |
| GET | `/suppliers/:id/balance` | Saldo del proveedor | Autenticado |

### Crear Proveedor
```bash
curl -X POST http://localhost:7000/api/v1/suppliers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rif": "J-12345678-9",
    "business_name": "Proveedor Ejemplo C.A.",
    "fiscal_address": "Caracas, Venezuela",
    "phone": "0212-1234567",
    "email": "info@proveedor.com",
    "taxpayer_type": "ordinario",
    "is_retention_agent": false
  }'
```

---

## Facturas (`/api/v1/invoices`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/invoices` | Listar facturas | Autenticado |
| GET | `/invoices/:id` | Detalle factura | Autenticado |
| POST | `/invoices` | Crear factura | Admin, Contador, Operador |
| PUT | `/invoices/:id` | Actualizar factura | Admin, Contador |
| POST | `/invoices/:id/void` | Anular factura | Admin, Contador |
| GET | `/invoices/:id/payments` | Pagos de la factura | Autenticado |
| GET | `/invoices/:id/withholdings` | Retenciones de la factura | Autenticado |

### Crear Factura
```bash
curl -X POST http://localhost:7000/api/v1/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "supplier_id": "uuid-del-proveedor",
    "document_type": "FC",
    "invoice_number": "00-001234",
    "control_number": "00-001234",
    "emission_date": "2026-02-28",
    "reception_date": "2026-02-28",
    "currency": "VES",
    "exchange_rate": 78.50,
    "exchange_rate_date": "2026-02-28",
    "taxable_amount": 1000.00,
    "exempt_amount": 0,
    "non_subject_amount": 0,
    "vat_rate": 16,
    "expense_category_id": "uuid-categoria",
    "cost_center_id": "uuid-centro-costo",
    "fiscal_period": "02/2026",
    "status": "registrada"
  }'
```

**Parámetros de consulta para listar:**
- `status`: borrador, registrada, pago_parcial, pagada, anulada
- `supplier_id`: Filtrar por proveedor
- `from_date` / `to_date`: Rango de fechas
- `document_type`: FC, FG, ND, NC, DSF
- `fiscal_period`: MM/YYYY
- `page` / `limit`: Paginación

---

## Retenciones (`/api/v1/withholdings`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/withholdings` | Listar retenciones | Autenticado |
| GET | `/withholdings/:id` | Detalle retención | Autenticado |
| GET | `/withholdings/:id/voucher` | Descargar comprobante PDF | Autenticado |
| GET | `/withholdings/summary` | Resumen por período | Autenticado |

**Parámetros de consulta:**
- `type`: ISLR, IVA
- `fiscal_period`: MM/YYYY
- `supplier_id`: Filtrar por proveedor
- `page` / `limit`: Paginación

---

## Pagos (`/api/v1/payments`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/payments` | Listar pagos | Autenticado |
| GET | `/payments/:id` | Detalle pago | Autenticado |
| POST | `/payments` | Registrar pago | Admin, Contador, Tesorero |
| POST | `/payments/:id/void` | Anular pago | Admin |
| GET | `/payments/:id/receipt` | Descargar recibo PDF | Autenticado |

### Registrar Pago
```bash
curl -X POST http://localhost:7000/api/v1/payments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_id": "uuid-factura",
    "payment_date": "2026-02-28",
    "payment_method": "transferencia",
    "currency": "VES",
    "amount": 1160.00,
    "exchange_rate": 78.50,
    "reference_number": "REF123456",
    "bank_account_id": "uuid-cuenta"
  }'
```

---

## Libro de Compras (`/api/v1/purchase-book`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/purchase-book` | Obtener libro del período | Autenticado |
| GET | `/purchase-book/pdf` | Exportar PDF | Autenticado |
| GET | `/purchase-book/excel` | Exportar Excel | Autenticado |
| GET | `/purchase-book/seniat` | Exportar TXT SENIAT | Autenticado |
| POST | `/purchase-book/close` | Cerrar período fiscal | Admin, Contador |

**Parámetros de consulta:**
- `period`: MM/YYYY (requerido)

---

## Bancos (`/api/v1/banking`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/banking/bank-accounts` | Listar cuentas | Autenticado |
| POST | `/banking/bank-accounts` | Crear cuenta | Admin, Tesorero |
| POST | `/banking/bank-accounts/:id/statements` | Importar movimientos | Admin, Tesorero, Contador |
| GET | `/banking/bank-accounts/:id/movements` | Listar movimientos | Autenticado |
| POST | `/banking/reconciliation/auto` | Conciliación automática | Admin, Tesorero, Contador |
| POST | `/banking/reconciliation/manual` | Conciliación manual | Admin, Tesorero, Contador |
| GET | `/banking/reconciliation/report` | Reporte conciliación | Autenticado |
| GET | `/banking/api-config` | Ver config API bancaria | Admin, Tesorero |
| PUT | `/banking/api-config` | Guardar config API bancaria | Admin |
| POST | `/banking/sync` | Sincronizar desde API bancaria | Admin, Tesorero, Contador |

---

## Tasas de Cambio (`/api/v1/exchange-rates`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/exchange-rates` | Listar tasas | Autenticado |
| GET | `/exchange-rates/latest` | Tasa más reciente | Autenticado |
| POST | `/exchange-rates` | Registrar tasa manual | Admin, Contador |
| POST | `/exchange-rates/fetch-bcv` | Consultar BCV | Admin, Contador |

---

## Configuración (`/api/v1/config`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/config/company` | Datos empresa | Autenticado |
| PUT | `/config/company` | Actualizar empresa | Admin |
| GET | `/config/tax-unit` | Valor UT | Autenticado |
| PUT | `/config/tax-unit` | Actualizar UT | Admin, Contador |
| GET | `/config/expense-categories` | Categorías de gasto | Autenticado |
| POST | `/config/expense-categories` | Crear categoría | Admin, Contador |
| GET | `/config/cost-centers` | Centros de costo | Autenticado |
| POST | `/config/cost-centers` | Crear centro | Admin, Contador |
| GET | `/config/withholding-rules` | Reglas de retención | Autenticado |
| PUT | `/config/withholding-rules/:id` | Actualizar regla | Admin, Contador |

---

## Reportes (`/api/v1/reports`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/reports/purchases-summary` | Resumen compras | Autenticado |
| GET | `/reports/withholdings-summary` | Resumen retenciones | Autenticado |
| GET | `/reports/aging-report` | Antigüedad de deuda | Autenticado |
| GET | `/reports/expense-by-category` | Gastos por categoría | Autenticado |
| GET | `/reports/expense-by-cost-center` | Gastos por centro costo | Autenticado |

---

## Dashboard (`/api/v1/dashboard`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/dashboard/stats` | Estadísticas generales | Autenticado |
| GET | `/dashboard/charts` | Datos para gráficos | Autenticado |

---

## Webhooks (`/api/v1/webhooks`)

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/webhooks` | Listar suscripciones | Admin |
| POST | `/webhooks` | Crear suscripción | Admin |
| DELETE | `/webhooks/:id` | Eliminar suscripción | Admin |
| GET | `/webhooks/:id/deliveries` | Ver entregas | Admin |
| POST | `/webhooks/:id/test` | Enviar test | Admin |

### Eventos disponibles
- `invoice.created` - Nueva factura registrada
- `invoice.voided` - Factura anulada
- `payment.created` - Pago registrado
- `payment.voided` - Pago anulado
- `withholding.created` - Retención generada
- `purchase_book.closed` - Período fiscal cerrado

---

## Formato de Respuesta

### Exitosa
```json
{
  "success": true,
  "data": { ... },
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 50
  }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "message": "Descripción del error",
    "code": "ERROR_CODE",
    "statusCode": 400
  }
}
```

## Códigos de Error Comunes

| Código HTTP | Significado |
|------------|-------------|
| 400 | Datos inválidos o faltantes |
| 401 | No autenticado (token inválido/expirado) |
| 403 | Sin permisos (rol insuficiente) |
| 404 | Recurso no encontrado |
| 409 | Conflicto (duplicado) |
| 429 | Demasiadas peticiones (rate limit) |
| 500 | Error interno del servidor |

## Rate Limiting

- 100 peticiones por minuto por IP en rutas `/api/`
- Headers de respuesta incluyen: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
