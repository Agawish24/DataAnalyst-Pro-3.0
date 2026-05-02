import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Upload, Wand2, BarChart3, Code2, Bot,
  FlaskConical, LogOut, Menu, X, ChevronDown, User, Settings,
  Database, Globe
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', labelAr: 'لوحة التحكم' },
  { path: '/import', icon: Upload, label: 'Data Import', labelAr: 'استيراد البيانات' },
  { path: '/cleaning', icon: Wand2, label: 'Data Cleaning', labelAr: 'تنظيف البيانات' },
  { path: '/eda', icon: BarChart3, label: 'EDA', labelAr: 'التحليل الاستكشافي' },
  { path: '/visualization', icon: BarChart3, label: 'Visualization', labelAr: 'التصور' },
  { path: '/sql', icon: Code2, label: 'SQL Editor', labelAr: 'محرر SQL' },
  { path: '/ai', icon: Bot, label: 'AI Assistant', labelAr: 'المساعد الذكي' },
  { path: '/analytics', icon: FlaskConical, label: 'Analytics', labelAr: 'التحليلات' },
  { path: '/builder', icon: LayoutDashboard, label: 'Dashboard Builder', labelAr: 'بناء اللوحة' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lang, setLang] = useState('en');
  const [profileOpen, setProfileOpen] = useState(false);

  const isAr = lang === 'ar';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className={`app-layout ${isAr ? 'rtl' : 'ltr'}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Database size={24} />
            {sidebarOpen && <span>DataAnalyst</span>}
          </div>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className={`nav-item ${active ? 'active' : ''}`} title={isAr ? item.labelAr : item.label}>
                <Icon size={20} />
                {sidebarOpen && <span>{isAr ? item.labelAr : item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="lang-toggle" onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')} title="Toggle Language">
            <Globe size={18} />
            {sidebarOpen && <span>{isAr ? 'English' : 'عربي'}</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="page-title">
              {navItems.find(n => n.path === location.pathname)?.[isAr ? 'labelAr' : 'label'] || 'DataAnalyst Pro'}
            </h1>
          </div>
          <div className="topbar-right">
            <div className="profile-menu">
              <button className="profile-btn" onClick={() => setProfileOpen(!profileOpen)}>
                <div className="avatar">{user?.name?.[0]?.toUpperCase()}</div>
                <span className="user-name">{user?.name}</span>
                <span className="user-role badge">{user?.role}</span>
                <ChevronDown size={16} />
              </button>
              {profileOpen && (
                <div className="profile-dropdown">
                  <div className="profile-info">
                    <div className="avatar lg">{user?.name?.[0]?.toUpperCase()}</div>
                    <div>
                      <div className="font-semibold">{user?.name}</div>
                      <div className="text-sm text-muted">{user?.email}</div>
                    </div>
                  </div>
                  <hr />
                  <button className="dropdown-item" onClick={handleLogout}>
                    <LogOut size={16} /> {isAr ? 'تسجيل الخروج' : 'Logout'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
