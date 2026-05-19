# Estado del Proyecto — Comprar-IA (WEFLY2022)

**Última actualización:** 2026-05-19
**Branch de desarrollo:** `claude/review-recent-commits-GoXbj`
**Repo:** `ovavisionve/m-dulocompras`

> Este documento concentra TODO el contexto operativo del proyecto para que cualquier sesión nueva de Claude pueda retomar sin perder hilo. Contiene credenciales operacionales — el repo es privado, no exponer públicamente.

---

## 1. Cliente

**WEFLY2022 C.A.** — Agencia de viajes (Caracas, Venezuela)

- **RIF:** J-503159952
- **Dirección fiscal:** Av La Estancia con calle Ernesto Blohm, Edif Torre D, piso 1, of D-102, Urb Chuao, Caracas (Chacao), Miranda, zona postal 1060
- **Contribuyente especial:** NO
- **Agente de retención de IVA:** NO
- **Alícuotas IVA:**
  - 16% sobre el fee de la agencia
  - 8% sobre boleto KIU (aerolíneas nacionales)
- **Métodos de pago actuales:** pago móvil, Zelle, efectivo (futuro: tarjeta internacional/nacional)
- **Bancos:** BFC (VES), Chase (USD), PNC (USD)
- **Sistemas relacionados:** Wave (contabilidad), Smart (facturación), KIU (líneas nacionales), Duffel (internacional, futuro), Galac (posible contable destino)
- **Usuarios del sistema:** 4
- **Tasa de cambio:** BCV automática (diaria) + referencia paralela
- **Login app:** `admin@wefly.com.ve` / `admin123`

### Contacto principal
- **Diego Ravelo** — punto de contacto operativo (WhatsApp)
- **Yensi** — administradora/contadora
- **Chris** — desarrollador interno de WEFLY
- **Sallyan Morillo** — encargada del proyecto Smart (separado)

---

## 2. Stack & Deployment

```
Backend:   Node.js 18 + Express, PostgreSQL (Knex ORM)
Frontend:  React 18 + Vite, React Router, Recharts, Lucide
Deploy:    Leapcell (Serverless, Dockerfile multi-stage)
Dominio:   https://dulocompras-ovavisionve870-p7z2y086.leapcell.dev
```

### Estructura
```
src/
  server.js                        Entry point (corre migraciones al arrancar)
  app.js                           Express app + rutas
  database/
    connection.js                  Knex
    knexfile.js                    Config dev/prod
    migrations/                    19 migraciones aplicadas
    seeds/001_initial_data.js      Datos iniciales (idempotente)
  routes/                          Express routes
  services/                        Business logic
  middleware/auth.js               authenticate, authorize, requireSuperAdmin
  utils/totp.js                    TOTP RFC 6238 (pure Node crypto)
frontend/
  src/
    App.jsx                        Rutas + Sidebar
    pages/                         Dashboard, Invoices, Treasury, BfcBank, Portal, Login, etc.
  dist/                            Build trackeado en git (Leapcell lo requiere)
ec2-bfc-proxy/
  proxy.js                         Proxy Node corriendo en EC2 WEFLY
  bfc-proxy.service                systemd unit
  ipsec.conf, ipsec.secrets        Plantillas strongSwan
  setup.sh                         Instalador
  FORMULARIO-VPN-BFC.md            Datos para el banco
  GUIA-INSTALACION.md              Pasos en EC2
```

### Notas de deploy importantes
- `frontend/dist/` se commitea (excepción en `.gitignore`) porque Leapcell lo necesita.
- `server.js` libera locks stale de migración y corre `migrate.latest()` al arrancar.
- La tabla `config` tiene `key` UNIQUE — usar UPDATE/upsert, NO INSERT duplicado.
- Seeds son idempotentes (chequean antes de insertar).

---

## 3. Base de Datos

### Tablas
```
users, api_keys, config, expense_categories, cost_centers,
exchange_rates, suppliers, invoices, invoice_items,
withholding_rules, withholdings, withholding_invoices,
bank_accounts, payments, payment_invoices, bank_movements,
purchase_books, audit_logs, webhook_subscriptions, webhook_logs,
treasury_operations, treasury_cash_flows, treasury_ledger,
internal_accounts, cash_flows,
organizations,                     (multi-tenancy)
bfc_config, bfc_accounts, bfc_tokens, bfc_sync_logs,
wave_integrations, wave_mappings
```

