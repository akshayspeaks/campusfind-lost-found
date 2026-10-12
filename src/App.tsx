import React, { lazy, Suspense, useEffect, useState } from 'react';
import { AuthProvider } from './context/AuthContext.js';
import { Navbar } from './components/Navbar.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { Lock } from 'lucide-react';

const HomePage = lazy(() => import('./pages/HomePage.js').then((m) => ({ default: m.HomePage })));
const BrowsePage = lazy(() => import('./pages/BrowsePage.js').then((m) => ({ default: m.BrowsePage })));
const ItemDetailPage = lazy(() => import('./pages/ItemDetailPage.js').then((m) => ({ default: m.ItemDetailPage })));
const ReportItemPage = lazy(() => import('./pages/ReportItemPage.js').then((m) => ({ default: m.ReportItemPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage.js').then((m) => ({ default: m.DashboardPage })));
const ModeratorPage = lazy(() => import('./pages/ModeratorPage.js').then((m) => ({ default: m.ModeratorPage })));
const ClaimsPage = lazy(() => import('./pages/ClaimsPage.js').then((m) => ({ default: m.ClaimsPage })));
const AuthPage = lazy(() => import('./pages/AuthPage.js').then((m) => ({ default: m.AuthPage })));

function AppContent() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    try {
      return (window.location.pathname + window.location.search) || '/';
    } catch {
      return '/';
    }
  });

  useEffect(() => {
    const handlePopState = () => {
      try {
        setCurrentPath((window.location.pathname + window.location.search) || '/');
      } catch {
        // fallback
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    try {
      window.history.pushState({}, '', path);
    } catch {
      // In sandboxed iframes or cross-origin contexts where pushState is restricted,
      // silently proceed so the React state routing transitions reliably.
    }
    setCurrentPath(path);
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // ignore
    }
  };

  // Route matching with query string preservation
  const pathname = currentPath.split('?')[0] || '/';

  let pageContent: React.ReactNode = null;

  if (pathname === '/' || pathname === '') {
    pageContent = <HomePage onNavigate={navigate} />;
  } else if (pathname === '/browse') {
    pageContent = <BrowsePage onNavigate={navigate} />;
  } else if (pathname.startsWith('/items/')) {
    const itemId = pathname.replace('/items/', '');
    pageContent = <ItemDetailPage itemId={itemId} onNavigate={navigate} />;
  } else if (pathname === '/auth') {
    pageContent = <AuthPage onNavigate={navigate} currentPath={currentPath} />;
  } else if (pathname === '/report-lost') {
    pageContent = (
      <ProtectedRoute currentPath={currentPath} onNavigate={navigate}>
        <ReportItemPage initialType="LOST" onNavigate={navigate} />
      </ProtectedRoute>
    );
  } else if (pathname === '/report-found') {
    pageContent = (
      <ProtectedRoute currentPath={currentPath} onNavigate={navigate}>
        <ReportItemPage initialType="FOUND" onNavigate={navigate} />
      </ProtectedRoute>
    );
  } else if (pathname === '/dashboard') {
    pageContent = (
      <ProtectedRoute currentPath={currentPath} onNavigate={navigate}>
        <DashboardPage onNavigate={navigate} />
      </ProtectedRoute>
    );
  } else if (pathname === '/claims') {
    pageContent = (
      <ProtectedRoute currentPath={currentPath} onNavigate={navigate}>
        <ClaimsPage onNavigate={navigate} />
      </ProtectedRoute>
    );
  } else if (pathname === '/moderator') {
    pageContent = (
      <ProtectedRoute currentPath={currentPath} onNavigate={navigate} requiredRole="MODERATOR">
        <ModeratorPage onNavigate={navigate} />
      </ProtectedRoute>
    );
  } else {
    pageContent = <HomePage onNavigate={navigate} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      <Navbar currentPath={pathname} onNavigate={navigate} />

      <main className="flex-1">
        <Suspense
          fallback={
            <div className="max-w-4xl mx-auto px-4 py-16 text-center text-xs text-slate-400">
              Loading CampusFind…
            </div>
          }
        >
          {pageContent}
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
              CF
            </div>
            <span className="font-semibold text-slate-800">CampusFind</span>
            <span>— Photo-Matched Lost &amp; Found System</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Privacy-Enforced Contact Protection</span>
            </span>
            <span>•</span>
            <span>Campus Safety &amp; Security Division</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
