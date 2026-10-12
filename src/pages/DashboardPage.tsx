import React, { useEffect, useState } from 'react';
import { Item, EnrichedClaim } from '../types.js';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { ItemCard } from '../components/ItemCard.js';
import {
  User as UserIcon,
  Phone,
  Mail,
  ShieldCheck,
  FileCheck,
  Package,
  PlusCircle,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertCircle,
  Lock,
} from 'lucide-react';

interface Props {
  onNavigate: (path: string) => void;
}

export const DashboardPage: React.FC<Props> = ({ onNavigate }) => {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'items' | 'claims'>('items');
  const [myItems, setMyItems] = useState<Item[]>([]);
  const [myClaims, setMyClaims] = useState<EnrichedClaim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsRes, claimsRes] = await Promise.all([
        api.getItems({ owner_id: user?.id }),
        api.getUserClaims(),
      ]);
      setMyItems(itemsRes.items);
      setMyClaims(claimsRes.claims);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center space-y-4">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-500 font-medium">Checking campus session credentials...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Sign in to view dashboard</h2>
        <p className="text-xs text-slate-500">
          Access your reported belongings, match notifications, and claims.
        </p>
        <button
          onClick={() => onNavigate('/auth?returnTo=%2Fdashboard')}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl cursor-pointer"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Profile Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white font-bold text-2xl flex items-center justify-center shadow-xs">
            {user.name.charAt(0)}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{user.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-blue-100 text-blue-800">
                {user.role}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                {user.email}
              </span>
              {user.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {user.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onNavigate('/report-lost')}
            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Report Lost</span>
          </button>
          <button
            onClick={() => onNavigate('/report-found')}
            className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Report Found</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('items')}
          className={`pb-3 text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer border-b-2 ${
            activeTab === 'items'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>My Reported Items ({myItems.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('claims')}
          className={`pb-3 text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer border-b-2 ${
            activeTab === 'claims'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>My Ownership Claims ({myClaims.length})</span>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading records...</div>
      ) : activeTab === 'items' ? (
        myItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto space-y-3">
            <Package className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-900 text-sm">No items reported yet</h3>
            <p className="text-xs text-slate-500">
              You haven't reported any lost or found items on campus yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {myItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onClick={() => onNavigate(`/items/${item.id}`)}
              />
            ))}
          </div>
        )
      ) : (
        /* Claims list */
        myClaims.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto space-y-3">
            <FileCheck className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-900 text-sm">No claims submitted</h3>
            <p className="text-xs text-slate-500">
              When you recognize your lost belonging among found items, request a claim to initiate moderator review.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {myClaims.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        c.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {c.status}
                    </span>
                    <span className="text-xs text-slate-400">
                      Filed {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900">
                    Claim on: {c.item.title}
                  </h3>

                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <strong className="text-slate-700">Verification detail submitted: </strong>
                    {c.verification_answer}
                  </p>

                  {/* Moderator feedback if reviewed */}
                  {c.moderator_note && (
                    <div className="text-xs p-2.5 rounded-xl bg-blue-50/70 border border-blue-100 text-blue-900">
                      <strong className="text-blue-800">Safety Officer Note: </strong>
                      {c.moderator_note}
                    </div>
                  )}

                  {/* If Approved, show unlocked contact details */}
                  {c.status === 'APPROVED' && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                      <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Contact Unlocked for Return Handover</span>
                      </div>
                      <div className="text-emerald-900 font-mono">
                        {c.owner.name} • {c.owner.phone || c.owner.email}
                      </div>
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => onNavigate(`/items/${c.item_id}`)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>View Item</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};
