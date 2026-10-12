import React, { useEffect, useState } from 'react';
import { EnrichedClaim } from '../types.js';
import { api, getImageUrl } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import {
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Phone,
  Mail,
  ExternalLink,
  PlusCircle,
} from 'lucide-react';

interface Props {
  onNavigate: (path: string) => void;
}

export const ClaimsPage: React.FC<Props> = ({ onNavigate }) => {
  const { user, loading: authLoading } = useAuth();
  const [claims, setClaims] = useState<EnrichedClaim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadClaims();
    }
  }, [user]);

  const loadClaims = async () => {
    setLoading(true);
    try {
      const data = await api.getUserClaims();
      setClaims(data.claims);
    } catch (err) {
      console.error('Failed to load claims:', err);
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
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <FileCheck className="w-12 h-12 text-slate-400 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Sign in to view claims</h2>
        <p className="text-xs text-slate-500">
          Check verification status and access contact info for approved claims.
        </p>
        <button
          onClick={() => onNavigate('/auth')}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl cursor-pointer"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-blue-600" />
            <span>My Ownership Claims</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Status of items you claimed. Once approved by campus safety, finder contact info is safely unlocked.
          </p>
        </div>

        <button
          onClick={() => onNavigate('/browse')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer w-fit"
        >
          Search Found Items
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Loading claims...</div>
      ) : claims.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center max-w-md mx-auto space-y-3 shadow-xs">
          <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-900 text-sm">No claims submitted yet</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            If you recognize an item that belongs to you in the directory, open its post and submit a claim with your secret proof.
          </p>
          <button
            onClick={() => onNavigate('/browse')}
            className="mt-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl cursor-pointer"
          >
            Browse Campus Items
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {claims.map((claim) => (
            <div
              key={claim.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      claim.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : claim.status === 'REJECTED'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {claim.status}
                  </span>
                  <span className="text-xs text-slate-400">
                    Claimed on {new Date(claim.created_at).toLocaleDateString()}
                  </span>
                </div>

                <button
                  onClick={() => onNavigate(`/items/${claim.item_id}`)}
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                >
                  <span>View Post</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Item overview */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                  {claim.item.image_url ? (
                    <img
                      src={getImageUrl(claim.item.image_url)}
                      alt={claim.item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                      No Photo
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-base">{claim.item.title}</h3>
                  <div className="text-xs text-slate-500">
                    {claim.item.category} • Location: {claim.item.location}
                  </div>
                </div>
              </div>

              {/* Submitted evidence */}
              <div className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                <span className="font-semibold text-slate-700">Your Private Verification Response:</span>
                <p className="text-slate-800 italic">"{claim.verification_answer}"</p>
              </div>

              {/* Moderator Feedback & Contact Info */}
              {claim.status === 'APPROVED' ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-800 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Ownership Verified! Contact Information Unlocked:</span>
                  </div>
                  {claim.moderator_note && (
                    <div className="text-emerald-700 text-xs">
                      <strong>Moderator note: </strong>
                      {claim.moderator_note}
                    </div>
                  )}
                  <div className="space-y-1 bg-white/90 p-3 rounded-xl border border-emerald-100 font-mono text-slate-900">
                    <div>Finder / Owner: {claim.owner.name}</div>
                    {claim.owner.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{claim.owner.phone}</span>
                      </div>
                    )}
                    {claim.owner.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{claim.owner.email}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : claim.status === 'REJECTED' ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-1 text-rose-800">
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    <XCircle className="w-4 h-4 text-rose-600" />
                    <span>Claim Declined</span>
                  </div>
                  <p className="text-rose-700">
                    <strong>Reason: </strong>
                    {claim.moderator_note || 'The submitted proof did not match verifiable details.'}
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Awaiting safety officer review. You will be notified as soon as verified.
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
