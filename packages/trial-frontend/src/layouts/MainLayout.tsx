import { useLocation, useNavigate } from 'react-router-dom';

interface Tab {
  icon: string;
  label: string;
  path: string;
}

const tabs: Tab[] = [
  { icon: '🏠', label: 'Home', path: '/' },
  { icon: '🚀', label: 'Deploy', path: '/deploy' },
  { icon: '🤖', label: 'Agents', path: '/agents' },
  { icon: '⚙️', label: 'Admin', path: '/admin' },
];

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.clear();
    window.location.href = '/';
  }

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 pb-24">
        {children}
      </main>

      {/* Fixed bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 pb-safe">
        <div className="flex items-stretch h-16">
          {tabs.map((tab) => {
            const isActive = tab.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(tab.path);

            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors relative
                  ${isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
              >
                {isActive && (
                  <span className="absolute top-0 left-2 right-2 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-b" />
                )}
                <span className="text-lg leading-none">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}

          {/* Logout tab */}
          <button
            onClick={handleLogout}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            <span className="text-lg leading-none">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default MainLayout;
