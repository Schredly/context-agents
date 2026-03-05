import { Outlet, Link, useLocation } from 'react-router';
import {
  Building2,
  Plug,
  Sparkles,
  Workflow,
  PlayCircle,
  Activity,
  Settings,
} from 'lucide-react';
import { TopBar } from './TopBar';
import { Toaster } from '../components/ui/sonner';

const navigation = [
  { name: 'Tenants', href: '/tenants', icon: Building2 },
  { name: 'Integrations', href: '/integrations', icon: Plug },
  { name: 'Skills', href: '/skills', icon: Sparkles },
  { name: 'Use Cases', href: '/use-cases', icon: Workflow },
  { name: 'Runs', href: '/runs', icon: PlayCircle },
  { name: 'Observability', href: '/observability', icon: Activity },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Layout() {
  const location = useLocation();

  const isActive = (href: string) => {
    return location.pathname.startsWith(href);
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
            return (
              <Link
                key={item.name}
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
