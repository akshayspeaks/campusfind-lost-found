import React, { useEffect, useState } from 'react';
import { Notification } from '../types.js';
import { api } from '../services/api.js';
import { X, Bell, Check, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

export const NotificationModal: React.FC<Props> = ({ isOpen, onClose, onNavigate }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { setUnreadNotifs } = useAuth();

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await api.getNotifications();
      setNotifications(data.notifications);
      setUnreadNotifs(data.unread_count);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadNotifs((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadNotifs(0);
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 relative border border-slate-200 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Bell className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Notifications</h3>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
            >
              Mark all read
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto divide-y divide-slate-100 flex-1 my-2">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No notifications yet.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`py-3 px-2 transition-colors ${
                  !n.read ? 'bg-blue-50/40 font-medium' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-900">{n.title}</h4>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>

                <div className="mt-2 flex items-center justify-between text-xs">
                  {n.link ? (
                    <button
                      onClick={() => {
                        onClose();
                        onNavigate(n.link!);
                      }}
                      className="text-blue-600 hover:underline flex items-center gap-1 font-semibold text-[11px] cursor-pointer"
                    >
                      <span>View details</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  ) : <span />}

                  {!n.read && (
                    <button
                      onClick={() => handleMarkAsRead(n.id)}
                      className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-[10px] cursor-pointer"
                    >
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>Dismiss</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
