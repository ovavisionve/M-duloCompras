import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, FileText, BarChart3, Plus, LogOut, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, ChevronRight, ChevronLeft,
  Eye, EyeOff, Pencil, ToggleLeft, ToggleRight, User, Shield,
  X, Check, Key
} from 'lucide-react';

const API = '/api/v1/portal';
const h = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

const ROLES = ['admin', 'contador', 'tesorero', 'operador', 'auditor'];

// ─── TOP-LEVEL PAGE ────────────────────────────────────────────────
export default function Portal() {
  const navigate = useNavigate();
  const masterUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [stats, setStats] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showWizard, setShowWizard] = useState(false);
  const [editOrg, setEditOrg] = useState(null);
  const [usersOrg, setUsersOrg] = useState(null);

  const flash = (msg, type = 'success') => {
    if (type === 'success') { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 6000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, orgsRes] = await Promise.all([
        fetch(`${API}/stats`, { headers: h() }),
        fetch(`${API}/organizations`, { headers: h() }),
      ]);
      const sd = await statsRes.json();
      const od = await orgsRes.json();
      if (sd.success) setStats(sd.data);
      if (od.success) setOrgs(od.data);
    } catch {
      setError('Error cargando datos del portal');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const toggleActive = async (org) => {
    try {
      const res = await fetch(`${API}/organizations/${org.id}`, {
        method: 'PATCH', headers: h(),
        body: JSON.stringify({ is_active: !org.is_active }),
      });
      const data = await res.json();
      if (!data.success) return flash(data.error?.message || 'Error', 'error');
      flash(org.is_active ? 'Organización desactivada' : 'Organización activada');
      load();
    } catch { flash('Error de conexión', 'error'); }
  };

  const onWizardDone = (result) => {
    setShowWizard(false);
    flash(`Organización "${result.organization.name}" creada. Admin: ${result.admin_user.email}`);
    load();
  };

  const onEditDone = () => {
    setEditOrg(null);
    flash('Organización actualizada');
    load();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ background: '#1e293b', color: '#fff', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Shield size={20} style={{ color: '#60a5fa' }} />
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>Comprar-IA</span>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>/ Portal Master</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.85rem' }}>
          <span style={{ color: '#94a3b8' }}>{masterUser.email}</span>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <LogOut size={16} /> Salir
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* Alerts */}
        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626', fontSize: '0.85rem' }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        {success && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#16a34a', fontSize: '0.85rem' }}>
            <CheckCircle size={16} /> {success}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { label: 'Organizaciones', value: stats.organizations_total, icon: Building2, color: '#2563eb' },
              { label: 'Activas', value: stats.organizations_active, icon: CheckCircle, color: '#16a34a' },
              { label: 'Usuarios', value: stats.users_total, icon: Users, color: '#7c3aed' },
              { label: 'Facturas', value: stats.invoices_total, icon: FileText, color: '#d97706' },
              { label: 'Proveedores', value: stats.suppliers_total, icon: BarChart3, color: '#0891b2' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.25rem', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>{label}</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color }}>{value}</div>
                  </div>
                  <Icon size={28} style={{ color, opacity: 0.25 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Organizations table */}
        <div style={{ background: '#fff', borderRadius: '0.75rem', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Organizaciones</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={load} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '0.375rem', padding: '0.4rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#64748b' }}>
                <RefreshCw size={14} /> Actualizar
              </button>
              <button onClick={() => setShowWizard(true)} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.4rem 0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 500 }}>
                <Plus size={15} /> Nueva organización
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Cargando...</div>
          ) : orgs.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              <Building2 size={40} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
              <p>No hay organizaciones. Crea la primera.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {['Organización', 'RIF', 'Slug', 'Usuarios', 'Facturas', 'Estado', 'Acciones'].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr key={org.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{org.name}</div>
                      <div style={{ fontSize: '0.73rem', color: '#94a3b8' }}>{org.id.slice(0, 8)}…</div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.85rem', fontFamily: 'monospace' }}>{org.rif || '—'}</td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span style={{ background: '#f1f5f9', borderRadius: '0.25rem', padding: '0.15rem 0.5rem', fontSize: '0.78rem', fontFamily: 'monospace' }}>{org.slug}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>{org.user_count}</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>{org.invoice_count}</td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      {org.is_active ? (
                        <span style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 500 }}>Activa</span>
                      ) : (
                        <span style={{ background: '#f8fafc', color: '#94a3b8', borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 500 }}>Inactiva</span>
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button title="Usuarios" onClick={() => setUsersOrg(org)} style={iconBtn}>
                          <Users size={14} />
                        </button>
                        <button title="Editar" onClick={() => setEditOrg(org)} style={iconBtn}>
                          <Pencil size={14} />
                        </button>
                        <button title={org.is_active ? 'Desactivar' : 'Activar'} onClick={() => toggleActive(org)} style={{ ...iconBtn, color: org.is_active ? '#dc2626' : '#16a34a' }}>
                          {org.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {showWizard && (
        <OrgWizard onDone={onWizardDone} onClose={() => setShowWizard(false)} flash={flash} />
      )}
      {editOrg && (
        <EditOrgModal org={editOrg} onDone={onEditDone} onClose={() => setEditOrg(null)} flash={flash} />
      )}
      {usersOrg && (
        <UsersModal org={usersOrg} onClose={() => setUsersOrg(null)} flash={flash} />
      )}
    </div>
  );
}

