import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { CloudRemotesPage } from './pages/CloudRemotesPage';
import { DashboardPage } from './pages/DashboardPage';
import { MappingTasksPage } from './pages/MappingTasksPage';
import { SettingsPage } from './pages/SettingsPage';
import { RcloneConfigPage } from './pages/RcloneConfigPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'mapping-tasks', element: <MappingTasksPage /> },
      { path: 'cloud-remotes', element: <CloudRemotesPage /> },
      { path: 'rclone-config', element: <RcloneConfigPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
]);
