import React from 'react';
import { Item } from '../types.js';
import { MapPin, Calendar, Tag, ShieldCheck } from 'lucide-react';
import { getImageUrl } from '../config.js';

interface Props {
  item: Item;
  onClick?: () => void;
  similarityScore?: number;
}

export const ItemCard: React.FC<Props> = ({ item, onClick, similarityScore }) => {
  const isLost = item.type === 'LOST';

  const formattedDate = new Date(item.event_time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer flex flex-col group"
    >
      {/* Photo Header */}
      <div className="relative h-44 bg-slate-100 overflow-hidden flex items-center justify-center">
        {item.image_url ? (
          <img
            src={getImageUrl(item.image_url)}
            alt={item.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
            <Tag className="w-10 h-10 mb-1 opacity-50" />
            <span className="text-xs font-medium">No photo provided</span>
          </div>
        )}

        {/* Type Badge */}
        <div className="absolute top-3 left-3 flex gap-2">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase shadow-sm ${
              isLost
                ? 'bg-rose-500 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {item.type}
          </span>
        </div>

        {/* Status Badge */}
        <div className="absolute top-3 right-3">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide shadow-sm ${
              item.status === 'OPEN'
                ? 'bg-blue-600 text-white'
                : item.status === 'MATCHED'
                ? 'bg-amber-500 text-white'
                : 'bg-slate-700 text-white'
            }`}
          >
            {item.status}
          </span>
        </div>

        {/* Optional similarity indicator overlay */}
        {typeof similarityScore === 'number' && (
          <div className="absolute bottom-2 right-2 bg-slate-900/90 text-white px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-xs flex items-center gap-1">
            <span>{Math.round(similarityScore * 100)}% Match</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
            <span className="bg-slate-100 px-2 py-0.5 rounded-md text-slate-700">
              {item.category}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formattedDate}
            </span>
          </div>

          <h3 className="font-semibold text-slate-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
            {item.title}
          </h3>

          <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 truncate max-w-[200px]" title={item.location}>
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{item.location}</span>
          </div>

          <span className="text-blue-600 font-semibold group-hover:underline shrink-0">
            View &rarr;
          </span>
        </div>
      </div>
    </div>
  );
};
