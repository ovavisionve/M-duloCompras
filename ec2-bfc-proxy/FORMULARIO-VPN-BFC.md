# Formulario VPN BFC — Datos de WEFLY 2022, C.A.

Documento de referencia para llenar el Excel "VPN Device Information" que envía
BFC. Los parámetros de Phase 1 y Phase 2 deben coincidir exactamente con los
del banco para que el túnel IPSec se establezca correctamente.

---

## 1. VPN Gateway Device Information

| Campo | Valor a colocar (columna WEFLY 2022, C.A) |
|---|---|
| IP Address | `3.219.103.87` |
| VPN Device Description | `strongSwan 5.x sobre Amazon EC2 (Ubuntu 22.04 LTS)` |

**Lado BFC (ya viene lleno, no tocar):**
- IP Address: `190.202.127.113`
- VPN Device Description: `Fortigate 200F`

---

## 2. VPN Phases configuration

Estos valores deben ser **idénticos** a los del BFC.

### Phase 1

| Tunnel Properties | WEFLY 2022, C.A |
|---|---|
| Authentication Method | PSK |
| Encryption Scheme | IKE v2 |
| Diffie-Hellman Group | 14 |
| Encryption Algorithm | 3DES |
| Hashing Algorithm | SHA256 |
| Main or Aggressive Mode | Main mode preferred |
| Lifetime (for renegotiation) | 28800 seconds |

### Phase 2

| Tunnel Properties | WEFLY 2022, C.A |
|---|---|
| Encapsulation (ESP or AH) | ESP |
| Encryption Algorithm | 3DES |
| Authentication Algorithm | SHA256 |
| Perfect Forward Secrecy | Yes |
| Lifetime (for renegotiation) | 3600 seconds |
| Lifesize in KB (for renegotiation) | Not used |

---

## 3. Firewall Rules Information

Solo necesitamos 1-2 reglas: nuestro EC2 hablando con el endpoint del API BFC.

| Regla | Source IP Address | Destination IP Address | Destination L4 Protocol | Permit/Deny |
|---|---|---|---|---|
| Rule 1 | `3.219.103.87` | `<IP del API BFC — la da el banco>` | TCP / 443 | Permit |
| Rule 2 | `3.219.103.87` | `<IP del API BFC — la da el banco>` | TCP / 80 | Permit |
| Rule 3 | (vacío) | (vacío) | (vacío) | (vacío) |
| Rule 4 | (vacío) | (vacío) | (vacío) | (vacío) |
| Rule 5 | (vacío) | (vacío) | (vacío) | (vacío) |

> Si BFC indica que la subred destino es completa (no una IP única), poner
> `<Subred BFC>` en Destination IP Address (ej: `10.50.0.0/24`).

---

## 4. PSK (Pre-Shared Key)

`<PSK acordado con BFC — ya generado por el equipo, usar el que se compartió>`

**Si todavía no se generó**, en el EC2 ejecutar:
```bash
openssl rand -base64 32
```

Eso genera algo como `K8jYt3dZs6uHcA1eF5iL4nW8jYt3dZs6uHcA1eF5i+Q=`.

⚠️ **Seguridad del PSK:**
- No enviar por el mismo canal donde van las IPs/Excel
- Compartir por canal separado: llamada telefónica, mensaje cifrado, sobre cerrado
- Una vez compartido, guardarlo en el password manager corporativo

---

## 5. Datos pendientes que debe entregar BFC

Para completar la configuración del túnel necesitamos del banco:

- [ ] IP pública del Fortigate BFC (ya la dieron: `190.202.127.113`)
- [ ] Subred interna del banco (la subred destino del túnel)
- [ ] IP del endpoint del API banco dentro de esa subred
- [ ] URL base del API (ej: `http://10.x.x.x/api/v1`)
- [ ] Confirmación del PSK acordado
- [ ] Credenciales del API (usuario, password, cédula/RIF)

---

## 6. Configuración resultante en el EC2

Una vez BFC entregue los datos pendientes, en el EC2 se actualiza:

**`/etc/strongswan/ipsec.conf`** — cambiar para coincidir con los parámetros
del Excel (importante: nuestro template actual usa AES256, hay que cambiarlo
a 3DES + SHA256 + DH14 para igualar a BFC):

```
conn bfc-tunnel
    type=tunnel
    auto=start
    keyexchange=ikev2
    left=%defaultroute
    leftid=3.219.103.87
    leftsubnet=172.31.59.48/32
    right=190.202.127.113
    rightsubnet=<Subred BFC — pendiente que BFC la entregue>
    authby=secret
    ike=3des-sha256-modp2048
    esp=3des-sha256
    ikelifetime=8h
    lifetime=1h
    dpdaction=restart
    dpddelay=30s
    dpdtimeout=120s
```

**`/etc/strongswan/ipsec.secrets`**:
```
3.219.103.87 190.202.127.113 : PSK "<PSK acordado — compartir por canal seguro, no commitear>"
```

**`/etc/systemd/system/bfc-proxy.service`** — actualizar `BFC_BASE_URL`:
```
Environment=BFC_BASE_URL=<URL del API que dé BFC>
```

Luego:
```bash
sudo systemctl daemon-reload
sudo systemctl restart strongswan
sudo systemctl restart bfc-proxy
sudo ipsec statusall   # debe mostrar ESTABLISHED
```