### Migraciones aplicadas (19)
```
20260227000001_initial_schema
20260302000001_update_withholding_seniat_codes
20260303000001_treasury_operations
20260304000001_treasury_purchase_type
20260304000002_treasury_cash_flows
20260306000001_cashflow_bank_account
20260306000001_reset_wefly_data
20260307000001_add_indexes
20260307000002_seed_wefly_users
20260307000003_clean_demo_data
20260307000004_production_reset
20260310000001_demo_users
20260310000002_multi_tenancy
20260310000003_credit_note_applications
20260316000001_wave_integration
20260316000002_wave_mappings
20260420000001_bfc_bank_integration
20260430000001_seed_bfc_proxy_key
20260507000001_super_admin_role
20260507000002_user_totp
```

---

## 4. Multi-Tenancy

Single DB, aislada por `organization_id`. Todas las tablas operativas tienen el campo. Todos los endpoints filtran automáticamente por `req.user.organizationId` (set por el middleware `authenticate`).

### Portal Master (super admin)
- URL: `/portal` (layout independiente, sin sidebar del módulo)
- Rol especial: `super_admin` (sin `organization_id`)
- **Login master:** `master@compraria.com` / `Master2026!`
- API: `/api/v1/portal/*` protegida por `requireSuperAdmin`

### Funcionalidades del portal
- Wizard de creación de organizaciones (3 pasos) — provisiona atómicamente: org + admin user + 11 config + 9 categorías de gasto + 4 cost centers
- CRUD de usuarios por organización
- Toggle activo/inactivo de orgs y usuarios
- Reset de passwords
- Stats globales (orgs, usuarios, facturas, proveedores)
- **2FA/TOTP** para el master user (RFC 6238, sin dependencias externas)
- **Impersonación** del admin de cualquier org (JWT 2h, auditado)
- 401 auto-logout en todas las llamadas del portal

### Aislamiento confirmado por testing
- Org A no ve datos de org B (suppliers, invoices, BFC config, etc.)
- Audit log scopeado por organización
- `super_admin` se redirige a `/portal` si entra a `/` (los pages operativos rompen con `organizationId=null`)

---

## 5. Integración BFC — ESTADO ACTUAL

### Arquitectura

```
Comprar-IA (Leapcell)
   │
   │ HTTPS + x-api-key
   ▼
EC2 WEFLY (3.219.103.87:3100)
   │
   │ proxy.js + strongSwan
   ▼
VPN IPSec (PENDIENTE: BFC debe levantar el túnel)
   │
   ▼
BFC API (URL interna pendiente del banco)
```

### ✅ Lo que YA está listo

| Componente | Estado | Detalles |
|---|---|---|
| EC2 instance | ✅ | Amazon Linux, administrado por WEFLY |
| **Elastic IP** | ✅ | `3.219.103.87` |
| strongSwan | ✅ | Instalado, no configurado todavía (faltan datos del banco) |
| Security Group | ✅ | UDP 500, UDP 4500, TCP 3100 abiertos |
| **Proxy corriendo** | ✅ | `bfc-proxy.service` activo en EC2, puerto 3100 |
| Health check | ✅ | `curl http://localhost:3100/health` → `{"status":"ok","bfc_url":"not configured",...}` |
| API key del proxy | ✅ | Configurada en EC2 y en Comprar-IA (ver sección 9 de secretos) |
| PSK del túnel | ✅ | Generado con `openssl rand -base64 32` (ver sección 9) |
| Formulario "VPN Device Information" | ✅ | Enviado a BFC el 4/may por correo |
| Backend Comprar-IA | ✅ | `src/routes/bfcBank.js` + `src/services/bfcBankService.js` |
| Multi-tenancy BFC | ✅ | `bfc_config`, `bfc_accounts`, `bfc_tokens`, `bfc_sync_logs` scopeados por `organization_id` |
| Wizard frontend | ✅ | `frontend/src/pages/BfcBank.jsx` (3 pasos + documento imprimible) |

### ⏳ Lo que falta (del lado del banco)

1. Que BFC apruebe el formulario VPN
2. Que entreguen la **`BFC_BASE_URL`** (IP/URL interna de su API dentro del túnel)
3. Agendar la sesión de levantamiento del túnel IPSec
4. Probar `curl` desde EC2 a la URL del banco
5. Probar desde Comprar-IA pasando por el proxy
6. Definir si BFC envía push notifications — si sí, qué payload/auth/IP origen esperan

