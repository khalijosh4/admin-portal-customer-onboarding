import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminApplicationDetail from './pages/admin/AdminApplicationDetail';
import AdminLayout from './pages/admin/AdminLayout';
import AdminUsers from './pages/admin/AdminUsers';
import AdminProfile from './pages/admin/AdminProfile';
import AdminNotifications from './pages/admin/AdminNotifications';
import ForcePasswordChange from './pages/admin/ForcePasswordChange';
import { RequireAuth } from './components/RequireAuth';

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/force-password-change" element={<RequireAuth element={<ForcePasswordChange />} />} />
        <Route
          path="/admin"
          element={
            <RequireAuth element={<AdminLayout />} />
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="applications/:id" element={<AdminApplicationDetail />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="profile" element={<AdminProfile />} />
          <Route path="notifications" element={<AdminNotifications />} />
        </Route>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}