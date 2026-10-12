import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
  requiredRole?: 'MODERATOR' | 'ADMIN';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  currentPath,
  onNavigate,
  requiredRole,
}) => {
  const { user, loading } = useAuth();

  useEffect(() => {
    // Only redirect once authentication state is determined (loading === false)
    if (!loading && !user) {
      const safeReturnTo = encodeURIComponent(currentPath);
      onNavigate(`/auth?returnTo=${safeReturnTo}`);
    }
  }, [loading, user, currentPath, onNavigate]);

  // 1. Session is still being restored: render loading state without premature redirect
  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 space-y-4">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium tracking-wide">
          Verifying campus session credentials...
        </p>
      </div>
    );
  }

  // 2. Unauthenticated: transition view while redirect effect executes
  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 space-y-4">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium tracking-wide">
          Authentication required. Redirecting to campus login...
        </p>
      </div>
    );
  }

  // 3. Role-based authorization check (for staff / moderator areas)
  if (requiredRole) {
    const isStaff = user.role === 'MODERATOR' || user.role === 'ADMIN';
    if (!isStaff) {
      return (
        <div className="max-w-md mx-auto px-4 py-20 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">Restricted Access (403 Forbidden)</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              This panel is restricted to verified Campus Safety Officers and Administrators. Your
              account ({user.email}) currently has the{' '}
              <span className="font-bold text-slate-800 uppercase">{user.role}</span> role.
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => onNavigate('/dashboard')}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              Return to Dashboard
            </button>
            <button
              onClick={() => onNavigate('/browse')}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Browse Public Items
            </button>
          </div>
        </div>
      );
    }
  }

  // 4. Authenticated & authorized
  return <>{children}</>;
};
