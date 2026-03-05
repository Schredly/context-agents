import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import { TenantsPage } from './pages/TenantsPage';
import RunsPage from './pages/RunsPage';
import ObservabilityPage from './pages/ObservabilityPage';
import { WorkerServiceNowPage } from './pages/WorkerServiceNowPage';
import { SettingsPage } from './pages/SettingsPage';
import IntegrationsPage from './pages/IntegrationsPage';
import IntegrationConfigPage from './pages/IntegrationConfigPage';
import SkillsPage from './pages/SkillsPage';
import SkillEditorPage from './pages/SkillEditorPage';
import UseCasesPage from './pages/UseCasesPage';
import UseCaseBuilderPage from './pages/UseCaseBuilderPage';
import AgentConsolePage from './pages/AgentConsolePage';
import RunDetailPage from './pages/RunDetailPage';
import CreateTenantPage from './pages/CreateTenantPage';
import AgentUIPage from './pages/AgentUIPage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
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
        path: 'tenants/create',
        Component: CreateTenantPage,
      },
      {
        path: 'integrations',
        Component: IntegrationsPage,
      },
      {
        path: 'integrations/:id',
        Component: IntegrationConfigPage,
      },
      {
        path: 'skills',
        Component: SkillsPage,
      },
      {
        path: 'skills/create',
        Component: SkillEditorPage,
      },
      {
        path: 'skills/:id',
        Component: SkillEditorPage,
      },
      {
        path: 'use-cases',
        Component: UseCasesPage,
      },
      {
        path: 'use-cases/create',
        Component: UseCaseBuilderPage,
      },
      {
        path: 'use-cases/:id',
        Component: UseCaseBuilderPage,
      },
      {
        path: 'runs',
        Component: RunsPage,
      },
      {
        path: 'runs/:id',
        Component: RunDetailPage,
      },
      {
        path: 'observability',
        Component: ObservabilityPage,
      },
      {
        path: 'console',
        Component: AgentConsolePage,
      },
      {
        path: 'settings',
        Component: SettingsPage,
      },
    ],
  },
  {
    path: '/worker/servicenow',
    Component: WorkerServiceNowPage,
  },
  {
    path: '/agentui',
    Component: AgentUIPage,
  },
]);
