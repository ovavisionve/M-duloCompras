# Comprar-IA - Despliegue GRATIS en Koyeb (SIN TARJETA)

Guia paso a paso para desplegar Comprar-IA en internet **sin costo mensual y sin tarjeta de credito**.

**Costo total: $0/mes | Tarjeta de credito: NO requerida**

Koyeb incluye hosting + PostgreSQL gratis. Solo necesitas una cuenta de GitHub.

---

## Paso 1: Crear cuenta en Koyeb

1. Ir a **https://www.koyeb.com**
2. Click **"Get started for free"**
3. Registrarse con tu cuenta de **GitHub** (no pide tarjeta)
4. Completar el registro

---

## Paso 2: Crear la Base de Datos PostgreSQL

Koyeb incluye **1 base de datos PostgreSQL gratis**.

1. En el panel de Koyeb, ir a **"Databases"** en el menu lateral
2. Click **"Create Database Service"**
3. Configurar:
   - **Name**: `comprar-ia-db`
   - **Region**: Washington, D.C. (us-east) o el mas cercano
   - **Engine**: PostgreSQL
4. Click **"Create"**
5. Una vez creada, click en la base de datos y copiar el **Connection String**. Se ve asi:
   ```
   postgresql://koyeb-adm:xxxxx@ep-xxxxx.us-east-2.aws.neon.tech/koyebdb?sslmode=require
   ```
   **Guardar este string** para el siguiente paso.

---

## Paso 3: Desplegar la Aplicacion

1. En Koyeb, ir a **"Apps"** > **"Create App"**
2. Seleccionar **"GitHub"** como fuente
3. Conectar tu cuenta de GitHub si no lo has hecho
4. Buscar y seleccionar el repositorio: **`ovavisionve/M-duloCompras`**
5. Configurar el servicio:

### Seccion: Source

   - **Branch**: `main`
   - **Builder**: Buildpack (detecta Node.js automaticamente)

### Seccion: Build

   - Click **"Override"** en Build command y escribir:
     ```
     npm install && cd frontend && npm install && npm run build
     ```

### Seccion: Run

   - Click **"Override"** en Run command y escribir:
     ```
     npm run migrate && npm run seed && npm start
     ```

### Seccion: Environment Variables

   Click **"Add Variable"** para cada una:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | *(pegar el Connection String del Paso 2)* |
   | `PORT` | `8000` |
   | `JWT_SECRET` | `MiClaveSecreta2026ComprarIA` *(inventar algo largo)* |
   | `JWT_EXPIRATION` | `8h` |
   | `JWT_REFRESH_EXPIRATION` | `7d` |
   | `WEBHOOK_SECRET` | `WebhookSecreto2026` *(inventar algo largo)* |
   | `LOG_LEVEL` | `warn` |

   **Tip**: Para DATABASE_URL y JWT_SECRET puedes usar tipo **Secret** para mayor seguridad.

### Seccion: Exposing your service

   - **Port**: `8000`
   - **Protocol**: HTTP

### Nombre

   - **App name**: `comprar-ia`
   - **Service name**: `web`

6. Click **"Deploy"**
7. Esperar 3-5 minutos mientras se construye

---

## Paso 4: Verificar

1. Koyeb te dara una URL como: `https://comprar-ia-tu-org.koyeb.app`
2. Abrir esa URL en el navegador
3. Deberia aparecer la pagina de login de **Comprar-IA**
4. Iniciar sesion con:
   - **Email**: `admin@empresa.com`
   - **Contraseña**: `admin123`

Si ves el dashboard, ya esta funcionando.

---

## Paso 5: Dominio Personalizado (Opcional)

Si quieres usar tu propio dominio (ejemplo: `app.comprar-ia.com`):

1. En Koyeb, ir a tu App > **Settings** > **Domains**
2. Click **"Add Custom Domain"**
3. Escribir: `app.comprar-ia.com`
4. En tu registrador de dominio (GoDaddy, Namecheap, etc.), agregar un registro CNAME:
   - **Tipo**: CNAME
   - **Nombre**: `app`
   - **Valor**: *(el valor que Koyeb te indique)*
5. Koyeb genera certificado SSL automaticamente

---

## Limitaciones del Plan Gratis

| Caracteristica | Limite |
|---------------|--------|
| Web Services | 1 servicio (suficiente) |
| PostgreSQL | 1 base de datos incluida |
| Escalado | Eco instance (compartida) |
| Sleep | Se duerme tras inactividad, despierta en segundos |
| Para ~100 docs/mes | Mas que suficiente |

---

## Actualizar la Aplicacion

Cada vez que hagas `git push` a la branch configurada en Koyeb, **se despliega automaticamente**. No necesitas hacer nada mas.

---

## Solucion de Problemas

### "Build failed"
- Ir a Koyeb > tu App > **Deployments** > click en el deployment fallido
- Revisar los **Build logs** para ver el error
- Errores comunes: falta alguna variable de entorno, o el repositorio no es publico

### "Runtime error" (la app no arranca)
- Revisar **Runtime logs** en Koyeb
- Verificar que DATABASE_URL es correcto (copiar de nuevo desde la seccion Databases)
- Verificar que todas las variables de entorno estan configuradas

### La base de datos no tiene tablas
- En Koyeb, ir a tu servicio > **Terminal** (o usar la Koyeb CLI):
  ```bash
  npm run migrate
  npm run seed
  ```

### La app se "duerme"
- Es normal en el plan gratis. Cuando alguien entra despues de inactividad, tarda unos segundos en despertar. Luego funciona normal.

---

## Alternativa: Back4app (si Koyeb da problemas)

Back4app tambien ofrece hosting gratis sin tarjeta:
- **URL**: https://www.back4app.com
- **Free tier**: 256 MB RAM, 100 GB transferencia, 600 horas activas/mes
- **Proceso**: Similar, se despliega desde GitHub con Dockerfile
- Para la base de datos, usar **Neon** (https://neon.tech) que tambien es gratis sin tarjeta

---

## Costos si Creces

Si en el futuro necesitas mas capacidad:

| Necesidad | Solucion | Costo |
|-----------|---------|-------|
| Sin limites de sleep | Koyeb Starter | ~$7/mes |
| Mas almacenamiento DB | Koyeb DB upgrade | Segun uso |
| Mucho trafico | Koyeb Pro | ~$79/mes |
