import React, { useState } from 'react';
import { MatchScoreComponents } from '../types.js';
import { ChevronDown, ChevronUp, Info, Camera, FileText, Tag, MapPin, Clock } from 'lucide-react';

interface Props {
  scores: MatchScoreComponents;
  showExplanationByDefault?: boolean;
}

export const MatchScoreBadge: React.FC<Props> = ({
  scores,
  showExplanationByDefault = false,
}) => {
  const [expanded, setExpanded] = useState(showExplanationByDefault);

  const pct = Math.round(scores.total_score * 100);

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
  let badgeClasses = 'bg-slate-500';

  if (scores.total_score >= 0.80) {
    colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    badgeClasses = 'bg-emerald-600 text-white';
  } else if (scores.total_score >= 0.65) {
    colorClasses = 'bg-blue-50 text-blue-800 border-blue-200';
    badgeClasses = 'bg-blue-600 text-white';
  } else if (scores.total_score >= 0.50) {
    colorClasses = 'bg-amber-50 text-amber-800 border-amber-200';
    badgeClasses = 'bg-amber-600 text-white';
  }

  return (
    <div className={`rounded-xl border p-3.5 ${colorClasses} transition-all duration-200`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${badgeClasses}`}>
            {pct}% Similar
          </span>
          <span className="text-xs font-medium opacity-90">
            {scores.confidence_tier.replace('_', ' ')} CANDIDATE
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs font-medium opacity-80 hover:opacity-100 cursor-pointer"
        >
          <span>Score Breakdown</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>Similarity score — not proof of ownership. Requires verification.</span>
      </p>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-current/10 space-y-2 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            {/* Image */}
            <div className="bg-white/80 rounded-lg p-2 border border-black/5">
              <div className="flex items-center justify-center gap-1 text-slate-500 mb-0.5">
                <Camera className="w-3 h-3" />
                <span className="text-[10px] uppercase font-semibold">Photo</span>
              </div>
              <div className="text-sm font-bold text-slate-900">
                {scores.image_score !== null ? `${Math.round(scores.image_score * 100)}%` : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-500">
                {scores.image_score !== null ? 'Visual feature' : 'No photo (renorm)'}
              </div>
            </div>

            {/* Text */}
            <div className="bg-white/80 rounded-lg p-2 border border-black/5">
              <div className="flex items-center justify-center gap-1 text-slate-500 mb-0.5">
                <FileText className="w-3 h-3" />
                <span className="text-[10px] uppercase font-semibold">Text</span>
              </div>
              <div className="text-sm font-bold text-slate-900">
                {Math.round(scores.text_score * 100)}%
              </div>
              <div className="text-[10px] text-slate-500">Keyword TF-IDF</div>
            </div>

            {/* Category */}
            <div className="bg-white/80 rounded-lg p-2 border border-black/5">
              <div className="flex items-center justify-center gap-1 text-slate-500 mb-0.5">
                <Tag className="w-3 h-3" />
                <span className="text-[10px] uppercase font-semibold">Category</span>
              </div>
              <div className="text-sm font-bold text-slate-900">
                {Math.round(scores.category_score * 100)}%
              </div>
              <div className="text-[10px] text-slate-500">Taxonomy</div>
            </div>

            {/* Location */}
            <div className="bg-white/80 rounded-lg p-2 border border-black/5">
              <div className="flex items-center justify-center gap-1 text-slate-500 mb-0.5">
                <MapPin className="w-3 h-3" />
                <span className="text-[10px] uppercase font-semibold">Location</span>
              </div>
              <div className="text-sm font-bold text-slate-900">
                {Math.round(scores.location_score * 100)}%
              </div>
              <div className="text-[10px] text-slate-500">Proximity</div>
            </div>

            {/* Time */}
            <div className="bg-white/80 rounded-lg p-2 border border-black/5">
              <div className="flex items-center justify-center gap-1 text-slate-500 mb-0.5">
                <Clock className="w-3 h-3" />
                <span className="text-[10px] uppercase font-semibold">Time</span>
              </div>
              <div className="text-sm font-bold text-slate-900">
                {Math.round(scores.time_score * 100)}%
              </div>
              <div className="text-[10px] text-slate-500">Chronology</div>
            </div>
          </div>

          <div className="bg-white/90 rounded-lg p-2.5 border border-black/5 text-slate-700 leading-relaxed text-[11px]">
            <span className="font-semibold text-slate-900">System Rationale: </span>
            {scores.explanation}
          </div>
        </div>
      )}
    </div>
  );
};
