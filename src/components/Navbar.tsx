import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Compass,
  PlusCircle,
  ShieldCheck,
  Bell,
  LogOut,
  LogIn,
  User as UserIcon,
  Search,
  Menu,
  X,
  FileCheck,
  KeyRound,
} from 'lucide-react';
import { NotificationModal } from './NotificationModal.js';
import { ChangePasswordModal } from './ChangePasswordModal.js';

interface Props {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Navbar: React.FC<Props> = ({ currentPath, onNavigate }) => {
  const { user, logout, unreadNotifs } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const isStaff = user?.role === 'MODERATOR' || user?.role === 'ADMIN';

  const handleProtectedNav = (path: string) => {
    if (!user) {
      onNavigate(`/auth?returnTo=${encodeURIComponent(path)}`);
    } else {
      onNavigate(path);
    }
  };

  return (
    <>
      {/* Main Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <div
            onClick={() => onNavigate('/')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs group-hover:bg-blue-700 transition-colors">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-lg text-slate-900 tracking-tight">
                  Campus<span className="text-blue-600">Find</span>
                </span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                  Official Portal
                </span>
              </div>
              <p className="text-[10px] text-slate-500 tracking-tight hidden sm:block">
                Secure Campus Lost &amp; Found
              </p>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => onNavigate('/browse')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                currentPath === '/browse'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Browse Items</span>
            </button>

            <button
              onClick={() => handleProtectedNav('/report-lost')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                currentPath === '/report-lost'
                  ? 'bg-rose-50 text-rose-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <PlusCircle className="w-4 h-4 text-rose-500" />
              <span>Report Lost</span>
            </button>

            <button
              onClick={() => handleProtectedNav('/report-found')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                currentPath === '/report-found'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <PlusCircle className="w-4 h-4 text-emerald-500" />
              <span>Report Found</span>
            </button>

            {user && (
              <button
                onClick={() => onNavigate('/claims')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentPath === '/claims'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <FileCheck className="w-4 h-4" />
                <span>My Claims</span>
              </button>
            )}

            {isStaff && (
              <button
                onClick={() => onNavigate('/moderator')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentPath === '/moderator'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <span>Moderator Queue</span>
              </button>
            )}
          </nav>

          {/* Right Action Icons & User Status */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                {/* Notification Bell */}
                <button
                  onClick={() => setNotifOpen(true)}
                  className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  title="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  {unreadNotifs > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                      {unreadNotifs}
                    </span>
                  )}
                </button>

                {/* Profile Pill */}
                <button
                  onClick={() => onNavigate('/dashboard')}
                  className={`hidden sm:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                    currentPath === '/dashboard'
                      ? 'border-blue-300 bg-blue-50/50 text-blue-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px]">
                    {user.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-slate-900 leading-none">{user.name.split(' ')[0]}</div>
                    <div className="text-[10px] text-slate-500 leading-none mt-0.5">{user.role}</div>
                  </div>
                </button>

                {/* Change Password */}
                <button
                  onClick={() => setChangePasswordOpen(true)}
                  className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                  title="Change Password"
                >
                  <KeyRound className="w-4 h-4" />
                </button>

                {/* Logout */}
                <button
                  onClick={logout}
                  className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => onNavigate('/auth')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Sign In / Register
              </button>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 px-4 py-3 space-y-2 bg-white">
            <button
              onClick={() => {
                onNavigate('/browse');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left py-2 px-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <Compass className="w-4 h-4" />
              Browse Items
            </button>
            <button
              onClick={() => {
                handleProtectedNav('/report-lost');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left py-2 px-3 rounded-lg text-sm font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Report Lost Item
            </button>
            <button
              onClick={() => {
                handleProtectedNav('/report-found');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left py-2 px-3 rounded-lg text-sm font-semibold text-emerald-600 hover:bg-emerald-50 flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Report Found Item
            </button>
            {user ? (
              <>
                <button
                  onClick={() => {
                    onNavigate('/claims');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left py-2 px-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <FileCheck className="w-4 h-4" />
                  My Claims
                </button>
                <button
                  onClick={() => {
                    onNavigate('/dashboard');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left py-2 px-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <UserIcon className="w-4 h-4" />
                  My Dashboard
                </button>
                <button
                  onClick={() => {
                    setChangePasswordOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left py-2 px-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <KeyRound className="w-4 h-4" />
                  Change Password
                </button>
                {isStaff && (
                  <button
                    onClick={() => {
                      onNavigate('/moderator');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left py-2 px-3 rounded-lg text-sm font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 flex items-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    Moderator Queue
                  </button>
                )}
              </>
            ) : (
              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    onNavigate('/auth');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full py-2 px-3 rounded-lg text-sm font-bold text-center bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In / Register</span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Notification Modal Drawer */}
      <NotificationModal
        isOpen={notifOpen}
        onClose={() => setNotifOpen(false)}
        onNavigate={(path) => {
          onNavigate(path);
          setNotifOpen(false);
        }}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </>
  );
};
