# Extraccion de Tasa Binance P2P (USDT/VES)

## Documentacion Tecnica — Comprar-IA

**Cliente:** WEFLY2022 C.A.
**Fecha:** Marzo 2026
**Modulo:** Tesoreria

---

## 1. Que es la "Tasa Binance"

Es el precio al que se compra/vende USDT (dolar digital) por bolivares (VES) en el mercado P2P (persona a persona) de Binance. Es la referencia mas usada en Venezuela para operaciones en dolares fuera del sistema bancario tradicional.

No es una tasa oficial — es un precio de mercado determinado por oferta y demanda entre usuarios de Binance.

---

## 2. De donde se extrae

### Fuente principal: API P2P de Binance

Este es el mismo endpoint que usa internamente la pagina web de Binance cuando uno busca anuncios P2P. Es publico, no requiere API key ni autenticacion, y es el que usan la mayoria de apps venezolanas que muestran "dolar Binance" (MonitorDolar, PyDolarVe, CriptoDolar, DolarToday, etc.).

**URL:**

```
POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search
```

**Headers:**

```
Content-Type: application/json
```

**Body del request:**

```json
{
  "page": 1,
  "rows": 20,
  "payTypes": [],
  "asset": "USDT",
  "tradeType": "SELL",
  "fiat": "VES",
  "publisherType": null,
  "merchantCheck": false
}
```

### Parametros explicados

| Parametro | Valor | Descripcion |
|-----------|-------|-------------|
| `page` | 1 | Pagina de resultados |
| `rows` | 20 | Cantidad de anuncios a consultar |
| `payTypes` | [] | Metodos de pago (vacio = todos) |
| `asset` | "USDT" | Criptomoneda a consultar |
| `tradeType` | "SELL" | Anuncios de venta (precio al que venden USDT por VES) |
| `fiat` | "VES" | Moneda local |
| `publisherType` | null | Tipo de vendedor (null = todos) |
| `merchantCheck` | false | No filtrar solo comerciantes verificados |

### Fuentes de respaldo (fallback)

Si la API de Binance falla (por rate limit, bloqueo geografico, mantenimiento), el sistema consulta automaticamente estas APIs alternativas que agregan la misma informacion:

| Prioridad | URL | Formato respuesta |
|-----------|-----|-------------------|
| 1 | `https://pydolarve.org/api/v1/dollar?monitor=binance` | `{ "price": 74.25 }` |
| 2 | `https://pydolarve.org/api/v1/dollar?monitor=criptodolar` | `{ "price": 74.25 }` |

Estas APIs son GET simples, no requieren autenticacion.

---

## 3. Como se calcula la tasa

1. Se obtienen los **20 anuncios SELL** de USDT/VES con mayor volumen
2. Se extraen los precios de cada anuncio (`ad.adv.price`)
3. Se ordenan de menor a mayor
4. Se toma la **mediana** (el valor del medio)

### Por que mediana y no promedio?

El promedio se distorsiona con un solo anuncio extremo (ej: alguien poniendo USDT a 200 Bs). La mediana ignora esos outliers y refleja el precio real al que la mayoria esta operando.

**Ejemplo con 5 precios:** 72.50, 73.80, 74.25, 74.50, 150.00

- Promedio: 89.01 (distorsionado por el 150)
- Mediana: **74.25** (el precio real del mercado)

---

## 4. Respuesta del endpoint en Comprar-IA

### Request

```
GET /api/v1/exchange-rates/binance
Authorization: Bearer <token>
```

### Response

```json
{
  "success": true,
  "data": {
    "rate_date": "2026-03-10",
    "rate": 74.25,
    "source": "binance_p2p"
  }
}
```

| Campo | Descripcion |
|-------|-------------|
| `rate_date` | Fecha de la consulta |
| `rate` | Tasa en Bs por 1 USDT |
| `source` | Fuente de donde se obtuvo (`binance_p2p` o fallback) |

### Cache

La tasa se almacena en memoria durante **30 minutos**. Dentro de ese periodo, las consultas subsiguientes devuelven el valor cacheado sin volver a llamar a Binance. Despues de 30 minutos, la siguiente consulta refresca el dato.

---

## 5. Codigo de ejemplo

Para quien quiera replicar esta logica en otra aplicacion:

### Node.js

