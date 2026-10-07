/**
 * BrainLinkLayout - Independent layout (MarketOverview style nav)
 */
import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import '../../pages/BrainLinkPages.css';

const navItems = [
  { path: '/brain', label: 'Brain Link' },
  { path: '/brain/asset/MON', label: 'Token Analysis' },
  { path: '/brain/trade', label: 'Auto Trade' },
  { path: '/brain/history', label: 'History' },
  { path: '/brain/embed-demo', label: 'Embed Demo' },
];

const BrainLinkLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const isActive = (path: string) => path === '/brain' ? currentPath === '/brain' : currentPath.startsWith(path);

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fb', fontFamily: "'Inter', sans-serif" }}>
      <nav style={{
        display: 'flex', alignItems: 'center',
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        padding: '0 24px',
      }}>
        <div
          style={{ fontWeight: 800, fontSize: 16, color: '#1e293b', cursor: 'pointer', padding: '16px 16px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={() => navigate('/brain')}
        >
          🧠 <span style={{ color: '#4f7df9' }}>Galeon</span>
        </div>

        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 12, padding: 3, marginLeft: 16 }}>
          {navItems.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                padding: '9px 20px', fontSize: 13, fontWeight: 600,
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all .2s',
                background: isActive(item.path) ? '#1e293b' : 'none',
                color: isActive(item.path) ? '#fff' : '#94a3b8',
                boxShadow: isActive(item.path) ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>
      <Outlet />
    </div>
  );
};

export default BrainLinkLayout;
