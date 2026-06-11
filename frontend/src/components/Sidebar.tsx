import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: '工作空间' },
  { to: '/mapping-tasks', label: '映射任务' },
  { to: '/cloud-remotes', label: '云盘列表' },
  { to: '/rclone-config', label: 'rclone 配置' },
  { to: '/settings', label: '设置' }
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo">ED</div>
        <div>
          <div className="sidebar__title">everDrive</div>
          <div className="sidebar__subtitle">运维控制台</div>
        </div>
      </div>
      <nav className="sidebar__nav">
        {links.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
