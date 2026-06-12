import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: '工作空间' },
  { to: '/mapping-tasks', label: '映射任务' },
  { to: '/cloud-remotes', label: '云盘列表' },
  { to: '/rclone-config', label: 'rclone 配置' },
  { to: '/cloud-migration', label: '云端迁移' },
  { to: '/redundancy-recovery', label: '冗余恢复' },
  { to: '/encryption-recovery', label: '加密恢复' },
  { to: '/operation-logs', label: '操作日志' },
  { to: '/system-metrics', label: '系统指标' },
  { to: '/settings', label: '设置' }
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo"><img src="https://ik.imagekit.io/everlearn/logos/everDrive.png?tr=w-72,h-72,f-auto,q-auto" alt="everDrive" /></div>
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
