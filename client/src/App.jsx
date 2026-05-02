import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DataImport from './pages/DataImport';
import DataCleaning from './pages/DataCleaning';
import EDA from './pages/EDA';
import Visualization from './pages/Visualization';
import SQLEditor from './pages/SQLEditor';
import AIAssistant from './pages/AIAssistant';
import Analytics from './pages/Analytics';
import DashboardBuilder from './pages/DashboardBuilder';
import Profiling from './pages/Profiling';
import DataCatalog from './pages/DataCatalog';
import Collaboration from './pages/Collaboration';
import Pipelines from './pages/Pipelines';
import Recipes from './pages/Recipes';
import VersionControl from './pages/VersionControl';
import Reports from './pages/Reports';
import JobsAlerts from './pages/JobsAlerts';
import AuditLogs from './pages/AuditLogs';

const PrivateRoute = ({ children }) => {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
};

const AdminRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
};

const AppRoutes = () => {
  const { user } = useAuth();
  const wrap = (Component, admin = false) => {
    const Inner = admin
      ? <AdminRoute><Layout><Component /></Layout></AdminRoute>
      : <PrivateRoute><Layout><Component /></Layout></PrivateRoute>;
    return Inner;
  };

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/" element={<Navigate to="/dashboard" />} />
      <Route path="/dashboard" element={wrap(Dashboard)} />
      <Route path="/import" element={wrap(DataImport)} />
      <Route path="/cleaning" element={wrap(DataCleaning)} />
      <Route path="/profiling" element={wrap(Profiling)} />
      <Route path="/eda" element={wrap(EDA)} />
      <Route path="/visualization" element={wrap(Visualization)} />
      <Route path="/sql" element={wrap(SQLEditor)} />
      <Route path="/ai" element={wrap(AIAssistant)} />
      <Route path="/analytics" element={wrap(Analytics)} />
      <Route path="/builder" element={wrap(DashboardBuilder)} />
      <Route path="/pipelines" element={wrap(Pipelines)} />
      <Route path="/recipes" element={wrap(Recipes)} />
      <Route path="/versions" element={wrap(VersionControl)} />
      <Route path="/catalog" element={wrap(DataCatalog)} />
      <Route path="/collaboration" element={wrap(Collaboration)} />
      <Route path="/reports" element={wrap(Reports)} />
      <Route path="/jobs" element={wrap(JobsAlerts)} />
      <Route path="/audit" element={wrap(AuditLogs, true)} />
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" toastOptions={{
            style: { background: '#1e1e2e', color: '#f3f4f6', border: '1px solid rgba(255,255,255,0.1)' },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } }
          }} />
        </BrowserRouter>
      </DataProvider>
    </AuthProvider>
  );
}
