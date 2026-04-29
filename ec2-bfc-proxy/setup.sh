#!/bin/bash
# ============================================================
# Script de instalación — BFC Proxy + VPN para Comprar-IA
# Ejecutar en el EC2 de WEFLY (Amazon Linux)
# ============================================================

set -e

echo "=== Instalando dependencias del sistema ==="
sudo yum update -y
sudo yum install -y strongswan nodejs npm

echo ""
echo "=== Instalando BFC Proxy ==="
mkdir -p /home/ec2-user/bfc-proxy
cp proxy.js /home/ec2-user/bfc-proxy/
cp package.json /home/ec2-user/bfc-proxy/
cd /home/ec2-user/bfc-proxy
npm install --production

echo ""
echo "=== Configurando servicio systemd ==="
sudo cp /home/ec2-user/bfc-proxy/bfc-proxy.service /etc/systemd/system/bfc-proxy.service

echo ""
echo "============================================================"
echo "  INSTALACIÓN COMPLETADA"
echo "============================================================"
echo ""
echo "  ANTES DE INICIAR, editar las variables en el servicio:"
echo ""
echo "    sudo nano /etc/systemd/system/bfc-proxy.service"
echo ""
echo "  Cambiar:"
echo "    BFC_PROXY_API_KEY  → clave segura (la misma que en Comprar-IA)"
echo "    BFC_BASE_URL       → URL del API de BFC (la da el banco)"
echo ""
echo "  Luego iniciar:"
echo ""
echo "    sudo systemctl daemon-reload"
echo "    sudo systemctl start bfc-proxy"
echo "    sudo systemctl enable bfc-proxy"
echo ""
echo "  Verificar:"
echo ""
echo "    curl http://localhost:3100/health"
echo ""
echo "============================================================"
echo ""
echo "  PARA EL VPN (después de que BFC apruebe):"
echo ""
echo "    1. Editar /etc/strongswan/ipsec.conf con los datos reales"
echo "    2. Editar /etc/strongswan/ipsec.secrets con el PSK"
echo "    3. sudo systemctl start strongswan"
echo "    4. sudo systemctl enable strongswan"
echo "    5. Verificar: sudo ipsec statusall"
echo ""
echo "============================================================"
