import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ImpersonateLanding() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const user = params.get('user');

    if (token && user) {
      try {
        JSON.parse(user); // validate JSON before storing
        localStorage.setItem('token', token);
        localStorage.setItem('user', user);
        navigate('/', { replace: true });
      } catch {
        navigate('/login', { replace: true });
      }
    } else {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#64748b', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.9rem' }}>Cargando sesión de soporte…</span>
    </div>
  );
}
