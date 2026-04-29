# BFC Proxy — Guía de Instalación para EC2

## Qué es esto

Un proxy liviano que corre en el EC2 de WEFLY y permite que Comprar-IA (en Leapcell) se comunique con el API de BFC a través del VPN.

```
Comprar-IA (Leapcell) → EC2 WEFLY (proxy:3100) → VPN IPSec → BFC API
```

## Requisitos previos

- EC2 con Amazon Linux
- Elastic IP asignada al EC2
- Security Group con puertos abiertos:
  - TCP 3100 (entrada) — para el proxy
  - UDP 500 (entrada) — para VPN IKE
  - UDP 4500 (entrada) — para VPN NAT-T
- Node.js instalado (el script lo instala si no está)

## Paso 1: Subir archivos al EC2

```bash
# Desde tu máquina local, copiar la carpeta al EC2:
scp -i tu-llave.pem -r ec2-bfc-proxy/ ec2-user@ELASTIC_IP:/home/ec2-user/bfc-proxy/
```

## Paso 2: Ejecutar instalación

```bash
ssh -i tu-llave.pem ec2-user@ELASTIC_IP
cd /home/ec2-user/bfc-proxy
chmod +x setup.sh
./setup.sh
```

## Paso 3: Configurar variables

```bash
sudo nano /etc/systemd/system/bfc-proxy.service
```

Cambiar estas líneas:

```
Environment=BFC_PROXY_API_KEY=una-clave-segura-que-generes
Environment=BFC_BASE_URL=https://api-bfc-url-que-da-el-banco
```

La `BFC_PROXY_API_KEY` debe ser la misma que se configure en Comprar-IA.

## Paso 4: Iniciar el proxy

```bash
sudo systemctl daemon-reload
sudo systemctl start bfc-proxy
sudo systemctl enable bfc-proxy
```

Verificar:

```bash
curl http://localhost:3100/health
```

Debe responder: `{"status":"ok","bfc_url":"configured",...}`

## Paso 5: Configurar VPN (cuando BFC apruebe)

### 5.1 Editar configuración IPSec

```bash
sudo nano /etc/strongswan/ipsec.conf
```

Reemplazar los placeholders con datos reales:

| Placeholder | Valor |
|-------------|-------|
| `__ELASTIC_IP__` | La Elastic IP del EC2 |
| `__IP_PRIVADA_EC2__` | IP privada del EC2 (hostname -I) |
| `__IP_PUBLICA_BFC__` | IP que BFC proporciona |
| `__SUBRED_BFC__` | Subred del banco (ej: 10.0.0.0/24) |

### 5.2 Configurar clave PSK

```bash
sudo nano /etc/strongswan/ipsec.secrets
```

Reemplazar los placeholders con la IP y clave acordada con BFC.

### 5.3 Iniciar VPN

```bash
sudo systemctl start strongswan
sudo systemctl enable strongswan
sudo ipsec statusall
```

Debe mostrar `ESTABLISHED` en el estado del túnel.

## Paso 6: Configurar en Comprar-IA

En la interfaz de Comprar-IA, ir a **BFC > Configuración** e ingresar:

| Campo | Valor |
|-------|-------|
| URL Base del API | `http://ELASTIC_IP:3100/bfc` |
| Usuario | El usuario que BFC proporcionó |
| Contraseña | La contraseña que BFC proporcionó |
| Cédula | J503159952 (RIF de WEFLY sin guiones) |

La URL apunta al proxy en el EC2, que reenvía todo al BFC real por el VPN.

## Verificación final

1. En Comprar-IA, ir a BFC > Configuración > "Probar conexión"
2. Si responde "Conexión exitosa", todo está funcionando
3. Agregar las cuentas bancarias de BFC y vincularlas
4. Probar importación de movimientos

## Troubleshooting

**El proxy no responde:**
```bash
sudo systemctl status bfc-proxy
sudo journalctl -u bfc-proxy -f
```

**El VPN no conecta:**
```bash
sudo ipsec statusall
sudo journalctl -u strongswan -f
```

**Error de autenticación con BFC:**
- Verificar que el token JWT no haya expirado (se renueva automáticamente)
- Verificar credenciales en Comprar-IA
- Verificar que el VPN esté ESTABLISHED

**El proxy responde pero BFC no:**
- Verificar que el VPN esté activo: `sudo ipsec status`
- Hacer ping a la IP interna de BFC desde el EC2
- Verificar que BFC_BASE_URL en el servicio sea correcta
