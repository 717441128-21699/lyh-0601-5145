import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useUserStore } from './store';
import { api } from './services/api';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import TransactionDetail from './pages/TransactionDetail';
import Reviews from './pages/Reviews';
import ReviewDetail from './pages/ReviewDetail';
import Sanctions from './pages/Sanctions';
import SanctionUploads from './pages/SanctionUploads';
import Suppliers from './pages/Suppliers';
import SupplierDetail from './pages/SupplierDetail';
import Reports from './pages/Reports';
import AuditLogs from './pages/AuditLogs';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, user, setUser } = useUserStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = React.useState(!user);

  useEffect(() => {
    const check = async () => {
      if (!isAuthenticated) {
        navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
        return;
      }
      if (!user) {
        try {
          const data = await api.auth.me();
          setUser(data);
        } catch (err) {
          navigate('/login');
        }
      }
      setLoading(false);
    };
    check();
  }, [isAuthenticated, user, location.pathname]);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return children;
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="transactions/:id" element={<TransactionDetail />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="reviews/:id" element={<ReviewDetail />} />
        <Route path="sanctions" element={<Sanctions />} />
        <Route path="sanctions/uploads" element={<SanctionUploads />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="suppliers/:id" element={<SupplierDetail />} />
        <Route path="reports" element={<Reports />} />
        <Route path="audit" element={<AuditLogs />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
