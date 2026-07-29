import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { CloudRemotesPage } from './pages/CloudRemotesPage';
import { DashboardPage } from './pages/DashboardPage';
import { MappingTasksPage } from './pages/MappingTasksPage';
import { SettingsPage } from './pages/SettingsPage';
import { RcloneConfigPage } from './pages/RcloneConfigPage';
import { CloudMigrationPage } from './pages/CloudMigrationPage';
import { RedundancyRecoveryPage } from './pages/RedundancyRecoveryPage';
import { OperationLogsPage } from './pages/OperationLogsPage';
import { SystemMetricsPage } from './pages/SystemMetricsPage';
import { EncryptionRecoveryPage } from './pages/EncryptionRecoveryPage';
import { DataRecoveryPage } from './pages/DataRecoveryPage';

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
      { path: 'cloud-migration', element: <CloudMigrationPage /> },
      { path: 'data-recovery', element: <DataRecoveryPage /> },
      { path: 'redundancy-recovery', element: <RedundancyRecoveryPage /> },
      { path: 'encryption-recovery', element: <EncryptionRecoveryPage /> },
      { path: 'operation-logs', element: <OperationLogsPage /> },
      { path: 'system-metrics', element: <SystemMetricsPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
]);
