import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminApplicationDetail from './pages/admin/AdminApplicationDetail';
import AdminLayout from './pages/admin/AdminLayout';
import { RequireAuth } from './components/RequireAuth';

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="applications/:id" element={<AdminApplicationDetail />} />
        </Route>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}