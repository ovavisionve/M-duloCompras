import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Users, CreditCard, BookOpen,
  Landmark, Settings, BarChart3, DollarSign, Shield, LogOut, Bell
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Suppliers from './pages/Suppliers';
import Invoices from './pages/Invoices';
import InvoiceForm from './pages/InvoiceForm';
import Withholdings from './pages/Withholdings';
import Payments from './pages/Payments';
import PurchaseBook from './pages/PurchaseBook';
import Banking from './pages/Banking';
import ExchangeRates from './pages/ExchangeRates';
import Configuration from './pages/Configuration';
import Reports from './pages/Reports';
import Treasury from './pages/Treasury';
import Login from './pages/Login';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

function Sidebar() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        Comprar-<span onClick={() => navigate('/treasury')} style={{ cursor: 'default', userSelect: 'text' }}>IA</span>
        <small>Gestión Fiscal Inteligente</small>
      </div>
      <nav className="sidebar-nav">
        <div className="sidebar-section">Principal</div>
        <NavLink to="/" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={18} /> Dashboard
        </NavLink>

        <div className="sidebar-section">Operaciones</div>
        <NavLink to="/invoices" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <FileText size={18} /> Facturas
        </NavLink>
        <NavLink to="/suppliers" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <Users size={18} /> Proveedores
        </NavLink>
        <NavLink to="/payments" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <CreditCard size={18} /> Pagos
        </NavLink>
        <NavLink to="/withholdings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <Shield size={18} /> Retenciones
        </NavLink>

        <div className="sidebar-section">Fiscal</div>
        <NavLink to="/purchase-book" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <BookOpen size={18} /> Libro de Compras
        </NavLink>
        <NavLink to="/exchange-rates" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <DollarSign size={18} /> Tasas de Cambio
        </NavLink>

        <div className="sidebar-section">Bancos</div>
        <NavLink to="/banking" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <Landmark size={18} /> Conciliación
        </NavLink>

        <div className="sidebar-section">Sistema</div>
        <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <BarChart3 size={18} /> Reportes
        </NavLink>
        <NavLink to="/config" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <Settings size={18} /> Configuración
        </NavLink>

        {user.orgName && (
          <div className="sidebar-section" style={{ marginTop: '1.5rem', fontSize: '0.7rem', opacity: 0.7 }}>
            {user.orgName}
          </div>
        )}
        <div className="sidebar-section" style={{ marginTop: user.orgName ? '0.3rem' : '2rem' }}>
          {user.fullName} ({user.role})
        </div>
        <button className="sidebar-link" onClick={logout}>
          <LogOut size={18} /> Cerrar Sesión
        </button>
      </nav>
    </aside>
  );
}

function Layout({ children }) {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/invoices/new" element={<InvoiceForm />} />
                <Route path="/withholdings" element={<Withholdings />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/purchase-book" element={<PurchaseBook />} />
                <Route path="/banking" element={<Banking />} />
                <Route path="/treasury" element={<Treasury />} />
                <Route path="/exchange-rates" element={<ExchangeRates />} />
                <Route path="/config" element={<Configuration />} />
                <Route path="/reports" element={<Reports />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
