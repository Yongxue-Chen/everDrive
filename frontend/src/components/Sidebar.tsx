import {
  Activity,
  ArrowLeftRight,
  Cable,
  Cloud,
  FolderSync,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  Monitor,
  Moon,
  ScrollText,
  Settings,
  Sun,
  type LucideIcon
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

type NavItem = { to: string; label: string; icon: LucideIcon };

const groups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: '首页',
    items: [
      { to: '/dashboard', label: '概览', icon: LayoutDashboard },
      { to: '/mapping-tasks', label: '我的映射', icon: FolderSync }
    ]
  },
  {
    label: '存储',
    items: [
      { to: '/cloud-remotes', label: '云盘', icon: Cloud },
      { to: '/rclone-config', label: '连接', icon: Cable }
    ]
  },
  {
    label: '工具',
    items: [
      { to: '/recovery', label: '恢复中心', icon: LifeBuoy },
      { to: '/cloud-migration', label: '云端迁移', icon: ArrowLeftRight }
    ]
  },
  {
    label: '更多',
    items: [
      { to: '/operation-logs', label: '活动记录', icon: ScrollText },
      { to: '/system-metrics', label: '系统状态', icon: Gauge },
      { to: '/settings', label: '设置', icon: Settings }
    ]
  }
];

type ThemePreference = 'system' | 'light' | 'dark';
const THEME_KEY = 'everdrive_theme';

function readTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyStoredTheme() {
  const theme = readTheme();
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function ThemeSwitch() {
  const [theme, setTheme] = useState<ThemePreference>(readTheme);

  useEffect(() => {
    try {
      if (theme === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Theme preference is a convenience only.
    }
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const options: Array<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'system', label: '跟随系统', icon: Monitor },
    { value: 'dark', label: '深色', icon: Moon }
  ];

  return (
    <div className="theme-switch" role="radiogroup" aria-label="主题">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          title={label}
          aria-label={label}
          className={theme === value ? 'theme-switch__item theme-switch__item--active' : 'theme-switch__item'}
          onClick={() => setTheme(value)}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  return (
    <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}>
      <div className="sidebar__brand">
        <div className="sidebar__logo">
          <img src="https://ik.imagekit.io/everlearn/logos/everDrive.png?tr=w-72,h-72,f-auto,q-auto" alt="everDrive" />
        </div>
        <div>
          <div className="sidebar__title">everDrive</div>
          <div className="sidebar__subtitle">让文件安心流动</div>
        </div>
      </div>
      <nav className="sidebar__nav">
        {groups.map((group) => (
          <div className="sidebar__group" key={group.label}>
            <div className="sidebar__group-title">{group.label}</div>
            {group.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => (isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link')}>
                <Icon size={17} className="sidebar__icon" />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar__foot">
        <Activity size={14} />
        <span>everDrive</span>
        <ThemeSwitch />
      </div>
    </aside>
  );
}
