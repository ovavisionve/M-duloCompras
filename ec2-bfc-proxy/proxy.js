const express = require('express');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.BFC_PROXY_PORT || 3100;
const API_KEY = process.env.BFC_PROXY_API_KEY || 'CAMBIAR-ESTA-CLAVE-EN-PRODUCCION';
const BFC_BASE_URL = process.env.BFC_BASE_URL || '';

app.use(express.json({ limit: '5mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', bfc_url: BFC_BASE_URL ? 'configured' : 'not configured', timestamp: new Date().toISOString() });
});

app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'API key inválida' });
  }
  next();
});

app.all('/bfc/*', async (req, res) => {
  if (!BFC_BASE_URL) {
    return res.status(500).json({ error: 'BFC_BASE_URL no configurada' });
  }

  const bfcPath = req.path.replace('/bfc', '');
  const targetUrl = `${BFC_BASE_URL}${bfcPath}`;

  try {
    const url = new URL(targetUrl);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const headers = { 'Content-Type': 'application/json' };
    if (req.headers['authorization']) {
      headers['Authorization'] = req.headers['authorization'];
    }

    const body = req.method !== 'GET' ? JSON.stringify(req.body) : null;

    const proxyReq = transport.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: req.method,
      headers,
      timeout: 30000,
    }, (proxyRes) => {
      let data = '';
      proxyRes.on('data', (chunk) => { data += chunk; });
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode);
        try {
          res.json(JSON.parse(data));
        } catch {
          res.send(data);
        }
      });
    });

    proxyReq.on('error', (err) => {
      console.error(`[BFC PROXY ERROR] ${err.message}`);
      res.status(502).json({ error: `Error conectando a BFC: ${err.message}` });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.status(504).json({ error: 'Timeout conectando a BFC' });
    });

    if (body) proxyReq.write(body);
    proxyReq.end();

  } catch (err) {
    console.error(`[BFC PROXY ERROR] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BFC Proxy corriendo en puerto ${PORT}`);
  console.log(`BFC URL: ${BFC_BASE_URL || 'NO CONFIGURADA'}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