### Endpoints del módulo BFC (`/api/v1/bfc/*`)

| Método | Path | Rol | Función |
|---|---|---|---|
| GET | `/config` | admin, tesorero | Obtener config actual |
| POST | `/config` | admin | Guardar/actualizar config |
| DELETE | `/config` | admin | Borrar config |
| POST | `/test-connection` | admin, tesorero | Probar conectividad al proxy |
| GET | `/accounts` | (autenticado) | Listar cuentas registradas |
| POST | `/accounts` | admin, tesorero | Agregar cuenta |
| DELETE | `/accounts/:id` | admin | Borrar cuenta |
| GET | `/balance/:accountNumber` | admin, tesorero, contador | Consultar balance |
| POST | `/movements/:accountNumber` | admin, tesorero, contador | Consultar movimientos |
| POST | `/import/:accountNumber` | admin, tesorero, contador | Importar movimientos a `bank_movements` |
| POST | `/import-all` | admin, tesorero | Importar todas las cuentas |
| GET | `/logs` | (autenticado) | Ver `bfc_sync_logs` |

### Endpoint inbound (push de BFC)
**NO existe todavía** un endpoint público para recibir notificaciones desde BFC. Cuando el banco confirme que va a empujar eventos, hay que construir:
- `POST /api/v1/bfc/notifications` con verificación de IP origen (whitelist VPN) y HMAC si aplica
- Persistencia en `bfc_sync_logs` o tabla nueva `bfc_notifications`
- Insert automático en `bank_movements` si el payload es un movimiento

---

## 6. Funcionalidades por módulo

### Operaciones
- **Facturas** (`/invoices`) — registro, edición, items, multi-divisa, vinculación con retenciones
- **Notas de crédito** (`/credit-notes`) — con aplicaciones a facturas (`credit_note_applications`)
- **Proveedores** (`/suppliers`) — tipo (servicios/bienes/mixto), retenciones por defecto
- **Pagos** (`/payments`) — vinculados a facturas y cuentas bancarias
- **Retenciones** (`/withholdings`) — ISLR + IVA, generación de XML SENIAT (códigos actualizados)

### Fiscal
- **Libro de Compras** (`/purchase-book`) — exportable
- **Tasas de cambio** (`/exchange-rates`) — BCV API + manual + Binance P2P (script en `docs/extraccion-tasa-binance.md`)

### Bancos
- **Conciliación** (`/banking`) — `bank_movements` + matching con pagos
- **BFC** (`/bfc`) — wizard de setup + documento imprimible

### Sistema
- **Reportes** (`/reports`)
- **Wave** (`/wave`) — integración con Wave Apps
- **Treasury** (`/treasury`) — oculto, se accede clickeando "IA" en el logo
- **Configuración** (`/config`) — config general de la org

---

## 7. Auth & Seguridad

### Roles
- `super_admin` — portal master (sin organization_id)
- `admin` — admin de organización
- `contador`, `tesorero`, `operador`, `auditor` — roles operativos
- `api_consumer` — para API keys server-to-server

### JWT
- Token de acceso: 8h por defecto (`JWT_EXPIRATION`)
- Refresh token: 7d (`JWT_REFRESH_EXPIRATION`)
- Variable: `JWT_SECRET` (requerida)

### 2FA / TOTP (master user)
- RFC 6238 implementado en `src/utils/totp.js` con `crypto` de Node (sin deps externas)
- Base32 encode/decode propio, HMAC-SHA1, ventana de drift ±1 (90 segundos total)
- Flujo de login: si `totp_enabled=true` → `POST /auth/login` retorna `{ requires_2fa: true, totp_token }` (JWT de 5min con `type: 'totp_challenge'`)
- Segunda fase: `POST /auth/totp-verify` con `{ totp_token, code }` → JWT completo
- Setup desde Portal: `GET /portal/auth/totp/setup` → secret + URI → `POST /portal/auth/totp/activate` con `{ secret, code }`
- Disable: `DELETE /portal/auth/totp` con código actual

### Impersonación
- `POST /api/v1/portal/organizations/:id/impersonate` (super_admin only)
- Encuentra admin activo de la org (o cualquier usuario activo si no hay admin)
- Emite JWT de 2h con flags `impersonated: true, impersonatedBy: <master_id>`
- Auditado en `audit_logs` con `org_id` de la org afectada
- Frontend abre nueva pestaña en `/impersonate?token=...&user=...`
- `ImpersonateLanding` inyecta el token en localStorage y redirige a `/`