const iconBtn = {
  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.375rem',
  padding: '0.35rem 0.5rem', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center',
};

// ─── WIZARD ────────────────────────────────────────────────────────
function OrgWizard({ onDone, onClose, flash }) {
  const [step, setStep] = useState(1);
  const [org, setOrg] = useState({ name: '', rif: '', address: '', slug: '' });
  const [admin, setAdmin] = useState({ email: '', password: '', full_name: '' });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const steps = [
    { n: 1, label: 'Empresa' },
    { n: 2, label: 'Administrador' },
    { n: 3, label: 'Confirmar' },
  ];

  const validateStep1 = () => {
    const e = {};
    if (!org.name.trim()) e.name = 'Requerido';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e = {};
    if (!admin.email.trim()) e.email = 'Requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email)) e.email = 'Email inválido';
    if (!admin.full_name.trim()) e.full_name = 'Requerido';
    if (!admin.password || admin.password.length < 8) e.password = 'Mínimo 8 caracteres';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => s + 1);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/organizations`, {
        method: 'POST', headers: h(),
        body: JSON.stringify({
          name: org.name,
          rif: org.rif || undefined,
          address: org.address || undefined,
          slug: org.slug || undefined,
          admin_email: admin.email,
          admin_password: admin.password,
          admin_full_name: admin.full_name,
        }),
      });
      const data = await res.json();
      if (!data.success) { flash(data.error?.message || 'Error creando organización', 'error'); setSaving(false); return; }
      onDone(data.data);
    } catch { flash('Error de conexión', 'error'); setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ width: '520px' }}>
        {/* Wizard header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Nueva organización</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '2rem' }}>
          {steps.map((s, i) => (
            <React.Fragment key={s.n}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: step > s.n ? '#2563eb' : step === s.n ? '#2563eb' : '#e2e8f0',
                  color: step >= s.n ? '#fff' : '#94a3b8', fontSize: '0.85rem', fontWeight: 600,
                }}>
                  {step > s.n ? <Check size={14} /> : s.n}
                </div>
                <div style={{ fontSize: '0.72rem', color: step === s.n ? '#2563eb' : '#94a3b8', marginTop: '0.3rem', fontWeight: step === s.n ? 600 : 400 }}>{s.label}</div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: '2px', background: step > s.n ? '#2563eb' : '#e2e8f0', marginTop: '16px', alignSelf: 'flex-start' }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#64748b' }}>Datos de la empresa</h3>
            <Field label="Razón social *" error={errors.name}>
              <input className="input" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} placeholder="EMPRESA DEMO C.A." />
            </Field>
            <Field label="RIF">
              <input className="input" value={org.rif} onChange={(e) => setOrg({ ...org, rif: e.target.value })} placeholder="J-000000000" />
            </Field>
            <Field label="Dirección fiscal">
              <input className="input" value={org.address} onChange={(e) => setOrg({ ...org, address: e.target.value })} placeholder="Av. Principal, Caracas" />
            </Field>
            <Field label="Slug (URL identifier)" hint="Auto-generado si se deja vacío">
              <input className="input" value={org.slug} onChange={(e) => setOrg({ ...org, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} placeholder="empresa-demo" />
            </Field>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#64748b' }}>Administrador inicial</h3>
            <Field label="Nombre completo *" error={errors.full_name}>
              <input className="input" value={admin.full_name} onChange={(e) => setAdmin({ ...admin, full_name: e.target.value })} placeholder="Nombre del administrador" />
            </Field>
            <Field label="Email *" error={errors.email}>
              <input type="email" className="input" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} placeholder="admin@empresa.com" />
            </Field>
            <Field label="Contraseña *" error={errors.password}>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} className="input" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} placeholder="Mínimo 8 caracteres" style={{ paddingRight: '2.5rem' }} />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.375rem', padding: '0.75rem', fontSize: '0.78rem', color: '#92400e' }}>
              El administrador podrá gestionar usuarios, facturas y configuración de la organización. La contraseña debe cambiarse en el primer acceso.
            </div>
          </div>
        )}

        {/* Step 3 — Resumen */}
        {step === 3 && (
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#64748b' }}>Confirmar creación</h3>
            <div style={{ background: '#f8fafc', borderRadius: '0.5rem', padding: '1rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
              <SummaryRow label="Empresa" value={org.name} />
              {org.rif && <SummaryRow label="RIF" value={org.rif} />}
              {org.address && <SummaryRow label="Dirección" value={org.address} />}
              {org.slug && <SummaryRow label="Slug" value={org.slug} />}
              <div style={{ borderTop: '1px solid #e2e8f0', margin: '0.75rem 0' }} />
              <SummaryRow label="Admin" value={admin.full_name} />
              <SummaryRow label="Email" value={admin.email} />
              <SummaryRow label="Password" value={'•'.repeat(admin.password.length)} mono />
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.375rem', padding: '0.75rem', fontSize: '0.78rem', color: '#1d4ed8' }}>
              Se crearán: organización, usuario admin, configuración por defecto, 9 categorías de gasto y 4 centros de costo.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={step === 1 ? onClose : () => setStep((s) => s - 1)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '0.375rem', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: '#64748b' }}>
            <ChevronLeft size={16} /> {step === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          {step < 3 ? (
            <button onClick={next} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 500 }}>
              Siguiente <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleCreate} disabled={saving} style={{ background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1.25rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 500 }}>
              {saving ? <RefreshCw size={14} /> : <Check size={14} />}
              {saving ? 'Creando...' : 'Crear organización'}
            </button>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// ─── EDIT ORG MODAL ────────────────────────────────────────────────
function EditOrgModal({ org, onDone, onClose, flash }) {
  const [form, setForm] = useState({ name: org.name, rif: org.rif || '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return flash('Nombre requerido', 'error');
    setSaving(true);
    try {
      const res = await fetch(`${API}/organizations/${org.id}`, {
        method: 'PATCH', headers: h(),
        body: JSON.stringify({ name: form.name, rif: form.rif || null }),
      });
      const data = await res.json();
      if (!data.success) { flash(data.error?.message || 'Error', 'error'); setSaving(false); return; }
      onDone();
    } catch { flash('Error', 'error'); setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ width: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Editar organización</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
        </div>
        <Field label="Razón social *">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="RIF">
          <input className="input" value={form.rif} onChange={(e) => setForm({ ...form, rif: e.target.value })} placeholder="J-000000000" />
        </Field>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '0.375rem', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── USERS MODAL ───────────────────────────────────────────────────
function UsersModal({ org, onClose, flash }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/organizations/${org.id}/users`, { headers: h() });
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch { flash('Error cargando usuarios', 'error'); }
    setLoading(false);
  }, [org.id]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const toggleUserActive = async (user) => {
    try {
      const res = await fetch(`${API}/organizations/${org.id}/users/${user.id}`, {
        method: 'PATCH', headers: h(),
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      const data = await res.json();
      if (!data.success) return flash(data.error?.message || 'Error', 'error');
      flash(user.is_active ? 'Usuario desactivado' : 'Usuario activado');
      loadUsers();
    } catch { flash('Error', 'error'); }
  };

  return (
    <Overlay onClose={onClose} wide>
      <div style={{ width: '680px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Usuarios — {org.name}</h2>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>{org.slug}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => { setEditUser(null); setShowForm(!showForm); }} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.4rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
              <Plus size={14} /> Nuevo usuario
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
          </div>
        </div>

        {(showForm || editUser) && (
          <UserForm
            orgId={org.id} user={editUser}
            onDone={() => { setShowForm(false); setEditUser(null); loadUsers(); flash(editUser ? 'Usuario actualizado' : 'Usuario creado'); }}
            onCancel={() => { setShowForm(false); setEditUser(null); }}
            flash={flash}
          />
        )}

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Cargando...</div>
        ) : users.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Sin usuarios</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>
                {['Nombre', 'Email', 'Rol', 'Último acceso', 'Estado', 'Acciones'].map((col) => (
                  <th key={col} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.7rem 0.75rem', fontWeight: 500 }}>{user.full_name}</td>
                  <td style={{ padding: '0.7rem 0.75rem', color: '#64748b' }}>{user.email}</td>
                  <td style={{ padding: '0.7rem 0.75rem' }}>
                    <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: '0.25rem', padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}>{user.role}</span>
                  </td>
                  <td style={{ padding: '0.7rem 0.75rem', fontSize: '0.78rem', color: '#94a3b8' }}>
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '0.7rem 0.75rem' }}>
                    {user.is_active
                      ? <span style={{ color: '#16a34a', fontSize: '0.78rem' }}>Activo</span>
                      : <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Inactivo</span>}
                  </td>
                  <td style={{ padding: '0.7rem 0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button title="Editar / Reset password" onClick={() => { setEditUser(user); setShowForm(false); }} style={iconBtn}>
                        <Key size={13} />
                      </button>
                      <button title={user.is_active ? 'Desactivar' : 'Activar'} onClick={() => toggleUserActive(user)} style={{ ...iconBtn, color: user.is_active ? '#dc2626' : '#16a34a' }}>
                        {user.is_active ? <XCircle size={13} /> : <CheckCircle size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Overlay>
  );
}

// ─── USER FORM ─────────────────────────────────────────────────────
function UserForm({ orgId, user, onDone, onCancel, flash }) {
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'operador',
  });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user && (!form.email || !form.password || form.password.length < 8)) {
      return flash('Email y contraseña (mín. 8 caracteres) requeridos', 'error');
    }
    setSaving(true);
    try {
      const url = user
        ? `${API}/organizations/${orgId}/users/${user.id}`
        : `${API}/organizations/${orgId}/users`;
      const body = user
        ? { full_name: form.full_name, role: form.role, ...(form.password ? { password: form.password } : {}) }
        : { full_name: form.full_name, email: form.email, password: form.password, role: form.role };
      const res = await fetch(url, { method: user ? 'PATCH' : 'POST', headers: h(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.success) { flash(data.error?.message || 'Error', 'error'); setSaving(false); return; }
      onDone();
    } catch { flash('Error', 'error'); setSaving(false); }
  };

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
      <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>
        {user ? `Editar ${user.full_name}` : 'Nuevo usuario'}
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Nombre completo *">
          <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        {!user && (
          <Field label="Email *">
            <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        )}
        <Field label={user ? 'Nueva contraseña (dejar vacío para mantener)' : 'Contraseña *'}>
          <div style={{ position: 'relative' }}>
            <input type={showPass ? 'text' : 'password'} className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={user ? '••••••••' : 'Mín. 8 caracteres'} style={{ paddingRight: '2.5rem' }} />
            <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        <Field label="Rol *">
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button onClick={save} disabled={saving} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.4rem 0.875rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500 }}>
          {saving ? 'Guardando...' : user ? 'Actualizar' : 'Crear'}
        </button>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '0.375rem', padding: '0.4rem 0.875rem', cursor: 'pointer', fontSize: '0.82rem' }}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── HELPERS ──────────────────────────────────────────────────────
function Overlay({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.3rem', color: error ? '#dc2626' : '#374151' }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>{hint}</div>}
      {error && <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '0.2rem' }}>{error}</div>}
    </div>
  );
}

function SummaryRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', padding: '0.3rem 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ width: '90px', color: '#94a3b8', flexShrink: 0 }}>{label}</div>
      <div style={{ fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}
