# Comprar-IA - Guía de Despliegue

## Opciones de Despliegue

### Opción Recomendada: VPS (Servidor Virtual Privado)

**Por qué NO Vercel**: Vercel está diseñado para aplicaciones frontend/serverless. Comprar-IA tiene un backend con PostgreSQL, archivos de uploads, PDFs generados, y jobs programados (cron) que necesitan un servidor persistente. Vercel no soporta esto.

**Proveedores recomendados**:
| Proveedor | Plan mínimo | Precio aprox. |
|-----------|------------|---------------|
| DigitalOcean | Droplet Basic | $6-12/mes |
| Hetzner | CX22 | $4-8/mes |
| Contabo | VPS S | $5-7/mes |
| Linode (Akamai) | Nanode | $5/mes |
| Railway.app | Starter | $5/mes + uso |
| Render.com | Starter | $7/mes |

### Opción Alternativa: Railway.app (más fácil)

Railway permite desplegar backend + PostgreSQL con mínima configuración. Es ideal si quieres algo rápido sin administrar servidores.

---

## Despliegue en VPS (DigitalOcean/Hetzner/Contabo)

### 1. Preparar el Servidor

```bash
# Conectar al servidor
ssh root@TU_IP_DEL_SERVIDOR

# Actualizar sistema
apt update && apt upgrade -y

# Instalar Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Instalar PostgreSQL
apt install -y postgresql postgresql-contrib

# Instalar nginx (proxy reverso)
apt install -y nginx

# Instalar PM2 (gestor de procesos Node.js)
npm install -g pm2

# Instalar certbot para SSL
apt install -y certbot python3-certbot-nginx
```

### 2. Configurar PostgreSQL

```bash
# Entrar a PostgreSQL
sudo -u postgres psql

# Crear usuario y base de datos
CREATE USER comprar_ia WITH PASSWORD 'contraseña_segura_aqui';
CREATE DATABASE comprar_ia OWNER comprar_ia;
GRANT ALL PRIVILEGES ON DATABASE comprar_ia TO comprar_ia;
\q
```

### 3. Desplegar la Aplicación

```bash
# Crear usuario de aplicación
useradd -m -s /bin/bash comprar-ia
su - comprar-ia

# Clonar repositorio
git clone https://github.com/ovavisionve/M-duloCompras.git comprar-ia
cd comprar-ia

# Instalar dependencias
npm install --production

# Configurar variables de entorno
cp .env.example .env
nano .env
```

Configurar `.env` para producción:
```env
# Base de Datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=comprar_ia
DB_USER=comprar_ia
DB_PASSWORD=contraseña_segura_aqui

# JWT - CAMBIAR POR VALORES SEGUROS
JWT_SECRET=generar_clave_aleatoria_de_64_caracteres
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d

# Servidor
PORT=7000
NODE_ENV=production
CORS_ORIGINS=https://tudominio.com

# Logs
LOG_LEVEL=warn
LOG_DIR=./logs
```

```bash
# Ejecutar migraciones
npm run migrate

# Ejecutar seeds (datos iniciales)
npm run seed

# Construir frontend
cd frontend
npm install
npm run build
cd ..

# Crear directorio para uploads
mkdir -p uploads logs
```

### 4. Configurar PM2 (Proceso en Segundo Plano)

```bash
# Crear archivo de configuración PM2
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'comprar-ia',
    script: 'src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
EOF

# Iniciar con PM2
pm2 start ecosystem.config.js

# Guardar para reinicio automático
pm2 save
pm2 startup
```

### 5. Configurar Nginx (Proxy Reverso + Frontend)

```bash
# Volver a root
exit

# Crear configuración nginx
nano /etc/nginx/sites-available/comprar-ia
```

Contenido:
```nginx
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;

    # Frontend (archivos estáticos de React)
    root /home/comprar-ia/comprar-ia/frontend/dist;
    index index.html;

    # API Backend
    location /api/ {
        proxy_pass http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # Swagger docs
    location /api-docs {
        proxy_pass http://127.0.0.1:7000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Uploads
    location /uploads/ {
        alias /home/comprar-ia/comprar-ia/uploads/;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:7000;
    }

    # Frontend SPA - todas las rutas van al index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
# Activar sitio
ln -s /etc/nginx/sites-available/comprar-ia /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default

# Verificar y reiniciar nginx
nginx -t
systemctl restart nginx

# Instalar certificado SSL (HTTPS)
certbot --nginx -d tudominio.com -d www.tudominio.com
```

