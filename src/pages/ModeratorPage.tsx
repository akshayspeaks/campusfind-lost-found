import React, { useEffect, useState } from 'react';
import { EnrichedClaim, AuditLog, Item } from '../types.js';
import { api, getImageUrl } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  User,
  History,
  Sparkles,
  ExternalLink,
  Tag,
  Check,
  X,
} from 'lucide-react';

interface Props {
  onNavigate: (path: string) => void;
}

export const ModeratorPage: React.FC<Props> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    open_items: 0,
    matched_items: 0,
    resolved_items: 0,
    pending_claims: 0,
  });
  const [pendingClaims, setPendingClaims] = useState<EnrichedClaim[]>([]);
  const [highConfidenceMatches, setHighConfidenceMatches] = useState<
    Array<{
      id: string;
      total_score: number;
      explanation: string;
      lost_item: Item;
      found_item: Item;
    }>
  >([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Review modal state
  const [reviewingClaim, setReviewingClaim] = useState<EnrichedClaim | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [moderatorNote, setModeratorNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [notification, setNotification] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadModeratorData();
  }, [user]);

  const loadModeratorData = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminDashboard();
      setStats(data.stats);
      setPendingClaims(data.pending_claims);
      setHighConfidenceMatches(data.high_confidence_matches);
      setAuditLogs(data.recent_audit_logs);
    } catch (err) {
      console.error('Failed to load moderation dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async () => {
    if (!reviewingClaim || !actionType) return;
    if (actionType === 'REJECT' && !moderatorNote.trim()) {
      setNotification({ kind: 'error', message: 'Please provide a reason for rejecting the claim.' });
      return;
    }

    setProcessing(true);
    try {
      if (actionType === 'APPROVE') {
        await api.approveClaim(reviewingClaim.id, moderatorNote.trim() || undefined);
      } else {
        await api.rejectClaim(reviewingClaim.id, moderatorNote.trim());
      }
      setReviewingClaim(null);
      setActionType(null);
      setModeratorNote('');
      setNotification({
        kind: 'success',
        message: actionType === 'APPROVE' ? 'Claim approved successfully.' : 'Claim rejected successfully.',
      });
      await loadModeratorData();
    } catch (err) {
      setNotification({ kind: 'error', message: err instanceof Error ? err.message : 'Action failed' });
    } finally {
      setProcessing(false);
    }
  };

  const isStaff = user?.role === 'MODERATOR' || user?.role === 'ADMIN';

  if (!isStaff) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-slate-400 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Restricted Access</h2>
        <p className="text-xs text-slate-500">
          This panel is restricted to verified Campus Safety Officers and Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-amber-600" />
            <span>Campus Safety &amp; Moderation Center</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Privacy-first ownership claim verification and multimodal match oversight.
          </p>
        </div>

        <button
          onClick={loadModeratorData}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer w-fit"
        >
          Refresh Data
        </button>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Pending Claims</div>
          <div className="text-3xl font-extrabold text-amber-600 mt-1">{stats.pending_claims}</div>
          <div className="text-[11px] text-slate-400 mt-1">Requires officer review</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Open Listings</div>
          <div className="text-3xl font-extrabold text-blue-600 mt-1">{stats.open_items}</div>
          <div className="text-[11px] text-slate-400 mt-1">Lost &amp; found active</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Matched Pairs</div>
          <div className="text-3xl font-extrabold text-purple-600 mt-1">{stats.matched_items}</div>
          <div className="text-[11px] text-slate-400 mt-1">Claims approved</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Safely Returned</div>
          <div className="text-3xl font-extrabold text-emerald-600 mt-1">{stats.resolved_items}</div>
          <div className="text-[11px] text-slate-400 mt-1">Handover completed</div>
        </div>
      </div>

      {notification && (
        <div
          role={notification.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={notification.kind === 'error'
            ? 'p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700'
            : 'p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700'}
        >
          {notification.message}
        </div>
      )}

      {/* Pending Claims Review Queue */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <h2 className="text-lg font-bold text-slate-900">
            Pending Ownership Claims ({pendingClaims.length})
          </h2>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading claims queue...</div>
        ) : pendingClaims.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
            Queue is clear! No pending claims require review at this moment.
          </div>
        ) : (
          <div className="space-y-4">
            {pendingClaims.map((claim) => (
              <div
                key={claim.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6"
              >
                {/* Item + Claimant Details */}
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">
                      PENDING REVIEW
                    </span>
                    <span className="text-slate-400">
                      Submitted {new Date(claim.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-start gap-4">
                    {/* Item photo preview */}
                    <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                      {claim.item.image_url ? (
                        <img
                          src={getImageUrl(claim.item.image_url)}
                          alt={claim.item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Tag className="w-6 h-6 text-slate-400" />
                      )}
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Target Item: {claim.item.title}
                      </h3>
                      <div className="text-xs text-slate-500">
                        {claim.item.type} • {claim.item.category} • {claim.item.location}
                      </div>
                    </div>
                  </div>

                  {/* Claimant identity info */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      Claimant: {claim.claimant.name}
                    </span>
                    {claim.claimant.email && <span>{claim.claimant.email}</span>}
                    {claim.claimant.phone && <span>{claim.claimant.phone}</span>}
                  </div>

                  {/* Finder detail vs claimant answer (moderator-only) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs space-y-1">
                      <div className="font-bold text-amber-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-600" />
                        <span>Finder's Hidden Detail</span>
                      </div>
                      <p className="text-slate-800 font-medium leading-relaxed">
                        "{claim.finder_verification_detail || 'No finder detail recorded on this legacy item.'}"
                      </p>
                    </div>
                    <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl text-xs space-y-1">
                      <div className="font-bold text-blue-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        <span>Claimant's Answer</span>
                      </div>
                      <p className="text-slate-800 font-medium leading-relaxed">
                        "{claim.verification_answer}"
                      </p>
                    </div>
                  </div>

                  {claim.risk && claim.risk.level !== 'LOW' && (
                    <div className={`p-3 rounded-xl border text-xs ${
                      claim.risk.level === 'HIGH'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                      <span className="font-bold">Risk flag: {claim.risk.level}</span>
                      <span> — {claim.risk.total_claims} total claim(s), {claim.risk.prior_rejections} prior rejection(s) for this claimant.</span>
                    </div>
                  )}

                  {/* Claimant general message */}
                  <p className="text-xs text-slate-600 italic">
                    Note: "{claim.message}"
                  </p>
                </div>

                {/* Moderation Decision Buttons */}
                <div className="flex lg:flex-col gap-2 w-full lg:w-44 shrink-0">
                  <button
                    onClick={() => {
                      setReviewingClaim(claim);
                      setActionType('APPROVE');
                      setModeratorNote('Ownership proof verified. Contact details released for in-person handover.');
                    }}
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve Claim</span>
                  </button>

                  <button
                    onClick={() => {
                      setReviewingClaim(claim);
                      setActionType('REJECT');
                      setModeratorNote('');
                    }}
                    className="flex-1 py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>Reject Claim</span>
                  </button>

                  <button
                    onClick={() => onNavigate(`/items/${claim.item.id}`)}
                    className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>Inspect Item</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* High-Confidence Matches Section */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-bold text-slate-900">
            High-Confidence Algorithmic Pairings ({highConfidenceMatches.length})
          </h2>
        </div>

        {highConfidenceMatches.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
            No active high-confidence candidates (&gt;= 75% similarity) currently awaiting action.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {highConfidenceMatches.map((pair) => (
              <div
                key={pair.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                    {Math.round(pair.total_score * 100)}% Algorithm Score
                  </span>
                  <span className="text-[11px] text-slate-400">Automated Pair</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl space-y-1">
                    <span className="font-bold text-rose-700 uppercase text-[10px]">
                      LOST ITEM
                    </span>
                    <div className="font-bold text-slate-900 line-clamp-1">
                      {pair.lost_item.title}
                    </div>
                    <div className="text-[11px] text-slate-500">{pair.lost_item.location}</div>
                  </div>

                  <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">
                    <span className="font-bold text-emerald-700 uppercase text-[10px]">
                      FOUND ITEM
                    </span>
                    <div className="font-bold text-slate-900 line-clamp-1">
                      {pair.found_item.title}
                    </div>
                    <div className="text-[11px] text-slate-500">{pair.found_item.location}</div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg leading-relaxed">
                  <span className="font-semibold text-slate-800">Rationale: </span>
                  {pair.explanation}
                </p>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => onNavigate(`/items/${pair.lost_item.id}`)}
                    className="px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                  >
                    View Lost Item
                  </button>
                  <button
                    onClick={() => onNavigate(`/items/${pair.found_item.id}`)}
                    className="px-3 py-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer"
                  >
                    View Found Item
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit Log History */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-bold text-slate-900">Moderation Audit Logs</h2>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No logs recorded yet.</div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="p-3 text-xs flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{log.action}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Target: {log.target}
                      </span>
                    </div>
                    {log.note && <div className="text-slate-600 text-[11px]">{log.note}</div>}
                  </div>
                  <div className="text-[10px] text-slate-400 shrink-0">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Review Decision Modal */}
      {reviewingClaim && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {actionType === 'APPROVE' ? 'Confirm Claim Approval' : 'Reject Ownership Claim'}
            </h3>

            <p className="text-xs text-slate-600 leading-relaxed">
              {actionType === 'APPROVE'
                ? 'Approving this claim will immediately unlock private phone and email between claimant and owner, mark the item as MATCHED, and notify both parties.'
                : 'Rejecting this claim will notify the claimant that proof was insufficient.'}
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Moderator Note / Explanation {actionType === 'REJECT' && <span className="text-rose-500">*</span>}
              </label>
              <textarea
                rows={3}
                value={moderatorNote}
                onChange={(e) => setModeratorNote(e.target.value)}
                placeholder={
                  actionType === 'APPROVE'
                    ? 'Optional instructions or verification confirmation...'
                    : 'Explain why evidence was insufficient (e.g. details did not match item features)...'
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {notification?.kind === 'error' && (
              <div role="alert" aria-live="assertive" className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {notification.message}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setReviewingClaim(null);
                  setActionType(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={handleDecision}
                className={`px-5 py-2 text-xs font-bold rounded-xl text-white shadow-xs cursor-pointer ${
                  actionType === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {processing ? 'Processing...' : actionType === 'APPROVE' ? 'Approve & Unlock Contact' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
