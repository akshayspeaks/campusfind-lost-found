import React, { useEffect, useState } from 'react';
import { Item, EnrichedMatch } from '../types.js';
import { api, getImageUrl } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { MatchScoreBadge } from '../components/MatchScoreBadge.js';
import { ClaimModal } from '../components/ClaimModal.js';
import {
  MapPin,
  Calendar,
  Tag,
  ShieldCheck,
  Lock,
  Phone,
  Mail,
  User as UserIcon,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface Props {
  itemId: string;
  onNavigate: (path: string) => void;
}

export const ItemDetailPage: React.FC<Props> = ({ itemId, onNavigate }) => {
  const { user } = useAuth();
  const [item, setItem] = useState<Item | null>(null);
  const [owner, setOwner] = useState<{
    id: string;
    name: string;
    email?: string;
    phone?: string | null;
    contact_info?: string | null;
  } | null>(null);
  const [canViewContact, setCanViewContact] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [matches, setMatches] = useState<EnrichedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [handoverCode, setHandoverCode] = useState('');
  const [handoverUpdating, setHandoverUpdating] = useState(false);
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [handoverSuccess, setHandoverSuccess] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [verificationDetail, setVerificationDetail] = useState('');
  const [verificationUpdating, setVerificationUpdating] = useState(false);
  const [hasVerificationDetail, setHasVerificationDetail] = useState<boolean | null>(null);
  const [handover, setHandover] = useState<{
    claim_id: string;
    code?: string;
    claimant_confirmed_at?: string | null;
    finder_confirmed_at?: string | null;
    viewer_side: 'CLAIMANT' | 'FINDER';
  } | null>(null);

  useEffect(() => {
    loadItemDetails();
  }, [itemId, user]);

  const loadItemDetails = async () => {
    setLoading(true);
    try {
      const data = await api.getItem(itemId);
      setItem(data.item);
      setOwner(data.owner);
      setCanViewContact(data.can_view_contact);
      setIsOwner(data.is_owner);
      setHandover(data.handover || null);
      setHasVerificationDetail(data.has_verification_detail ?? null);
      setHandoverCode('');
      setHandoverError(null);

      // Fetch matches for this item
      try {
        const matchesData = await api.getItemMatches(itemId);
        setMatches(matchesData.matches);
      } catch {
        // ignore
      }
    } catch (err) {
      console.error('Failed to load item:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!item) return;
    setStatusUpdating(true);
    try {
      await api.updateItemStatus(item.id, newStatus);
      await loadItemDetails();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-xs text-slate-400">
        Loading item information...
      </div>
    );
  }

  const handleHandoverConfirm = async () => {
    if (!handover) return;
    if (handover.viewer_side === 'FINDER' && handoverCode.trim().length !== 6) {
      setHandoverError('Enter the 6-digit handover code provided by the claimant.');
      return;
    }
    setHandoverUpdating(true);
    setHandoverError(null);
    setHandoverSuccess(null);
    try {
      const result = await api.confirmHandover(
        handover.claim_id,
        handover.viewer_side === 'FINDER' ? handoverCode.trim() : undefined
      );
      setHandoverCode('');
      setHandoverSuccess(result.message);
      await loadItemDetails();
    } catch (err) {
      setHandoverError(err instanceof Error ? err.message : 'Failed to confirm handover.');
    } finally {
      setHandoverUpdating(false);
    }
  };

  const handleVerificationDetailSave = async () => {
    if (!item || !verificationDetail.trim()) return;
    setVerificationUpdating(true);
    try {
      await api.updateVerificationDetail(item.id, verificationDetail.trim());
      setVerificationDetail('');
      setHasVerificationDetail(true);
      await loadItemDetails();
    } catch (err) {
      setHandoverError(err instanceof Error ? err.message : 'Failed to save verification detail.');
    } finally {
      setVerificationUpdating(false);
    }
  };

  if (!item || !owner) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-slate-400 mx-auto" />
        <h2 className="text-base font-bold text-slate-900">Item Not Found</h2>
        <p className="text-xs text-slate-500">The requested post does not exist or has been removed.</p>
        <button
          onClick={() => onNavigate('/browse')}
          className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl cursor-pointer"
        >
          Back to Directory
        </button>
      </div>
    );
  }

  const isLost = item.type === 'LOST';
  const isStaff = user?.role === 'MODERATOR' || user?.role === 'ADMIN';

  const formattedDate = new Date(item.event_time).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back link */}
      <button
        onClick={() => onNavigate('/browse')}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Items Directory</span>
      </button>

      {pageError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
          {pageError}
        </div>
      )}

      {/* Main Item Detail Card */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs grid grid-cols-1 md:grid-cols-2">
        {/* Photo Column */}
        <div className="bg-slate-100 relative min-h-[280px] md:min-h-[420px] flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-r border-slate-200">
          {item.image_url ? (
            <img
              src={getImageUrl(item.image_url)}
              alt={item.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center p-8 text-slate-400">
              <Tag className="w-16 h-16 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-medium">No photo uploaded with this report</p>
            </div>
          )}

          {/* Badges Overlay */}
          <div className="absolute top-4 left-4 flex gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${
                isLost ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white'
              }`}
            >
              {item.type}
            </span>
          </div>

          <div className="absolute top-4 right-4">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider shadow-sm ${
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
        </div>

        {/* Content Details Column */}
        <div className="p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md font-semibold">
                {item.category}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formattedDate}
              </span>
            </div>

            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-snug">
              {item.title}
            </h1>

            <div className="space-y-1 text-xs">
              <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Description
              </div>
              <p className="text-slate-700 leading-relaxed text-sm whitespace-pre-line">
                {item.description}
              </p>
            </div>

            <div className="flex items-start gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-900">Reported Location: </span>
                {item.location}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600">
              <UserIcon className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="font-semibold text-slate-900">Reported By: </span>
                {owner.name}
              </div>
            </div>
          </div>

          {handover && item.status !== 'RESOLVED' && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs space-y-3">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                <span>Handover Confirmation</span>
              </div>
              <p className="text-indigo-800 leading-relaxed">
                {handover.viewer_side === 'FINDER'
                  ? 'Ask the claimant for the 6-digit handover code when you meet. Enter it only after the item has been physically returned.'
                  : 'Show the 6-digit handover code to the finder when you meet, then confirm receipt after the item is physically returned.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="bg-white/80 border border-indigo-100 rounded-lg p-2.5">
                  Finder: {handover.finder_confirmed_at ? 'Confirmed' : 'Waiting'}
                </div>
                <div className="bg-white/80 border border-indigo-100 rounded-lg p-2.5">
                  Claimant: {handover.claimant_confirmed_at ? 'Confirmed' : 'Waiting'}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                {handover.viewer_side === 'FINDER' ? (
                  <input
                    inputMode="numeric"
                    maxLength={6}
                    value={handoverCode}
                    onChange={(e) => setHandoverCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    className="flex-1 px-3 py-2 text-xs border border-indigo-200 rounded-xl bg-white font-mono tracking-[0.25em]"
                  />
                ) : (
                  <div className="flex-1 px-3 py-2 rounded-xl bg-white border border-indigo-100 font-mono tracking-[0.3em] text-indigo-900 font-bold">
                    {handover.code}
                  </div>
                )}
                <button
                  type="button"
                  disabled={handoverUpdating || (handover.viewer_side === 'FINDER' && handoverCode.length !== 6)}
                  onClick={handleHandoverConfirm}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl cursor-pointer disabled:cursor-not-allowed"
                >
                  {handoverUpdating
                    ? 'Confirming…'
                    : handover.viewer_side === 'FINDER'
                    ? 'Confirm Exchange'
                    : 'I Received My Item'}
                </button>
              </div>
              <div className="text-[11px] text-indigo-700">
                Your role: {handover.viewer_side === 'FINDER' ? 'Finder' : 'Claimant'}
              </div>
              {handoverError && <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700">{handoverError}</div>}
              {handoverSuccess && <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700">{handoverSuccess}</div>}
            </div>
          )}

          {item.type === 'FOUND' && (isOwner || isStaff) && hasVerificationDetail === false && item.status !== 'RESOLVED' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-3">
              <div className="font-bold text-amber-900">Add the private finder verification detail</div>
              <p className="text-amber-800">
                This legacy FOUND item has no hidden detail yet. Add a specific fact the genuine owner should know; it will stay out of public item responses.
              </p>
              <textarea
                rows={3}
                value={verificationDetail}
                onChange={(e) => setVerificationDetail(e.target.value)}
                maxLength={1000}
                placeholder="e.g. Three faint scratches beside the battery cover"
                className="w-full px-3 py-2 text-xs border border-amber-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="button"
                disabled={verificationUpdating || verificationDetail.trim().length < 3}
                onClick={handleVerificationDetailSave}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl cursor-pointer disabled:cursor-not-allowed"
              >
                {verificationUpdating ? 'Saving…' : 'Save Verification Detail'}
              </button>
              {handoverError && <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700">{handoverError}</div>}
            </div>
          )}

          {/* Action Area & Privacy Box */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            {/* Privacy Box */}
            {canViewContact ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Authorized Contact Information Unlocked</span>
                </div>
                <p className="text-emerald-700 text-[11px]">
                  You have verified authorization to contact this user for item handover:
                </p>
                <div className="space-y-1 font-mono text-slate-800 bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                  {owner.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{owner.phone}</span>
                    </div>
                  )}
                  {owner.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{owner.email}</span>
                    </div>
                  )}
                  {owner.contact_info && (
                    <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                      {owner.contact_info}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="text-slate-600 leading-relaxed text-[11px]">
                  <strong className="text-slate-800">Privacy Protected: </strong>
                  Contact phone and email are withheld by server authorization. Submit an ownership claim below to request moderator verification.
                </div>
              </div>
            )}

            {/* Claim / Status Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Claim Button */}
              {!isOwner && item.status !== 'RESOLVED' && (
                <button
                  onClick={() => {
                    if (!user) {
                      onNavigate('/auth');
                    } else {
                      setClaimModalOpen(true);
                    }
                  }}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Request Claim &amp; Verify</span>
                </button>
              )}

              {/* Status transition if owner or moderator */}
              {(isOwner || isStaff) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Status:</span>
                  <select
                    disabled={statusUpdating}
                    value={item.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800 bg-white cursor-pointer"
                  >
                    <option value="OPEN">Mark as OPEN</option>
                    <option value="MATCHED">Mark as MATCHED</option>
                    <option value="RESOLVED">Mark as RESOLVED (Returned)</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Suggested Matches Section */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Compatible Match Candidates ({matches.length})
              </h2>
              <p className="text-xs text-slate-500">
                Transparent similarity scores combining visual features, keyword TF-IDF, category, proximity, and time decay.
              </p>
            </div>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
            No compatible {item.type === 'LOST' ? 'FOUND' : 'LOST'} posts currently score above threshold.
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((m) => (
              <div
                key={m.candidate_item.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 flex-1">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200">
                    {m.candidate_item.image_url ? (
                      <img
                        src={getImageUrl(m.candidate_item.image_url)}
                        alt={m.candidate_item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Tag className="w-6 h-6 text-slate-400" />
                    )}
                  </div>

                  {/* Title & Info */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-bold text-slate-700 uppercase">
                        {m.candidate_item.type}
                      </span>
                      <span>•</span>
                      <span>{m.candidate_item.category}</span>
                      <span>•</span>
                      <span>{m.candidate_item.location}</span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm hover:text-blue-600 transition-colors">
                      {m.candidate_item.title}
                    </h4>
                    <p className="text-xs text-slate-600 line-clamp-1 max-w-xl">
                      {m.candidate_item.description}
                    </p>
                  </div>
                </div>

                {/* Score & View Button */}
                <div className="w-full md:w-auto md:min-w-[320px] flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex-1">
                    <MatchScoreBadge scores={m.scores} />
                  </div>

                  <button
                    onClick={() => onNavigate(`/items/${m.candidate_item.id}`)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>Inspect</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Claim Modal */}
      <ClaimModal
        item={item}
        isOpen={claimModalOpen}
        onClose={() => setClaimModalOpen(false)}
        onClaimSubmitted={() => {
          loadItemDetails();
        }}
      />
    </div>
  );
};
