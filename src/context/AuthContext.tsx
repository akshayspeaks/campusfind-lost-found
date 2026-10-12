import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types.js';
import {
  api,
  getStoredToken,
  setStoredToken,
  setStoredRefreshToken,
  clearTokens,
} from '../services/api.js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    contact_info?: string;
    role?: string;
  }) => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  unreadNotifs: number;
  setUnreadNotifs: React.Dispatch<React.SetStateAction<number>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const data = await api.getMe();
      setUser(data.user);
      // Fetch notifications count
      try {
        const notifData = await api.getNotifications();
        setUnreadNotifs(notifData.unread_count);
      } catch {
        // ignore
      }
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const data = await api.login({ email, password });
    setStoredToken(data.token);
    if (data.refreshToken) {
      setStoredRefreshToken(data.refreshToken);
    }
    setUser(data.user);
    try {
      const notifData = await api.getNotifications();
      setUnreadNotifs(notifData.unread_count);
    } catch {
      // ignore
    }
  };

  const register = async (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    contact_info?: string;
    role?: string;
  }) => {
    const data = await api.register(payload);
    setStoredToken(data.token);
    if (data.refreshToken) {
      setStoredRefreshToken(data.refreshToken);
    }
    setUser(data.user);
  };

  const logout = () => {
    api.logout().catch(() => {});
    clearTokens();
    setUser(null);
    setUnreadNotifs(0);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.changePassword({ currentPassword, newPassword });
    // Logout user after password change for security
    logout();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        changePassword,
        refreshUser,
        unreadNotifs,
        setUnreadNotifs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
