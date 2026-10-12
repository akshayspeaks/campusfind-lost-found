import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { ShieldCheck, LogIn, UserPlus, AlertCircle, Lock, EyeOff, Sparkles, ArrowRight } from 'lucide-react';

interface Props {
  onNavigate: (path: string) => void;
  currentPath?: string;
}

export const AuthPage: React.FC<Props> = ({ onNavigate, currentPath }) => {
  const { user, loading: authLoading, login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [role, setRole] = useState<'STUDENT' | 'FACULTY' | 'MODERATOR'>('STUDENT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse and sanitize returnTo target to prevent open redirects
  const searchPart = (currentPath && currentPath.includes('?'))
    ? currentPath.slice(currentPath.indexOf('?'))
    : (typeof window !== 'undefined' ? window.location.search : '');
  const searchParams = new URLSearchParams(searchPart);
  const rawReturnTo = searchParams.get('returnTo');

  const getSafeReturnTarget = (): string => {
    if (
      rawReturnTo &&
      rawReturnTo.startsWith('/') &&
      !rawReturnTo.startsWith('//') &&
      !rawReturnTo.includes('://')
    ) {
      try {
        return decodeURIComponent(rawReturnTo);
      } catch {
        return rawReturnTo;
      }
    }
    return '/dashboard';
  };

  // If already authenticated and not loading, redirect immediately to target
  useEffect(() => {
    if (!authLoading && user) {
      onNavigate(getSafeReturnTarget());
    }
  }, [user, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isRegister) {
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long.');
        }
        await register({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          phone: phone.trim() || undefined,
          contact_info: contactInfo.trim() || undefined,
          role,
        });
      } else {
        await login(email.trim().toLowerCase(), password);
      }
      onNavigate(getSafeReturnTarget());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Auth Form Box */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          {rawReturnTo && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-blue-900 text-xs flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0 text-blue-600" />
              <span>
                Please sign in or create an account to access{' '}
                <strong className="font-semibold text-blue-950">
                  {rawReturnTo.includes('report-lost')
                    ? 'Report Lost Item'
                    : rawReturnTo.includes('report-found')
                    ? 'Report Found Item'
                    : rawReturnTo.includes('claims')
                    ? 'My Claims'
                    : rawReturnTo.includes('moderator')
                    ? 'Moderator Queue'
                    : 'your requested page'}
                </strong>
                . You will be redirected immediately upon authentication.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="text-xl font-bold text-slate-900">
              {isRegister ? 'Create Campus Account' : 'Campus Portal Sign In'}
            </h2>
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsRegister(false);
                  setError(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  !isRegister ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRegister(true);
                  setError(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  isRegister ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {isRegister && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Campus Email <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@university.edu"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Password <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {isRegister && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Must be at least 8 characters with upper, lower, number, and special symbol.
                </p>
              )}
            </div>

            {isRegister && (
              <>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Campus Affiliation
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'STUDENT' | 'FACULTY' | 'MODERATOR')}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="STUDENT">Student</option>
                    <option value="FACULTY">Faculty / Staff</option>
                    <option value="MODERATOR">Campus Safety / Moderator</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Phone Number (Protected until claim approval)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 019-2831"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Default Handover Location / Notes
                  </label>
                  <input
                    type="text"
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder="e.g. Student Center or Residence Hall"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                'Authenticating...'
              ) : isRegister ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Register Account</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </>
              )}
            </button>

            <div className="pt-2 text-center">
              {isRegister ? (
                <p className="text-xs text-slate-500">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegister(false);
                      setError(null);
                    }}
                    className="text-blue-600 font-bold hover:underline cursor-pointer"
                  >
                    Sign In here
                  </button>
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Don&apos;t have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegister(true);
                      setError(null);
                    }}
                    className="text-blue-600 font-bold hover:underline cursor-pointer"
                  >
                    Register new account
                  </button>
                </p>
              )}
            </div>
          </form>
        </div>

        {/* Security & Verification Information Card */}
        <div className="space-y-4">
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-7 space-y-6">
            <div className="flex items-center gap-2 text-blue-400">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="font-bold text-sm">Security &amp; Privacy Architecture</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              CampusFind protects institutional privacy while facilitating rapid recovery of lost student belongings:
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700">
                <div className="p-2 rounded-xl bg-blue-900/50 text-blue-400 shrink-0">
                  <EyeOff className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white">Private Contact Masking</div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Personal emails and telephone numbers are never published publicly. Contact details unlock strictly after a moderator approves an ownership claim.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700">
                <div className="p-2 rounded-xl bg-purple-900/50 text-purple-400 shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white">Cryptographic Sessions &amp; Rate Limits</div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Short-lived tokens and secure refresh token rotation prevent session hijacking. Bruteforce protection locks out suspicious repeated attempts.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700">
                <div className="p-2 rounded-xl bg-emerald-900/50 text-emerald-400 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white">Multi-Vector AI Match Engine</div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Cross-references MobileNet visual feature vectors, spatio-temporal campus heuristics, and semantic categorization to pair items reliably.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
