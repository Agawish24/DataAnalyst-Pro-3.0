import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Upload, Wand2, BarChart3, Code2, Bot,
  FlaskConical, LogOut, Menu, X, ChevronDown, ChevronRight,
  User, Settings, Database, Globe, Search, GitBranch,
  MessageSquare, GitMerge, ChefHat, FileText, Bell,
  Shield, BookOpen, Sparkles, TrendingUp, Sliders, Target, Key
} from 'lucide-react';

const navGroups = [
  {
    label: 'Overview',
    labelAr: 'نظرة عامة',
    items: [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', labelAr: 'لوحة التحكم' },
    ]
  },
  {
    label: 'Data',
    labelAr: 'البيانات',
    items: [
      { path: '/import', icon: Upload, label: 'Data Import', labelAr: 'استيراد البيانات' },
      { path: '/catalog', icon: BookOpen, label: 'Data Catalog', labelAr: 'كتالوج البيانات' },
      { path: '/versions', icon: GitBranch, label: 'Version Control', labelAr: 'إدارة الإصدارات' },
    ]
  },
  {
    label: 'Processing',
    labelAr: 'المعالجة',
    items: [
      { path: '/cleaning', icon: Wand2, label: 'Data Cleaning', labelAr: 'تنظيف البيانات' },
      { path: '/profiling', icon: TrendingUp, label: 'Profiling', labelAr: 'ملف البيانات' },
      { path: '/recipes', icon: ChefHat, label: 'Recipes', labelAr: 'وصفات التحويل' },
      { path: '/pipelines', icon: GitMerge, label: 'Pipelines', labelAr: 'خطوط الأنابيب' },
    ]
  },
  {
    label: 'Analysis',
    labelAr: 'التحليل',
    items: [
      { path: '/eda', icon: BarChart3, label: 'EDA', labelAr: 'التحليل الاستكشافي' },
      { path: '/visualization', icon: BarChart3, label: 'Visualization', labelAr: 'التصور' },
      { path: '/sql', icon: Code2, label: 'SQL Editor', labelAr: 'محرر SQL' },
      { path: '/analytics', icon: FlaskConical, label: 'ML Analytics', labelAr: 'التحليلات' },
    ]
  },
  {
    label: 'Intelligence',
    labelAr: 'الذكاء',
    items: [
      { path: '/ai', icon: Bot, label: 'AI Assistant', labelAr: 'المساعد الذكي' },
      { path: '/business-questions', icon: Sparkles, label: 'Business Questions', labelAr: 'أسئلة الأعمال' },
      { path: '/reports', icon: FileText, label: 'Reports', labelAr: 'التقارير' },
      { path: '/builder', icon: LayoutDashboard, label: 'Dashboard Builder', labelAr: 'بناء اللوحة' },
    ]
  },
  {
    label: 'Advanced Analytics',
    labelAr: 'التحليلات المتقدمة',
    items: [
      { path: '/scenarios', icon: Sliders, label: 'Scenario Modeling', labelAr: 'نمذجة السيناريو' },
      { path: '/prescriptive', icon: Target, label: 'Prescriptive Analytics', labelAr: 'التحليلات التوجيهية' },
    ]
  },
  {
    label: 'Developer',
    labelAr: 'المطور',
    items: [
      { path: '/external-api', icon: Key, label: 'External API', labelAr: 'واجهة برمجية خارجية' },
    ]
  },
  {
    label: 'Collaboration',
    labelAr: 'التعاون',
    items: [
      { path: '/collaboration', icon: MessageSquare, label: 'Comments & Sharing', labelAr: 'التعليقات والمشاركة' },
      { path: '/jobs', icon: Bell, label: 'Jobs & Alerts', labelAr: 'الوظائف والتنبيهات' },
    ]
  },
  {
    label: 'Admin',
    labelAr: 'الإدارة',
    adminOnly: true,
    items: [
      { path: '/audit', icon: Shield, label: 'Audit Logs', labelAr: 'سجلات التدقيق' },
    ]
  },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lang, setLang] = useState('en');
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';

  const toggleGroup = (label) => setCollapsedGroups(prev => ({ ...prev, [label]: !prev[label] }));

  const handleLogout = () => { logout(); navigate('/login'); };

  const visibleGroups = navGroups.filter(g => !g.adminOnly || user?.role === 'admin');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f0f1a', direction: dir, fontFamily: isAr ? 'Arial, sans-serif' : 'inherit' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? 220 : 56, transition: 'width 0.2s', background: '#13131f',
        borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column',
        flexShrink: 0, overflowX: 'hidden', overflowY: 'auto'
      }}>
        {/* Logo */}
        <div style={{ padding: '16px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ width: 30, height: 30, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Database size={16} color="white" />
          </div>
          {sidebarOpen && (
            <div>
              <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>DataAnalyst</div>
              <div style={{ color: '#6366f1', fontWeight: 700, fontSize: 12 }}>Pro v2</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {visibleGroups.map(group => (
            <div key={group.label}>
              {sidebarOpen && (
                <button onClick={() => toggleGroup(group.label)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px 4px', background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <span>{isAr ? group.labelAr : group.label}</span>
                  {collapsedGroups[group.label] ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                </button>
              )}
              {!collapsedGroups[group.label] && group.items.map(item => {
                const active = location.pathname === item.path;
                return (
                  <Link key={item.path} to={item.path} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: sidebarOpen ? '8px 14px' : '10px 14px',
                    margin: '1px 6px', borderRadius: 8, textDecoration: 'none', transition: 'all 0.15s',
                    background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
                    color: active ? '#a5b4fc' : '#6b7280',
                  }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <item.icon size={15} style={{ flexShrink: 0 }} />
                    {sidebarOpen && <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isAr ? item.labelAr : item.label}</span>}
                    {active && sidebarOpen && <div style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: '#6366f1' }} />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '10px 8px' }}>
          {/* Lang toggle */}
          <button onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', borderRadius: 8, marginBottom: 2 }}>
            <Globe size={15} style={{ flexShrink: 0 }} />
            {sidebarOpen && <span style={{ fontSize: 12 }}>{lang === 'en' ? 'العربية' : 'English'}</span>}
          </button>
          {/* Profile */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setProfileOpen(!profileOpen)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{user?.name?.[0]?.toUpperCase()}</span>
              </div>
              {sidebarOpen && (
                <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                  <div style={{ color: '#f3f4f6', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                  <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'capitalize' }}>{user?.role}</div>
                </div>
              )}
            </button>
            {profileOpen && sidebarOpen && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 6, marginBottom: 4, zIndex: 50 }}>
                <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', borderRadius: 6, fontSize: 13 }}>
                  <LogOut size={13} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <header style={{ height: 54, background: '#13131f', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 6, borderRadius: 6 }}>
            <Menu size={18} />
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
            <Sparkles size={13} color="#6366f1" />
            <span style={{ color: '#6b7280', fontSize: 12 }}>DataAnalyst Pro v2.0</span>
          </div>
          {user?.role === 'admin' && (
            <Link to="/audit" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, textDecoration: 'none', color: '#a5b4fc', fontSize: 12 }}>
              <Shield size={13} /> Admin
            </Link>
          )}
        </header>
        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
        select option { background: #1e1e2e; color: #f3f4f6; }
      `}</style>
    </div>
  );
}
