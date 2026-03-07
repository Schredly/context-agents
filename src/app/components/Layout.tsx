import { Outlet, Link, useLocation } from 'react-router';
import {
  Building2,
  Plug,
  Sparkles,
  Zap,
  Workflow,
  PlayCircle,
  Activity,
  Settings,
  ChevronRight,
  DollarSign,
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
  { name: 'Tenants', href: '/tenants', icon: Building2 },
  { name: 'Integrations', href: '/integrations', icon: Plug },
  { name: 'Skills', href: '/skills', icon: Sparkles },
  { name: 'Actions', href: '/actions', icon: Zap },
  { name: 'Use Cases', href: '/use-cases', icon: Workflow },
  { name: 'Runs', href: '/runs', icon: PlayCircle },
  {
    name: 'Observability',
    href: '/observability',
    icon: Activity,
    subItems: [
      { name: 'LLM Usage', href: '/observability' },
      { name: 'Cost Ledger', href: '/observability/cost-ledger' },
    ],
  },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Layout() {
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<string[]>(['Observability']);

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
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
          <h1 className="text-sm font-semibold tracking-tight text-gray-900">
            Admin Portal
          </h1>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
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
                          ? 'bg-gray-200 text-gray-900 font-medium'
                          : 'text-gray-700 hover:bg-gray-150 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4" />
                        <span className="text-sm">{item.name}</span>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="mt-1 ml-4 space-y-1">
                        {item.subItems!.map((subItem) => {
                          const subActive = location.pathname === subItem.href;
                          return (
                            <Link
                              key={subItem.href}
                              to={subItem.href}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                                subActive
                                  ? 'bg-gray-200 text-gray-900 font-medium'
                                  : 'text-gray-700 hover:bg-gray-150 hover:text-gray-900'
                              }`}
                            >
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
                        ? 'bg-gray-200 text-gray-900 font-medium'
                        : 'text-gray-700 hover:bg-gray-150 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{item.name}</span>
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
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