### 6. Configurar Firewall

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

---

## Despliegue en Railway.app (Más Fácil)

### 1. Crear Cuenta
Ir a [railway.app](https://railway.app) y crear cuenta con GitHub.

### 2. Nuevo Proyecto
1. Click "New Project"
2. Seleccionar "Deploy from GitHub Repo"
3. Seleccionar el repo `ovavisionve/M-duloCompras`

### 3. Agregar PostgreSQL
1. Click "New" dentro del proyecto
2. Seleccionar "Database" > "Add PostgreSQL"
3. Railway conectará la variable `DATABASE_URL` automáticamente

### 4. Variables de Entorno
Agregar en Settings > Variables:
```
NODE_ENV=production
PORT=7000
JWT_SECRET=tu_clave_secreta
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGINS=https://tu-app.up.railway.app
```

### 5. Configurar Start Command
En Settings > Deploy:
- Build Command: `npm install && npm run migrate && npm run seed && cd frontend && npm install && npm run build`
- Start Command: `npm start`

### 6. Dominio Personalizado
Railway genera un dominio `.up.railway.app` automáticamente. Puedes agregar tu dominio en Settings > Networking.

---

## Despliegue en Render.com

### 1. Web Service (Backend)
1. Crear cuenta en [render.com](https://render.com)
2. New > Web Service > Conectar repo GitHub
3. Build Command: `npm install && npm run migrate && cd frontend && npm install && npm run build`
4. Start Command: `npm start`
5. Agregar variables de entorno (mismas que Railway)

### 2. Base de Datos
1. New > PostgreSQL
2. Copiar la URL interna de conexión
3. Agregar como variable `DATABASE_URL` en el Web Service

---

## Modelo Multi-Tenant (para Vender a Múltiples Clientes)

Para vender Comprar-IA a múltiples empresas, hay dos opciones:

### Opción A: Una Instancia por Cliente
- Cada cliente tiene su propio servidor/base de datos
- Más aislamiento y seguridad
- Costo: $5-12/mes por cliente
- **Recomendado para empezar**

### Opción B: Multi-Tenant (Base de Datos Compartida)
- Todos los clientes en una misma instancia
- Agregar `tenant_id` a todas las tablas
- Menor costo por cliente
- Requiere desarrollo adicional

### Precios Sugeridos para Clientes
| Plan | Usuarios | Precio sugerido |
|------|----------|----------------|
| Básico | 1-3 usuarios | $29-49/mes |
| Profesional | 4-10 usuarios | $79-129/mes |
| Empresarial | Ilimitados | $199-299/mes |

---

## Checklist de Producción

- [ ] Cambiar contraseñas por defecto de todos los usuarios
- [ ] Generar JWT_SECRET seguro (`openssl rand -hex 64`)
- [ ] Configurar CORS_ORIGINS con el dominio correcto
- [ ] Activar HTTPS con certificado SSL
- [ ] Configurar backups automáticos de PostgreSQL
- [ ] Cambiar LOG_LEVEL a "warn" en producción
- [ ] Configurar dominio personalizado
- [ ] Probar todos los módulos antes de entregar al cliente

## Backup Automático de Base de Datos

```bash
# Crear script de backup
cat > /home/comprar-ia/backup.sh << 'SCRIPT'
#!/bin/bash
FECHA=$(date +%Y%m%d_%H%M%S)
pg_dump -U comprar_ia comprar_ia > /home/comprar-ia/backups/comprar_ia_$FECHA.sql
# Eliminar backups de más de 30 días
find /home/comprar-ia/backups -name "*.sql" -mtime +30 -delete
SCRIPT

chmod +x /home/comprar-ia/backup.sh
mkdir -p /home/comprar-ia/backups

# Programar backup diario a las 2am
(crontab -l 2>/dev/null; echo "0 2 * * * /home/comprar-ia/backup.sh") | crontab -
```

## Actualizar la Aplicación

```bash
cd /home/comprar-ia/comprar-ia
git pull origin main
npm install --production
npm run migrate
cd frontend && npm install && npm run build && cd ..
pm2 restart comprar-ia
```
