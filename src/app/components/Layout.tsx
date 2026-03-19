import { Outlet, Link, useLocation } from 'react-router';
import {
  Building2,
  Plug,
  Wrench,
  Sparkles,
  Zap,
  Workflow,
  PlayCircle,
  Activity,
  Settings,
  ChevronRight,
  DollarSign,
  Dna,
  LayoutDashboard,
} from 'lucide-react';
import { TopBar } from './TopBar';
import { Toaster } from '../components/ui/sonner';
import { useState } from 'react';

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  subItems?: { name: string; href: string }[];
};

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  {
    name: 'Workflow',
    href: '/integrations',
    icon: Workflow,
    subItems: [
      { name: 'Integrations', href: '/integrations' },
      { name: 'Tools', href: '/tools' },
      { name: 'Skills', href: '/skills' },
      { name: 'Use Cases', href: '/use-cases' },
      { name: 'Actions', href: '/actions' },
    ],
  },
  {
    name: 'App Genomes',
    href: '/genomes',
    icon: Dna,
    subItems: [
      { name: 'Capture', href: '/genomes/capture' },
      { name: 'Genomes', href: '/genomes' },
      { name: 'Video Genome', href: '/genomes/video' },
      { name: 'Translations', href: '/genomes/translations' },
      { name: 'Insights', href: '/genomes/insights' },
    ],
  },
  {
    name: 'Observability',
    href: '/observability',
    icon: Activity,
    subItems: [
      { name: 'Runs', href: '/runs' },
      { name: 'LLM Usage', href: '/observability' },
      { name: 'Cost Ledger', href: '/observability/cost-ledger' },
    ],
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    subItems: [
      { name: 'Tenants', href: '/tenants' },
      { name: 'Configuration', href: '/settings' },
    ],
  },
];

export function Layout() {
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<string[]>(['Workflow', 'App Genomes', 'Observability']);

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/' || location.pathname === '/dashboard';
    return location.pathname.startsWith(href);
  };

  const isSectionActive = (item: NavItem) => {
    if (item.subItems) {
      return item.subItems.some((sub) => location.pathname.startsWith(sub.href));
    }
    return isActive(item.href);
  };

  const toggleExpanded = (name: string) => {
    setExpandedItems((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-100 border-r border-gray-200 flex flex-col">
        <div className="p-6">
          <h1 className="text-sm font-semibold tracking-tight text-orange-600">
            OverYonder<span className="text-gray-400">.ai</span>
          </h1>
          <p className="text-[10px] text-gray-400 mt-0.5 tracking-widest uppercase">Admin Portal</p>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isSectionActive(item);
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isExpanded = expandedItems.includes(item.name);

            return (
              <div key={item.name}>
                {hasSubItems ? (
                  <>
                    <button
                      onClick={() => toggleExpanded(item.name)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition-colors ${
                        active
                          ? 'bg-gray-200 text-orange-600 font-medium'
                          : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${active ? 'text-orange-600' : ''}`} />
                        <span className="text-sm">{item.name}</span>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="mt-0.5 ml-4 space-y-0.5">
                        {item.subItems!.map((subItem) => {
                          const subActive = location.pathname === subItem.href;
                          return (
                            <Link
                              key={subItem.href}
                              to={subItem.href}
                              className={`flex items-center gap-3 px-3 py-1.5 rounded-lg transition-colors text-sm ${
                                subActive
                                  ? 'bg-gray-200 text-orange-600 font-medium'
                                  : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                              }`}
                            >
                              <span className={`w-1 h-1 rounded-full ${subActive ? 'bg-orange-400' : 'bg-gray-300'}`} />
                              {subItem.name}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    to={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      active
                        ? 'bg-gray-200 text-orange-600 font-medium'
                        : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? 'text-orange-600' : ''}`} />
                    <span className="text-sm">{item.name}</span>
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
        {/* Sidebar footer */}
        <div className="px-4 py-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <span className="text-xs text-gray-500">Platform v2.0</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
