import React, { useState, useEffect } from 'react';
import { Item, ItemCategory } from '../types.js';
import { api } from '../services/api.js';
import { ItemCard } from '../components/ItemCard.js';
import { Search, Filter, Compass, Tag, RefreshCw } from 'lucide-react';

const CATEGORIES: (ItemCategory | 'ALL')[] = [
  'ALL',
  'Electronics',
  'Wallet',
  'ID Card',
  'Keys',
  'Books',
  'Clothing',
  'Bag',
  'Jewelry',
  'Documents',
  'Accessories',
  'Other',
];

interface Props {
  onNavigate: (path: string) => void;
  initialType?: string;
}

export const BrowsePage: React.FC<Props> = ({ onNavigate, initialType }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>(initialType || 'ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await api.getItems({
        type: typeFilter !== 'ALL' ? typeFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        q: searchQuery.trim() || undefined,
        location: locationQuery.trim() || undefined,
      });
      setItems(data.items);
    } catch (err) {
      console.error('Failed to load items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [typeFilter, categoryFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchItems();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Compass className="w-6 h-6 text-blue-600" />
            <span>Campus Items Directory</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Search, filter, and inspect verified lost &amp; found items across campus.
          </p>
        </div>

        {/* Type Switcher Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTypeFilter('ALL')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              typeFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Items
          </button>
          <button
            onClick={() => setTypeFilter('LOST')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              typeFilter === 'LOST'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Lost
          </button>
          <button
            onClick={() => setTypeFilter('FOUND')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              typeFilter === 'FOUND'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Found
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by keywords (e.g. 'Samsung phone', 'water bottle', 'keys')..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="sm:w-64">
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              placeholder="Campus location (e.g. 'Library', 'Dining')..."
              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search</span>
          </button>
        </form>

        {/* Category & Status Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          {/* Categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-slate-400 text-xs">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none text-slate-700 bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open (Unclaimed)</option>
              <option value="MATCHED">Matched</option>
              <option value="RESOLVED">Resolved (Returned)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div>
          Showing <span className="font-bold text-slate-900">{items.length}</span> items
        </div>
        <button
          onClick={fetchItems}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Items Grid */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Loading campus items...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Compass className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 text-sm">No items found</h3>
          <p className="text-xs text-slate-500">
            No active posts match your current search and filter criteria. Try clearing search terms or selecting 'All Items'.
          </p>
          <button
            onClick={() => {
              setTypeFilter('ALL');
              setCategoryFilter('ALL');
              setStatusFilter('ALL');
              setSearchQuery('');
              setLocationQuery('');
            }}
            className="mt-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onClick={() => onNavigate(`/items/${item.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
