import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [requires2fa, setRequires2fa] = useState(false);
  const [totpToken, setTotpToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const navigate = useNavigate();

  const storeAndNavigate = (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    navigate(data.user.role === 'super_admin' ? '/portal' : '/');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.data.requires_2fa) {
        setTotpToken(data.data.totp_token);
        setRequires2fa(true);
      } else {
        storeAndNavigate(data.data);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(totpCode)) { setError('Ingrese un código de 6 dígitos'); return; }
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/totp-verify', { totp_token: totpToken, code: totpCode });
      storeAndNavigate(data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Código incorrecto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Comprar-IA</h1>
        <p>Gestión Fiscal Inteligente - Venezuela</p>

        {!requires2fa ? (
          <form onSubmit={handleSubmit}>
            {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</div>}
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@empresa.com" required />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Ingresando...' : 'Iniciar Sesión'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleTotpSubmit}>
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontSize: '1.5rem' }}>🔐</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>Verificación en dos pasos</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>Ingrese el código de su app autenticadora</div>
            </div>
            {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</div>}
            <div className="form-group">
              <label>Código de verificación</label>
              <input
                type="text" inputMode="numeric" pattern="\d{6}" maxLength={6}
                value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.35em', fontFamily: 'monospace' }}
                autoFocus required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }} disabled={loading || totpCode.length !== 6}>
              {loading ? 'Verificando...' : 'Verificar'}
            </button>
            <button type="button" onClick={() => { setRequires2fa(false); setTotpCode(''); setError(''); }} style={{ width: '100%', background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', marginTop: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>
              ← Volver al inicio de sesión
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
