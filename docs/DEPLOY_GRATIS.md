# Comprar-IA - Despliegue GRATIS (SIN TARJETA DE CREDITO)

Guia paso a paso para desplegar Comprar-IA en internet **sin costo mensual y sin tarjeta de credito**.

**Costo total: $0/mes | Tarjeta de credito: NO requerida**

Solo necesitas una cuenta de **GitHub**.

---

## OPCION A: Leapcell.io (RECOMENDADA)

Leapcell incluye Node.js hosting + PostgreSQL gratis, todo en una sola plataforma.

### Paso 1: Crear cuenta

1. Ir a **https://leapcell.io**
2. Click **"Get Started"** o **"Sign Up"**
3. Registrarse con tu cuenta de **GitHub** (no pide tarjeta)

### Paso 2: Crear la Base de Datos PostgreSQL

1. En el panel de Leapcell, click **"Create Database"**
2. Configurar:
   - **Name**: `comprar-ia-db`
   - **Region**: el mas cercano disponible
3. Click **"Create"**
4. En la pagina que aparece, **copiar la informacion de conexion**:
   - Host, Port, Database, User, Password
   - O el **Connection String** completo, que se ve asi:
     ```
     postgresql://usuario:password@host:5432/nombre_db?sslmode=require
     ```
5. **Guardar este string** para el siguiente paso

### Paso 3: Subir el codigo a GitHub

Asegurate de que tu repositorio en GitHub (`ovavisionve/M-duloCompras`) tiene los ultimos cambios:
```bash
git push origin main
```

### Paso 4: Crear el Servicio Web

1. En Leapcell, click **"Create Service"** o **"New Service"**
2. Conectar tu cuenta de GitHub si no lo has hecho
3. Seleccionar el repositorio: **`ovavisionve/M-duloCompras`**
4. Leapcell detecta automaticamente que es Node.js
5. Configurar:

#### Build Command (si permite personalizar):
```
npm install && cd frontend && npm install && npm run build
```

#### Start Command:
```
npm run migrate && npm run seed && npm start
```

#### Environment Variables:

Agregar las siguientes variables de entorno:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *(pegar el Connection String del Paso 2)* |
| `PORT` | `8080` |
| `JWT_SECRET` | *(inventar una clave larga, ej: MiClaveSecreta2026ComprarIA!@#)* |
| `JWT_EXPIRATION` | `8h` |
| `JWT_REFRESH_EXPIRATION` | `7d` |
| `WEBHOOK_SECRET` | *(inventar otra clave, ej: WebhookSecreto2026!@#)* |
| `LOG_LEVEL` | `warn` |

**Nota sobre SSL**: La conexion a PostgreSQL en Leapcell requiere SSL. Esto ya esta configurado en el codigo (knexfile.js tiene `ssl: { rejectUnauthorized: false }` en produccion).

6. Click **"Submit"** / **"Deploy"**
7. Esperar 3-5 minutos mientras se construye

### Paso 5: Verificar

1. Leapcell te dara una URL como: `https://comprar-ia.leapcell.dev`
2. Abrir esa URL en el navegador
3. Deberia aparecer la pagina de login de **Comprar-IA**
4. Iniciar sesion con:
   - **Email**: `admin@empresa.com`
   - **Contraseña**: `admin123`

### Actualizar la Aplicacion

Cada vez que hagas `git push`, **Leapcell despliega automaticamente** (GitOps).

---

## OPCION B: Back4app + Neon (ALTERNATIVA)

Si Leapcell da problemas, esta combinacion tambien es gratis sin tarjeta.

### Paso 1: Crear Base de Datos en Neon

1. Ir a **https://neon.tech**
2. Click **"Sign Up"** con cuenta de GitHub (no pide tarjeta)
3. Click **"Create a project"**
4. Configurar:
   - **Project name**: `comprar-ia`
   - **Database name**: `comprar_ia`
5. **Copiar el Connection String** que aparece

### Paso 2: Desplegar en Back4app

1. Ir a **https://www.back4app.com**
2. Click **"Sign Up"** con GitHub o Google (no pide tarjeta)
3. Ir a **"Containers"** > **"Create New App"**
4. Conectar tu repositorio de GitHub
5. Configurar:
   - **Port**: `8080`
   - Agregar las **Environment Variables** (misma tabla de arriba, usando el DATABASE_URL de Neon)
6. Click **"Deploy"**
7. Esperar que construya la imagen Docker (usa el Dockerfile del repositorio)

**Free tier de Back4app**: 0.25 CPU, 256 MB RAM, 100 GB transferencia/mes
**Free tier de Neon**: 0.5 GB almacenamiento, 100 CU-hours/mes

---

## OPCION C: Hugging Face Spaces (PARA EXPERIMENTAR)

Hugging Face permite correr contenedores Docker gratis sin tarjeta.

1. Ir a **https://huggingface.co**
2. Crear cuenta (gratis, sin tarjeta)
3. Click **"New Space"**
4. Seleccionar **"Docker"** como SDK
5. Subir los archivos del proyecto (o conectar GitHub)
6. El Dockerfile del repositorio se encarga del resto

---

## Dominio Personalizado (Opcional, cualquier opcion)

Si quieres usar tu propio dominio (ejemplo: `app.comprar-ia.com`):

1. En la plataforma elegida, buscar la opcion de **Custom Domains**
2. Agregar tu dominio
3. En tu registrador de dominio, agregar un registro CNAME:
   - **Tipo**: CNAME
   - **Nombre**: `app`
   - **Valor**: *(la URL que la plataforma te indique)*
4. Se genera certificado SSL automaticamente

---

## Comparativa de Opciones

| | Leapcell | Back4app + Neon | HF Spaces |
|--|----------|----------------|-----------|
| Tarjeta | NO | NO | NO |
| PostgreSQL incluido | SI | Neon aparte | NO (Neon aparte) |
| Deploy desde GitHub | SI | SI | SI |
| SSL automatico | SI | SI | SI |
| RAM gratis | Generoso | 256 MB | 16 GB CPU |
| Ideal para | Produccion ligera | Contenedores | Demos/pruebas |

---

## Solucion de Problemas

### "Build failed"
- Revisar los logs de build en la plataforma
- Error comun: `NODE_ENV=production` hace que se eliminen devDependencies. Si el build del frontend necesita alguna, moverla a dependencies

### "Runtime error" / la app no arranca
- Revisar los runtime logs
- Verificar que DATABASE_URL es correcto y tiene `?sslmode=require`
- Verificar que todas las variables de entorno estan configuradas

### La base de datos no tiene tablas
- El start command (`npm run migrate && npm run seed`) deberia crearlas automaticamente
- Si no funciono, buscar acceso a terminal/shell en la plataforma y ejecutar:
  ```bash
  npm run migrate
  npm run seed
  ```

### La app se "duerme" tras inactividad
- Es normal en planes gratis. Cuando alguien entra, tarda unos segundos en despertar

---

## Costos si Creces

| Necesidad | Solucion | Costo aproximado |
|-----------|---------|-----------------|
| Mas recursos | Leapcell Pro | Segun uso |
| Base de datos mas grande | Neon Launch | $5/mes |
| Sin limites de sleep | Plan pago en cualquier plataforma | $5-10/mes |