### Rate limiting
- `authRateLimiter` aplicado a `/auth/login`, `/auth/refresh`, `/auth/totp-verify`
- En memoria (in-process) — se resetea al reiniciar el server

---

## 8. Build & Code Splitting

Vite `manualChunks` configurado en `frontend/vite.config.js`:

```
react-vendor   164 kB (gzip 54 kB)   react + react-dom + react-router-dom
charts         434 kB (gzip 115 kB)  recharts
icons           24 kB (gzip  5 kB)   lucide-react
index          341 kB (gzip 73 kB)   app code
```

El warning de "chunk > 500 kB" desapareció. Los chunks vendor son cacheables independientemente del código de la app.

---

## 9. ⚠️ Secretos y Credenciales Operacionales

> **NO compartir fuera del equipo. Repo es privado.** Si en algún momento se hace público, mover a un secret manager y rotar todos los valores.

### Comprar-IA app
- Login WEFLY: `admin@wefly.com.ve` / `admin123`
- Login Master Portal: `master@compraria.com` / `Master2026!`

### EC2 Proxy BFC
- **Elastic IP pública:** `3.219.103.87`
- **IP privada EC2:** `172.31.59.48`
- **Sistema operativo:** Amazon Linux
- **Puerto del proxy:** `3100`
- **API key del proxy** (`BFC_PROXY_API_KEY`):
  ```
  bfc_proxy_k7x9mQ2pRvL4nW8jYt3dZs6uHcA1eF5i
  ```
  Configurada en:
  - EC2: `/etc/systemd/system/bfc-proxy.service` → `Environment=BFC_PROXY_API_KEY=...`
  - Comprar-IA: BFC > Configuración > "API Key del Proxy" (encriptada con AES-256-CBC vía `crypto.scryptSync`)

### VPN IPSec (pendiente de levantar)
- **PSK del túnel:**
  ```
  2ckihBhDRJB0xian1PurI/XA4SGuVz+28djdUgYpchI=
  ```
  Generado con `openssl rand -base64 32`. Compartido con BFC en el formulario "VPN Device Information".

- **Datos pendientes que debe enviar BFC:**
  - IP del gateway VPN de su lado
  - Subnets internas (red de su API)
  - `BFC_BASE_URL` (URL/IP interna del API dentro del túnel)
  - Confirmación del PSK (o si proponen rotación)

### Pago/contacto Luis (developer freelance)
- **Email para correo:** `luisalejandroilarraza@gmail.com`
- **Email de Smart (alterno):** `ejecutivocomercial3@smartfactura.net`
- **Cuenta bancaria:**
  - Banco: Banco Mercantil (Cuenta corriente)
  - Cédula: V-27.985.880
  - Cuenta: `01050640931640031928`
  - Teléfono pago móvil: `0424-2836810`

---

## 10. Histórico con Diego (resumen del WhatsApp)

| Fecha | Hito |
|---|---|
| 27/feb | Diego pide módulo de compras; Luis lo ofrece como freelance ($150/año) aparte de Smart |
| 2/mar | Reunión inicial, pago de $150 confirmado (a BCV, no euro) |
| 4/mar | Diego responde el cuestionario completo (datos de WEFLY, bancos, IVA, etc.) |
| 4/mar | Acuerdo extra: módulo contable + integración bancos, +$60 |
| 10/mar | Notas de crédito listas |
| 11/mar | Extracción tasa Binance P2P documentada (`docs/extraccion-tasa-binance.md`) |
| 16/mar | Luis sale de Smart; transición a Sallyan. Investigación Wave inicia |
| 1/abr | Cuentas conectadas a Wave (Chase, PNC). BFC pendiente |
| 28/abr | BFC manda preguntas técnicas, Diego las reenvía a Luis |
| 29/abr | Luis pide IP pública/router. WEFLY tiene EC2 Amazon |
| 29/abr | Instrucciones para asignar Elastic IP, instalar strongSwan, abrir puertos |
| 29/abr 20:10 | Luis envía `BFC-Proxy-Guia-Instalacion.pdf` |
| 30/abr | Proxy desplegado en EC2, health check OK con `bfc_url: not configured` |
| 30/abr | API key del proxy generada y cargada en ambos lados |
| 4/may | Diego envía Elastic IP final (`3.219.103.87`) + PSK |
| 4/may 16:15 | Luis reenvía el Excel del VPN lleno a Diego |
| 19/may | Reunión con BFC (Meet `tpx-qknn-jzs` a las 6pm). Banco pregunta: *"¿El cliente ya dispone del desarrollo del endpoint?, lo sugerido es realizar la configuración y pruebas de la VPN para realizar las pruebas de las notificaciones"* |
| 19/may | Respuesta planeada: SÍ está listo (proxy + backend). De acuerdo con probar VPN primero. Pendiente que BFC entregue `BFC_BASE_URL` y agende sesión IPSec |