```javascript
const axios = require('axios');

async function getTasaBinance() {
  const { data } = await axios.post(
    'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
    {
      page: 1,
      rows: 20,
      payTypes: [],
      asset: 'USDT',
      tradeType: 'SELL',
      fiat: 'VES',
      publisherType: null,
      merchantCheck: false,
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const prices = data.data
    .map(ad => parseFloat(ad.adv.price))
    .filter(p => !isNaN(p) && p > 0)
    .sort((a, b) => a - b);

  const median = prices[Math.floor(prices.length / 2)];
  return median; // Ej: 74.25 Bs por USDT
}
```

### Python

```python
import requests
import statistics

def get_tasa_binance():
    response = requests.post(
        'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
        json={
            'page': 1,
            'rows': 20,
            'payTypes': [],
            'asset': 'USDT',
            'tradeType': 'SELL',
            'fiat': 'VES',
            'publisherType': None,
            'merchantCheck': False,
        }
    )

    ads = response.json()['data']
    prices = sorted([
        float(ad['adv']['price'])
        for ad in ads
        if float(ad['adv']['price']) > 0
    ])

    return statistics.median(prices)  # Ej: 74.25
```

### cURL (para probar manualmente)

```bash
curl -X POST 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search' \
  -H 'Content-Type: application/json' \
  -d '{
    "page": 1,
    "rows": 20,
    "payTypes": [],
    "asset": "USDT",
    "tradeType": "SELL",
    "fiat": "VES",
    "publisherType": null,
    "merchantCheck": false
  }'
```

---

## 6. Estructura de respuesta de Binance

Cada anuncio en el array `data` tiene esta estructura (campos relevantes):

```json
{
  "adv": {
    "price": "74.25",
    "surplusAmount": "5000.00",
    "maxSingleTransAmount": "50000.00",
    "minSingleTransAmount": "500.00",
    "tradableQuantity": "5000.00",
    "asset": "USDT",
    "fiatUnit": "VES",
    "tradeMethods": [
      { "identifier": "Banesco", "tradeMethodName": "Banesco" },
      { "identifier": "BancoDVenezuela", "tradeMethodName": "Banco de Venezuela" }
    ]
  },
  "advertiser": {
    "nickName": "usuario123",
    "monthOrderCount": 150,
    "monthFinishRate": 0.98,
    "positiveRate": 0.995,
    "userType": "merchant"
  }
}
```

| Campo | Descripcion |
|-------|-------------|
| `adv.price` | Precio en VES por 1 USDT |
| `adv.surplusAmount` | USDT disponibles del vendedor |
| `adv.minSingleTransAmount` | Monto minimo por operacion (VES) |
| `adv.maxSingleTransAmount` | Monto maximo por operacion (VES) |
| `adv.tradeMethods` | Bancos/metodos de pago aceptados |
| `advertiser.monthOrderCount` | Operaciones del vendedor en el mes |
| `advertiser.monthFinishRate` | % de operaciones completadas |
| `advertiser.positiveRate` | % de valoraciones positivas |

---

## 7. Consideraciones importantes

### Disponibilidad
- El endpoint de Binance es estable pero **no tiene SLA garantizado** — es una API interna no documentada oficialmente
- PyDolarVe sirve como respaldo confiable

### Rate limits
- Binance no publica limites especificos para este endpoint
- En la practica, consultas cada 5-10 minutos no generan problemas
- Comprar-IA cachea por 30 minutos para no abusar

### Precision
- La tasa Binance P2P **no es igual a la tasa BCV** — puede tener un spread de 1-5%
- La tasa BCV es la oficial para efectos fiscales (libros de compras, retenciones)
- La tasa Binance es referencial para operaciones de tesoreria

### Diferencia con la tasa BCV

| | Tasa BCV | Tasa Binance P2P |
|--|---------|-----------------|
| **Fuente** | Banco Central de Venezuela | Mercado P2P Binance |
| **Uso fiscal** | Si (obligatorio) | No |
| **Uso operativo** | Referencia oficial | Referencia de mercado |
| **Actualizacion** | 1 vez al dia (~1pm) | Tiempo real |
| **Modulo en Comprar-IA** | Compras y Gastos | Tesoreria |

---

## 8. Endpoints disponibles en Comprar-IA

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| `GET` | `/api/v1/exchange-rates/today` | Tasa BCV del dia |
| `GET` | `/api/v1/exchange-rates/binance` | Tasa Binance P2P actual |
| `POST` | `/api/v1/exchange-rates/fetch` | Forzar consulta BCV |
| `POST` | `/api/v1/exchange-rates/manual` | Registrar tasa manual |
| `GET` | `/api/v1/exchange-rates?from=X&to=Y` | Historico por rango |

---

*Documento generado por Comprar-IA — Modulo de Compras y Gastos*
*WEFLY2022 C.A. — Marzo 2026*
