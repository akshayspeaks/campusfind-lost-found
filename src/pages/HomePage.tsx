import React, { useEffect, useState } from 'react';
import { Item } from '../types.js';
import { api } from '../services/api.js';
import { ItemCard } from '../components/ItemCard.js';
import {
  Search,
  PlusCircle,
  ShieldCheck,
  Zap,
  Sparkles,
  Camera,
  MapPin,
  Clock,
  ArrowRight,
  Lock,
} from 'lucide-react';

interface Props {
  onNavigate: (path: string) => void;
}

export const HomePage: React.FC<Props> = ({ onNavigate }) => {
  const [recentItems, setRecentItems] = useState<Item[]>([]);
  const [stats, setStats] = useState({ open: 0, matched: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHomeData();
  }, []);

  const loadHomeData = async () => {
    setLoading(true);
    try {
      const itemsRes = await api.getItems();
      setRecentItems(itemsRes.items.slice(0, 6));

      const openCount = itemsRes.items.filter((i) => i.status === 'OPEN').length;
      const matchedCount = itemsRes.items.filter((i) => i.status === 'MATCHED').length;
      const resolvedCount = itemsRes.items.filter((i) => i.status === 'RESOLVED').length;
      setStats({ open: openCount, matched: matchedCount, resolved: resolvedCount });
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12 pb-16">
      {/* Hero Section */}
      <section className="bg-radial from-blue-50 via-white to-slate-50 border-b border-slate-200 py-12 sm:py-16 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Pretrained Visual Feature Extraction &amp; Multimodal Similarity</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Find what was lost. <br />
            <span className="text-blue-600">Return what was found.</span>
          </h1>

          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            CampusFind replaces noisy chat groups and lost noticeboards with transparent, photo-matched lost and found.
            Private contact details remain strictly hidden until campus safety moderators verify ownership.
          </p>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onNavigate('/report-lost')}
              className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Report Lost Item</span>
            </button>

            <button
              onClick={() => onNavigate('/report-found')}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Report Found Item</span>
            </button>

            <button
              onClick={() => onNavigate('/browse')}
              className="px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm border border-slate-300 shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Search className="w-4 h-4 text-slate-500" />
              <span>Search Campus Items</span>
            </button>
          </div>

          {/* Quick Metrics Counter */}
          <div className="pt-6 grid grid-cols-3 max-w-md mx-auto gap-4 border-t border-slate-200 text-center">
            <div>
              <div className="text-2xl font-extrabold text-blue-600">{stats.open}</div>
              <div className="text-xs text-slate-500 font-medium">Active Posts</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-amber-600">{stats.matched}</div>
              <div className="text-xs text-slate-500 font-medium">Verified Matches</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-emerald-600">{stats.resolved}</div>
              <div className="text-xs text-slate-500 font-medium">Safely Returned</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works: 4 Transparent Steps */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">How CampusFind Works</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Explainable multimodal matching with privacy-preserving verification
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Step 1 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold mb-3">
              1
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Post Item</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Submit description, category, campus zone, and optional photo. MobileNet generates visual feature vectors locally.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold mb-3">
              2
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Multimodal Match</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Transparent engine computes cosine image similarity, TF-IDF text overlap, taxonomy, GPS/location proximity, and time decay.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold mb-3">
              3
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Private Verification</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Potential owner provides secret identifying details. Campus safety officer reviews evidence in the moderation queue.
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold mb-3">
              4
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Safe Handover</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Once approved, contact details unlock exclusively between claimant and finder for secure return.
            </p>
          </div>
        </div>
      </section>

      {/* Privacy Guarantee Callout */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full">
              <Lock className="w-3.5 h-3.5" />
              <span>Zero Public Contact Exposure</span>
            </div>
            <h3 className="text-xl font-bold">Privacy-Enforced by Backend Authorization</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Students frequently avoid campus lost and found because public noticeboards expose their personal cell phone numbers and emails to anyone. CampusFind guarantees your contact information is NEVER visible on public item listings.
            </p>
          </div>

          <div className="shrink-0">
            <button
              onClick={() => onNavigate('/browse')}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span>Explore Verified Items</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Recent Items Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Recent Campus Reports</h2>
            <p className="text-xs text-slate-500">Live feed of lost and found belongings</p>
          </div>
          <button
            onClick={() => onNavigate('/browse')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
          >
            <span>View all items</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading campus posts...</div>
        ) : recentItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">No active posts yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recentItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onClick={() => onNavigate(`/items/${item.id}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
