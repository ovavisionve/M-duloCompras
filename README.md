# Módulo de Compras, Gastos, Retenciones, Pagos y Libro de Compras

Sistema completo para gestión de compras y obligaciones fiscales adaptado a la normativa venezolana (SENIAT).

## Características

- **Registro de Facturas**: Compras, gastos, notas de débito/crédito con manejo dual VES/USD
- **Retenciones Fiscales**: ISLR e IVA con comprobantes PDF y exportación SENIAT
- **Registro de Pagos**: Múltiples métodos, pagos parciales, diferencial cambiario
- **Libro de Compras**: Generación automática en PDF, Excel y formato SENIAT TXT
- **Conciliación Bancaria**: Importación de estados de cuenta y conciliación automática/manual
- **Tasa de Cambio BCV**: Consulta automática diaria con histórico
- **Dashboard**: Indicadores en tiempo real con gráficos
- **API RESTful**: Documentada con Swagger/OpenAPI 3.0
- **Webhooks**: Notificaciones en tiempo real de eventos
- **RBAC**: Control de acceso basado en roles (Admin, Contador, Tesorero, Operador, Auditor)

## Stack Tecnológico

- **Backend**: Node.js + Express.js
- **Base de Datos**: PostgreSQL con Knex.js (query builder + migraciones)
- **Frontend**: React 18 + Vite + Recharts
- **Autenticación**: JWT + API Keys
- **PDF**: PDFKit
- **Excel**: ExcelJS

## Instalación

```bash
# Backend
npm install
cp .env.example .env  # Configurar variables de entorno

# Crear base de datos PostgreSQL
createdb modulo_compras

# Ejecutar migraciones y seeds
npm run migrate
npm run seed

# Iniciar servidor
npm run dev

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev
```

## API Endpoints

| Recurso | Base URL |
|---------|----------|
| Auth | `/api/v1/auth` |
| Proveedores | `/api/v1/suppliers` |
| Facturas | `/api/v1/invoices` |
| Retenciones | `/api/v1/withholdings` |
| Pagos | `/api/v1/payments` |
| Libro de Compras | `/api/v1/purchase-book` |
| Bancos | `/api/v1/banking` |
| Tasas de Cambio | `/api/v1/exchange-rates` |
| Configuración | `/api/v1/config` |
| Reportes | `/api/v1/reports` |
| Dashboard | `/api/v1/dashboard` |
| Webhooks | `/api/v1/webhooks` |

Documentación interactiva: `http://localhost:3000/api-docs`

## Usuarios por Defecto (seed)

| Email | Contraseña | Rol |
|-------|------------|-----|
| admin@empresa.com | admin123 | Administrador |
| contador@empresa.com | admin123 | Contador |
| tesorero@empresa.com | admin123 | Tesorero |
| operador@empresa.com | admin123 | Operador |

## Estructura del Proyecto

```
├── src/
│   ├── server.js              # Entry point
│   ├── app.js                 # Express app setup
│   ├── config/                # Swagger config
│   ├── database/
│   │   ├── connection.js      # Knex connection
│   │   ├── knexfile.js        # DB config
│   │   ├── migrations/        # Schema migrations
│   │   └── seeds/             # Initial data
│   ├── middleware/             # Auth, upload, error handling, rate limiting
│   ├── routes/                # API route handlers
│   ├── services/              # Business logic
│   └── utils/                 # Helpers, logger
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Main app with routing
│   │   ├── api.js             # Axios client
│   │   ├── pages/             # React page components
│   │   └── styles/            # CSS
│   └── index.html
└── package.json
```
