import { createBrowserRouter, Navigate } from 'react-router';
import { DashboardLayout } from './layouts/DashboardLayout';
import { TenantsPage } from './pages/TenantsPage';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { RunsPage } from './pages/RunsPage';
import { ObservabilityPage } from './pages/ObservabilityPage';
import { WorkerServiceNowPage } from './pages/WorkerServiceNowPage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: DashboardLayout,
    children: [
      {
        index: true,
        element: <Navigate to="/tenants" replace />,
      },
      {
        path: 'tenants',
        Component: TenantsPage,
      },
      {
        path: 'tenants/setup',
        Component: SetupWizardPage,
      },
      {
        path: 'tenants/setup/:id',
        Component: SetupWizardPage,
      },
      {
        path: 'runs',
        Component: RunsPage,
      },
      {
        path: 'admin/observability',
        Component: ObservabilityPage,
      },
      {
        path: 'settings',
        element: <div className="p-8 text-muted-foreground">Settings (Coming Soon)</div>,
      },
    ],
  },
  {
    path: '/worker/servicenow',
    Component: WorkerServiceNowPage,
  },
]);