### Conversaciones laterales relevantes
- Luis evalúa dejar su empleo actual; Diego abierto a contratarlo como freelance recurrente (rango propuesto: $300-600/mes según frecuencia)
- Smart se factura separado de Comprar-IA ($1065 con 4 pagos del 25%)
- IMPORTANTE: Diego prefiere que NO se mencione a Luis como autor del módulo cuando hable con su equipo interno o con el banco

---

## 11. Próximos Pasos

### Inmediato (esperando al banco)
1. ⏳ Esperar aprobación de BFC del formulario VPN
2. ⏳ Recibir `BFC_BASE_URL` y datos del gateway IPSec del banco
3. ⏳ Agendar sesión de levantamiento del túnel

### Cuando llegue la info de BFC
4. Configurar `/etc/strongswan/ipsec.conf` con los datos reales
5. `sudo ipsec up bfc` → verificar `ipsec statusall` muestre `ESTABLISHED`
6. Hacer curl desde EC2: `curl https://<BFC_BASE_URL>/health` o equivalente
7. Setear `BFC_BASE_URL` en `/etc/systemd/system/bfc-proxy.service` y reiniciar
8. En Comprar-IA: BFC > Configuración > guardar URL + API key
9. Probar `/api/v1/bfc/test-connection` desde la UI
10. Si BFC manda push notifications: construir endpoint receptor (ver sección 5)

### Mejoras técnicas futuras (no bloqueadoras)
- Reducir aún más el chunk principal (341 kB): lazy-load de pages
- Backup de DB programado (Leapcell no lo da por defecto)
- Logs estructurados a un sink externo (CloudWatch o similar)
- Tests de integración para flujo BFC end-to-end (cuando esté el VPN)
- Endpoint para que el master rote el password de los admins de las orgs (forgot-password real)

---

## 12. Comandos útiles

### Local dev
```bash
# Backend
npm run dev                          # nodemon, requiere .env con JWT_SECRET y DATABASE_URL
npm run migrate                      # corre migraciones
npm run seed                         # corre seed 001 (idempotente)
node --check src/routes/portal.js    # syntax check sin instalar deps

# Frontend
cd frontend && npm run dev           # vite dev en :10000, proxy /api → :7000
cd frontend && npm run build         # genera frontend/dist (commiteable)
```

### EC2 proxy (en `3.219.103.87`)
```bash
sudo systemctl status bfc-proxy
sudo systemctl restart bfc-proxy
sudo journalctl -u bfc-proxy -f
curl http://localhost:3100/health
sudo ipsec statusall                 # cuando el túnel esté configurado
sudo ipsec up bfc
sudo ipsec down bfc
```

### Git
```bash
git log --oneline -10                # ver últimos commits
git push -u origin claude/review-recent-commits-GoXbj
```

---

## 13. Variables de entorno requeridas

Ver `.env.example` para la lista completa. Las críticas:

```bash
DATABASE_URL=postgres://...
JWT_SECRET=<random>
JWT_EXPIRATION=8h
JWT_REFRESH_EXPIRATION=7d
PORT=7000
NODE_ENV=production

# Encriptación de credenciales BFC en DB
ENCRYPTION_KEY=<random 32 bytes>
```

---

## 14. Referencias cruzadas

- `CLAUDE.md` — instrucciones de proyecto para Claude (rules + multi-tenancy summary)
- `docs/API_REFERENCE.md` — endpoints documentados
- `docs/DEPLOYMENT.md` — pasos de deploy
- `docs/MANUAL_USUARIO.md` — manual para usuarios finales
- `docs/extraccion-tasa-binance.md` — script de tasas Binance P2P
- `ec2-bfc-proxy/GUIA-INSTALACION.md` — pasos completos del proxy EC2
- `ec2-bfc-proxy/FORMULARIO-VPN-BFC.md` — datos enviados al banco
- `PROMPT_CLAUDE_CODE_FEATURES_FALTANTES.md` — backlog histórico (puede estar desactualizado)
