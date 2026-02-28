# Comprar-IA - Despliegue GRATIS en Leapcell + Neon (SIN TARJETA)

Guia paso a paso para desplegar Comprar-IA en internet **sin costo mensual y sin tarjeta de credito**.

**Costo total: $0/mes | Tarjeta de credito: NO requerida**

- **Leapcell.io** = hosting del app (Node.js)
- **Neon.tech** = base de datos PostgreSQL

Solo necesitas una cuenta de **GitHub**.

---

## Paso 1: Crear Base de Datos en Neon (ya hecho)

1. Ir a **https://neon.tech**
2. Registrarse con GitHub (no pide tarjeta)
3. Crear proyecto con nombre `comprar_ia`
4. Copiar el **Connection String**. Se ve asi:
   ```
   postgresql://neondb_owner:abc123@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

---

## Paso 2: Crear Servicio en Leapcell (campo por campo)

1. Ir a **https://leapcell.io** y entrar con GitHub
2. Click **"Create Service"**
3. Seleccionar repositorio: **ovavisionve/M-duloCompras**

### Llenar el formulario exactamente asi:

#### Basic

| Campo | Valor |
|-------|-------|
| **Service Name** | `comprar-ia` |
| **Region** | `N. Virginia, US East (AWS us-east-1)` |

#### Build & Run Settings

| Campo | Valor |
|-------|-------|
| **Framework Preset** | `Node.js` |
| **Branch** | `claude/purchases-expenses-module-exCg7` |
| **Root Directory** | *(dejar vacio / como esta por defecto)* |
| **Runtime** | Seleccionar `Node.js` y luego la version mas reciente disponible (18 o 20) |
| **Build Command** | `npm install && cd frontend && npm install && npm run build` |
| **Start Command** | `npm run migrate && npm run seed && npm start` |
| **Serving Port** | `8080` |

#### Environment Variables

Click **"Add Env"** para cada una de estas (una por una):

| KEY | VALUE |
|-----|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *(pegar tu Connection String de Neon del Paso 1)* |
| `PORT` | `8080` |
| `JWT_SECRET` | `ComprarIA2026SecretKeyMuyLarga` |
| `JWT_EXPIRATION` | `8h` |
| `JWT_REFRESH_EXPIRATION` | `7d` |
| `WEBHOOK_SECRET` | `WebhookComprarIA2026Secret` |
| `LOG_LEVEL` | `warn` |

**IMPORTANTE**: El valor de `DATABASE_URL` debe ser el string completo de Neon, incluyendo `?sslmode=require` al final.

**TIP**: Puedes pegar el contenido de un archivo .env en el campo KEY y se agregan todas de golpe. Si prefieres, copia y pega esto en el campo KEY:

```
NODE_ENV=production
DATABASE_URL=AQUI_PEGA_TU_CONNECTION_STRING_DE_NEON
PORT=8080
JWT_SECRET=ComprarIA2026SecretKeyMuyLarga
JWT_EXPIRATION=8h
JWT_REFRESH_EXPIRATION=7d
WEBHOOK_SECRET=WebhookComprarIA2026Secret
LOG_LEVEL=warn
```

(Reemplaza `AQUI_PEGA_TU_CONNECTION_STRING_DE_NEON` por tu string real)

#### Resource

| Campo | Valor |
|-------|-------|
| **Memory and CPU** | El minimo gratuito disponible (256 MB o lo que ofrezca el free tier) |

### Confirmar

Click **"Submit"** o **"Create"** al final de la pagina.

Esperar 3-5 minutos mientras construye y despliega.

---

## Paso 3: Verificar

1. Leapcell te dara una URL como: `https://comprar-ia-xxxxxx.leapcell.dev`
2. Abrir esa URL en el navegador
3. Deberia aparecer la pagina de login de **Comprar-IA**
4. Iniciar sesion con:
   - **Email**: `admin@empresa.com`
   - **Contrasenya**: `admin123`

Si ves el dashboard, ya esta funcionando.

---

## Actualizaciones Automaticas

Cada vez que hagas `git push` a la branch `claude/purchases-expenses-module-exCg7`, Leapcell **despliega automaticamente**.

---

## ALTERNATIVA: Back4app + Neon (si Leapcell falla)

Si Leapcell no funciona, Back4app tambien es gratis sin tarjeta.

### Paso 1: Crear cuenta en Back4app

1. Ir a **https://www.back4app.com**
2. Click **"Sign Up"** con GitHub o Google (no pide tarjeta)

### Paso 2: Crear Container App

1. Ir a **"Containers"** > **"Create New App"**
2. Conectar tu repositorio de GitHub: `ovavisionve/M-duloCompras`
3. Back4app detecta el **Dockerfile** del repositorio automaticamente
4. Configurar:
   - **Port**: `8080`
5. Agregar **Environment Variables** (mismas de arriba, usando DATABASE_URL de Neon)
6. Click **"Deploy"**
7. Esperar que construya la imagen Docker

**Free tier**: 0.25 CPU, 256 MB RAM, 100 GB transferencia/mes

---

## Solucion de Problemas

### "Build failed"
- Revisar los logs de build en la plataforma
- Si dice algo sobre devDependencies, es porque `NODE_ENV=production` elimina las dev. El Dockerfile ya maneja esto correctamente

### "Runtime error" / la app no arranca
- Revisar los runtime logs
- Verificar que DATABASE_URL es correcto y tiene `?sslmode=require` al final
- Verificar que TODAS las variables de entorno estan configuradas

### La base de datos no tiene tablas
- El start command ejecuta `npm run migrate && npm run seed` automaticamente
- Si no funciono, buscar acceso a terminal en la plataforma y ejecutar:
  ```bash
  npm run migrate
  npm run seed
  ```

### La app se "duerme" tras inactividad
- Normal en planes gratis. Tarda unos segundos en despertar cuando alguien entra

---

## Dominio Personalizado (Opcional)

Si quieres usar tu propio dominio (ejemplo: `app.tudominio.com`):

1. En la plataforma, buscar **Custom Domains** o **Domains** en Settings
2. Agregar tu dominio
3. En tu registrador de dominio, agregar un registro CNAME apuntando a la URL que la plataforma indique
4. SSL se genera automaticamente

---

## Costos si Creces

| Necesidad | Solucion | Costo |
|-----------|---------|-------|
| Mas recursos app | Leapcell Pro | Segun uso |
| Mas almacenamiento DB | Neon Launch | $5/mes |
| Sin sleep | Plan pago | $5-10/mes |
