# Comprar-IA — Módulo de Compras y Gastos

> **📋 Para contexto operativo completo (estado BFC, secretos, histórico con Diego, próximos pasos), leer primero: [`docs/ESTADO-PROYECTO.md`](docs/ESTADO-PROYECTO.md)**

## Cliente
**WEFLY2022 C.A.** — Agencia de viajes (Caracas, Venezuela)
- RIF: J-503159952
- Dirección: Av La Estancia, Torre D, Urb Chuao, Caracas (Chacao)
- No es contribuyente especial, no es agente de retención de IVA
- IVA: 16% fee, 8% boleto KIU
- Bancos: BFC (VES), Chase (USD), PNC (USD)
- Login: admin@wefly.com.ve / admin123

## Multi-Tenancy
El sistema soporta múltiples organizaciones (clientes) en una sola DB, aisladas por `organization_id`. Todas las tablas operativas tienen este campo y todos los endpoints filtran automáticamente por `req.user.organizationId`.

### Portal Master (super admin)
- URL: `/portal` — layout independiente del módulo de compras
- Rol especial: `super_admin` (sin `organization_id`)
- Login master: `master@compraria.com` / `Master2026!`
- Funciones: crear/editar organizaciones, gestionar usuarios por org, ver stats globales
- API: `/api/v1/portal/*` (protegida por middleware `requireSuperAdmin`)
- El wizard de creación de org provisiona atómicamente: org + admin user + config base + 9 categorías + 4 cost centers

### BFC por organización
La integración BFC (`bfc_config`, `bfc_accounts`, `bfc_tokens`, `bfc_sync_logs`) está scoped por `organization_id` — cada cliente configura sus propias credenciales. La página `/bfc` ofrece un wizard de 3 pasos (credenciales → test → finalizar) cuando no hay config, y un documento imprimible de resumen.

## Stack
- **Backend**: Node.js 18 + Express, PostgreSQL (Knex ORM)
- **Frontend**: React 18 + Vite, React Router, Recharts, Lucide icons
- **Deploy**: Leapcell (Serverless, usa Dockerfile)
- **Branch de desarrollo**: `claude/purchases-expenses-module-exCg7`

## Estructura del Proyecto
```
src/
  server.js          — Entry point (runs migrations on startup)
  app.js             — Express app setup
  database/
    connection.js    — Knex connection
    knexfile.js      — Knex config (dev/production)
    migrations/      — Schema migrations (Knex)
    seeds/           — Seed data (001_initial_data.js)
  routes/            — Express route handlers
  services/          — Business logic
  utils/             — Logger, helpers
frontend/
  src/
    App.jsx          — Main app, routes, sidebar
    pages/           — Page components (Dashboard, Invoices, Treasury, etc.)
  dist/              — Built frontend (tracked in git for Leapcell)
```

## Base de Datos — Tablas Principales
```
users, api_keys, config, expense_categories, cost_centers,
exchange_rates, suppliers, invoices, invoice_items,
withholding_rules, withholdings, withholding_invoices,
bank_accounts, payments, payment_invoices, bank_movements,
purchase_books, audit_logs, webhook_subscriptions, webhook_logs,
treasury_operations, treasury_cash_flows, treasury_ledger, internal_accounts, cash_flows
```

## Deploy (Leapcell)
- Usa Dockerfile multi-stage: build frontend (Vite) + backend Node
- CMD: `node src/server.js` (server.js corre migraciones internamente)
- `frontend/dist/` está en git (excepción en .gitignore) porque Leapcell lo necesita
- Dominio: https://dulocompras-ovavisionve870-p7z2y086.leapcell.dev

## Notas Importantes
- La tabla `config` tiene `key` UNIQUE — usar UPDATE/upsert, no INSERT duplicado
- Seeds son idempotentes (verifican si data existe antes de insertar)
- El módulo Treasury se accede clickeando "IA" en el logo del sidebar (oculto)
- Migraciones de datos deben usar `TRUNCATE TABLE "tabla" CASCADE` con `hasTable()` check
- server.js libera migration locks stale antes de correr migrate.latest()
