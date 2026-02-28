# Comprar-IA - Despliegue GRATIS (Render + Neon)

Guia paso a paso para desplegar Comprar-IA en internet sin costo mensual.

**Costo total: $0/mes**

---

## Paso 1: Crear Base de Datos en Neon (PostgreSQL gratis)

1. Ir a **https://neon.tech**
2. Click **"Sign Up"** (usar cuenta de GitHub)
3. Click **"Create a project"**
4. Configurar:
   - **Project name**: `comprar-ia`
   - **Region**: US East (o el mas cercano)
   - **Database name**: `comprar_ia`
5. Click **"Create Project"**
6. **COPIAR** el **Connection String** que aparece. Se ve asi:
   ```
   postgresql://neondb_owner:abc123xyz@ep-cool-name-12345.us-east-2.aws.neon.tech/comprar_ia?sslmode=require
   ```
   **Guardar este string**, lo necesitaras en el siguiente paso.

---

## Paso 2: Desplegar Backend + Frontend en Render

1. Ir a **https://render.com**
2. Click **"Sign Up"** (usar cuenta de GitHub)
3. Click **"New +"** > **"Web Service"**
4. Conectar tu repositorio de GitHub: `ovavisionve/M-duloCompras`
5. Configurar:
   - **Name**: `comprar-ia`
   - **Region**: US East (mismo que Neon)
   - **Branch**: `main` (o la branch principal)
   - **Runtime**: Node
   - **Build Command**:
     ```
     npm install && cd frontend && npm install && npm run build && cd ..
     ```
   - **Start Command**:
     ```
     npm run migrate && npm run seed && npm start
     ```
   - **Plan**: **Free**

6. Click **"Advanced"** y agregar **Environment Variables**:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | *(pegar el connection string de Neon del Paso 1)* |
   | `JWT_SECRET` | *(inventar una clave larga, ejemplo: MiClaveSecreta2026ComprarIA!@#)* |
   | `JWT_EXPIRATION` | `8h` |
   | `JWT_REFRESH_EXPIRATION` | `7d` |
   | `WEBHOOK_SECRET` | *(inventar otra clave, ejemplo: WebhookSecreto2026!@#)* |
   | `LOG_LEVEL` | `warn` |
   | `PORT` | `7000` |

7. Click **"Create Web Service"**
8. Esperar 3-5 minutos mientras se construye y despliega

---

## Paso 3: Verificar

1. Render te dara una URL como: `https://comprar-ia.onrender.com`
2. Abrir esa URL en el navegador
3. Deberia aparecer la pagina de login de **Comprar-IA**
4. Iniciar sesion con:
   - Email: `admin@empresa.com`
   - Contraseña: `admin123`

---

## Paso 4: Dominio Personalizado (Opcional)

Si quieres usar tu propio dominio (ejemplo: `app.comprar-ia.com`):

1. En Render, ir a tu servicio > **Settings** > **Custom Domains**
2. Agregar tu dominio: `app.comprar-ia.com`
3. En tu registrador de dominio (GoDaddy, Namecheap, etc.), agregar un registro CNAME:
   - **Tipo**: CNAME
   - **Nombre**: `app`
   - **Valor**: `comprar-ia.onrender.com`
4. Render genera certificado SSL automaticamente

---

## Limitaciones del Plan Gratis

| Caracteristica | Limite |
|---------------|--------|
| Render (backend) | Se duerme tras 15 min sin uso, despierta en ~30 seg |
| Neon (database) | 0.5 GB almacenamiento, 190 horas de computo/mes |
| Para 100 docs/mes | Mas que suficiente |

**Nota**: El "despertar" de 30 segundos solo ocurre la primera vez que alguien entra despues de 15 minutos de inactividad. Luego funciona normal hasta que vuelva a estar inactivo.

---

## Actualizar la Aplicacion

Cada vez que hagas `git push` a la branch configurada en Render, **se despliega automaticamente**. No necesitas hacer nada mas.

---

## Solución de Problemas

### "Application error" al abrir la URL
- Ir a Render > tu servicio > **Logs** para ver el error
- Verificar que DATABASE_URL es correcto
- Verificar que todas las variables de entorno estan configuradas

### La base de datos no tiene tablas
- En Render, ir a **Shell** y ejecutar:
  ```bash
  npm run migrate
  npm run seed
  ```

### Cambiar contraseña del admin
- Iniciar sesion con `admin123`
- Ir a un futuro modulo de gestion de usuarios, o cambiar directamente en la base de datos

---

## Costos si Creces

Si en el futuro necesitas mas capacidad:

| Necesidad | Solucion | Costo |
|-----------|---------|-------|
| Sin "despertar" de 30 seg | Render Starter | $7/mes |
| Mas almacenamiento DB | Neon Launch | $19/mes |
| Los dos | Render + Neon pagos | $26/mes |
