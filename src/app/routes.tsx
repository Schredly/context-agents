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
import RunDetailPage from './pages/RunDetailPage';
import CreateTenantPage from './pages/CreateTenantPage';
import AgentUIPage from './pages/AgentUIPage';
import ActionsCatalogPage from './pages/ActionsCatalogPage';
import CreateEditActionPage from './pages/CreateEditActionPage';
import ActionVisibilityRulesPage from './pages/ActionVisibilityRulesPage';
import AgentUIActionsPage from './pages/AgentUIActionsPage';
import CostLedgerPage from './pages/CostLedgerPage';
import GenomesPage from './pages/GenomesPage';
import GenomeDetailPage from './pages/GenomeDetailPage';
import GenomeCapturePage from './pages/GenomeCapturePage';
import GenomeInsightsPage from './pages/GenomeInsightsPage';
import ToolsPage from './pages/ToolsPage';
import DashboardPage from './pages/DashboardPage';
import GenomeStudioPage from './pages/GenomeStudioPage';
import TranslationsPage from './pages/TranslationsPage';
import TranslationEditorPage from './pages/TranslationEditorPage';
import VideoGenomePage from './pages/VideoGenomePage';
import VideoGenomeCapturePage from './pages/VideoGenomeCapturePage';
import VideoGenomeDetailPage from './pages/VideoGenomeDetailPage';
import DocGenomePage from './pages/DocGenomePage';
import DocGenomeCapturePage from './pages/DocGenomeCapturePage';
import DocGenomeDetailPage from './pages/DocGenomeDetailPage';
import SNGenomePage from './pages/SNGenomePage';
import SNGenomeCapturePage from './pages/SNGenomeCapturePage';
import SNGenomeDetailPage from './pages/SNGenomeDetailPage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      {
        index: true,
        Component: DashboardPage,
      },
      {
        path: 'dashboard',
        Component: DashboardPage,
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
        path: 'tenants/:id',
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
        path: 'tools',
        Component: ToolsPage,
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
        path: 'actions',
        Component: ActionsCatalogPage,
      },
      {
        path: 'actions/create',
        Component: CreateEditActionPage,
      },
      {
        path: 'actions/:id',
        Component: CreateEditActionPage,
      },
      {
        path: 'actions/:id/visibility',
        Component: ActionVisibilityRulesPage,
      },
      {
        path: 'actions/preview',
        Component: AgentUIActionsPage,
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
        path: 'observability/cost-ledger',
        Component: CostLedgerPage,
      },
      {
        path: 'genomes',
        Component: GenomesPage,
      },
      {
        path: 'genomes/capture',
        Component: GenomeCapturePage,
      },
      {
        path: 'genomes/insights',
        Component: GenomeInsightsPage,
      },
      {
        path: 'genomes/video',
        Component: VideoGenomePage,
      },
      {
        path: 'genomes/video/capture',
        Component: VideoGenomeCapturePage,
      },
      {
        path: 'genomes/video/:id',
        Component: VideoGenomeDetailPage,
      },
      {
        path: 'genomes/doc',
        Component: DocGenomePage,
      },
      {
        path: 'genomes/doc/capture',
        Component: DocGenomeCapturePage,
      },
      {
        path: 'genomes/doc/:id',
        Component: DocGenomeDetailPage,
      },
      {
        path: 'genomes/sn',
        Component: SNGenomePage,
      },
      {
        path: 'genomes/sn/capture',
        Component: SNGenomeCapturePage,
      },
      {
        path: 'genomes/sn/:id',
        Component: SNGenomeDetailPage,
      },
      {
        path: 'genomes/translations',
        Component: TranslationsPage,
      },
      {
        path: 'genomes/translations/create',
        Component: TranslationEditorPage,
      },
      {
        path: 'genomes/translations/:id',
        Component: TranslationEditorPage,
      },
      {
        path: 'genomes/:id',
        Component: GenomeDetailPage,
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
  {
    path: '/genome-studio',
    Component: GenomeStudioPage,
  },
]);
