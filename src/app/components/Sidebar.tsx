import { Link, useLocation } from 'react-router';
import { Users, Activity, BarChart3, Settings } from 'lucide-react';

export function Sidebar() {
  const location = useLocation();

  const navItems = [
    { name: 'Tenants', path: '/tenants', icon: Users },
    { name: 'Runs', path: '/runs', icon: Activity },
    { name: 'Observability', path: '/admin/observability', icon: BarChart3 },
    { name: 'Settings', path: '/settings', icon: Settings, disabled: true },
  ];

  return (
    <div className="w-56 border-r border-border bg-white flex flex-col">
      <div className="p-6">
        <div className="text-sm text-foreground tracking-tight">Admin Portal</div>
      </div>

      <nav className="flex-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.disabled ? '#' : item.path}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-md mb-1 transition-colors
                ${
                  item.disabled
                    ? 'text-muted-foreground cursor-not-allowed opacity-50'
                    : isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                }
              `}
              onClick={(e) => item.disabled && e.preventDefault()}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
