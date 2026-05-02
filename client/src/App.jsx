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

const PrivateRoute = ({ children }) => {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
};

const AppRoutes = () => {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/" element={<Navigate to="/dashboard" />} />
      <Route path="/dashboard" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
      <Route path="/import" element={<PrivateRoute><Layout><DataImport /></Layout></PrivateRoute>} />
      <Route path="/cleaning" element={<PrivateRoute><Layout><DataCleaning /></Layout></PrivateRoute>} />
      <Route path="/eda" element={<PrivateRoute><Layout><EDA /></Layout></PrivateRoute>} />
      <Route path="/visualization" element={<PrivateRoute><Layout><Visualization /></Layout></PrivateRoute>} />
      <Route path="/sql" element={<PrivateRoute><Layout><SQLEditor /></Layout></PrivateRoute>} />
      <Route path="/ai" element={<PrivateRoute><Layout><AIAssistant /></Layout></PrivateRoute>} />
      <Route path="/analytics" element={<PrivateRoute><Layout><Analytics /></Layout></PrivateRoute>} />
      <Route path="/builder" element={<PrivateRoute><Layout><DashboardBuilder /></Layout></PrivateRoute>} />
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
          <Toaster position="top-right" toastOptions={{ style: { background: '#1e1e2e', color: '#f3f4f6', border: '1px solid rgba(255,255,255,0.1)' }, success: { iconTheme: { primary: '#10b981', secondary: '#fff' } }, error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } } }} />
        </BrowserRouter>
      </DataProvider>
    </AuthProvider>
  );
}
