# Comprar-IA

**Gestión Fiscal Inteligente para Venezuela**

Sistema completo para gestión de compras, gastos, retenciones, pagos y libro de compras adaptado a la normativa fiscal venezolana (SENIAT).

## Características

- **Registro de Facturas**: Compras, gastos, notas de débito/crédito con manejo dual VES/USD
- **Retenciones Fiscales**: ISLR e IVA con comprobantes PDF y exportación SENIAT
- **Registro de Pagos**: Múltiples métodos, pagos parciales, diferencial cambiario
- **Libro de Compras**: Generación automática en PDF, Excel y formato SENIAT TXT
- **Conciliación Bancaria**: Importación de estados de cuenta, conciliación automática/manual y preparado para API bancaria
- **Tasa de Cambio BCV**: Consulta automática diaria con histórico
- **Dashboard**: Indicadores en tiempo real con gráficos
- **API RESTful**: +85 endpoints documentados con Swagger/OpenAPI 3.0
- **Webhooks**: Notificaciones en tiempo real de eventos
- **RBAC**: Control de acceso basado en roles (Admin, Contador, Tesorero, Operador, Auditor)

## Stack Tecnológico

| Componente | Tecnología |
|-----------|-----------|
| Backend | Node.js 18+ / Express.js |
| Base de Datos | PostgreSQL 14+ / Knex.js |
| Frontend | React 18 / Vite 5 / Recharts |
| Autenticación | JWT + Refresh Tokens + API Keys |
| PDF | PDFKit |
| Excel | ExcelJS |
| Logs | Winston |

## Instalación Rápida

### Requisitos Previos
- Node.js >= 18.0.0
- PostgreSQL >= 14
- npm o yarn

### Pasos

```bash
# 1. Clonar repositorio
git clone https://github.com/ovavisionve/M-duloCompras.git
cd M-duloCompras

# 2. Instalar dependencias del backend
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus datos de PostgreSQL

# 4. Crear base de datos
createdb comprar_ia

# 5. Ejecutar migraciones y datos iniciales
npm run migrate
npm run seed

# 6. Iniciar backend (puerto 7000)
npm run dev

# 7. En otra terminal, instalar e iniciar frontend
cd frontend
npm install
npm run dev
# Frontend disponible en http://localhost:10000
```

## Variables de Entorno (.env)

```env
# Base de Datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=comprar_ia
DB_USER=postgres
DB_PASSWORD=tu_contraseña

# JWT
JWT_SECRET=tu_clave_secreta_jwt
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Servidor
PORT=7000
NODE_ENV=development
CORS_ORIGINS=http://localhost:10000

# Logs
LOG_LEVEL=info
LOG_DIR=./logs
```

## API Endpoints

| Módulo | Base URL | Descripción |
|--------|----------|-------------|
| Auth | `/api/v1/auth` | Login, registro, refresh token, API keys |
| Proveedores | `/api/v1/suppliers` | CRUD proveedores con validación RIF |
| Facturas | `/api/v1/invoices` | FC, FG, ND, NC, DSF con cálculo automático |
| Retenciones | `/api/v1/withholdings` | ISLR/IVA, comprobantes PDF |
| Pagos | `/api/v1/payments` | Registro, recibos PDF |
| Libro de Compras | `/api/v1/purchase-book` | Generación, exportación PDF/Excel/SENIAT |
| Bancos | `/api/v1/banking` | Cuentas, movimientos, conciliación |
| Tasas de Cambio | `/api/v1/exchange-rates` | BCV automático + manual |
| Configuración | `/api/v1/config` | Empresa, UT, categorías, centros de costo |
| Reportes | `/api/v1/reports` | Reportes fiscales y financieros |
| Dashboard | `/api/v1/dashboard` | Indicadores y estadísticas |
| Webhooks | `/api/v1/webhooks` | Suscripción a eventos |

**Documentación interactiva Swagger**: `http://localhost:7000/api-docs`

## Usuarios por Defecto

| Email | Contraseña | Rol |
|-------|------------|-----|
| admin@empresa.com | admin123 | Administrador |
| contador@empresa.com | admin123 | Contador |
| tesorero@empresa.com | admin123 | Tesorero |
| operador@empresa.com | admin123 | Operador |

> **Importante**: Cambiar las contraseñas por defecto antes de poner en producción.

## Estructura del Proyecto

```
comprar-ia/
├── src/
│   ├── server.js              # Punto de entrada
│   ├── app.js                 # Configuración Express
│   ├── config/
│   │   └── swagger.js         # Configuración OpenAPI
│   ├── database/
│   │   ├── connection.js      # Conexión Knex
│   │   ├── knexfile.js        # Configuración DB
│   │   ├── migrations/        # Migraciones de esquema
│   │   └── seeds/             # Datos iniciales
│   ├── middleware/
│   │   ├── auth.js            # JWT + API Key + RBAC
│   │   ├── errorHandler.js    # Manejo global de errores
│   │   ├── rateLimiter.js     # Límite de peticiones
│   │   └── upload.js          # Subida de archivos
│   ├── routes/                # Controladores de rutas
│   ├── services/              # Lógica de negocio
│   └── utils/
│       ├── helpers.js         # Funciones utilitarias
│       └── logger.js          # Winston logger
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # App principal con rutas
│   │   ├── api.js             # Cliente Axios
│   │   ├── pages/             # Componentes de páginas
│   │   └── styles/            # CSS
│   └── index.html
├── scripts/                   # Scripts de prueba
├── uploads/                   # Archivos subidos
├── logs/                      # Archivos de log
└── package.json
```

## Licencia

Propiedad de OVA Vision VE.
