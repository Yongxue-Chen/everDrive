import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="shell">
      <header className="topbar">
        <button className="icon-button" aria-label="打开菜单" onClick={() => setNavOpen(true)}>
          <Menu size={20} />
        </button>
        <span className="topbar__title">everDrive</span>
      </header>
      {navOpen ? <div className="sidebar-scrim" onClick={() => setNavOpen(false)} /> : null}
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
