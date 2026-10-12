import React, { useState } from 'react';
import { Item } from '../types.js';
import { api } from '../services/api.js';
import { X, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Props {
  item: Item;
  isOpen: boolean;
  onClose: () => void;
  onClaimSubmitted: () => void;
}

export const ClaimModal: React.FC<Props> = ({
  item,
  isOpen,
  onClose,
  onClaimSubmitted,
}) => {
  const [message, setMessage] = useState('');
  const [verificationAnswer, setVerificationAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const verificationHintLabel = {
    SCRATCH: 'a scratch or physical mark',
    CONTENTS: 'the contents inside',
    SERIAL: 'a serial number or identifier',
    WALLPAPER: 'the wallpaper or screen image',
    OTHER: 'another private detail',
  }[item.verification_hint || 'OTHER'];

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationAnswer.trim()) {
      setError('Please provide non-public verification details to assist the moderator.');
      return;
    }
    if (!message.trim()) {
      setError('Please provide a message explaining your claim.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.createClaim(item.id, {
        message: message.trim(),
        verification_answer: verificationAnswer.trim(),
      });
      setSuccess(true);
      setTimeout(() => {
        onClaimSubmitted();
        onClose();
      }, 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit claim.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative border border-slate-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {success ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-3 animate-bounce" />
            <h3 className="text-xl font-bold text-slate-900">Claim Submitted!</h3>
            <p className="text-sm text-slate-600 mt-2 max-w-sm mx-auto">
              Your claim has been forwarded to the Campus Safety &amp; Moderation desk.
              You will be notified once reviewed.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Submit Ownership Claim
              </h3>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Claiming item: <strong className="text-slate-800">{item.title}</strong>.
              To protect student privacy, contact information remains hidden until the campus safety moderator verifies your claim.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {item.type === 'FOUND' ? 'Finder-set Verification Answer' : 'Private Verification Details'} <span className="text-rose-500">*</span>
                </label>
                {item.type === 'FOUND' && item.verification_hint ? (
                  <p className="text-[11px] text-blue-700 mb-1.5">
                    The finder recorded {verificationHintLabel}. Describe that specific detail without asking the finder for it.
                  </p>
                ) : null}
                <textarea
                  required
                  rows={3}
                  value={verificationAnswer}
                  onChange={(e) => setVerificationAnswer(e.target.value)}
                  placeholder={
                    item.type === 'FOUND'
                      ? 'What private detail did the finder record about this item? Include the specific detail the finder would recognize.'
                      : 'Provide non-public ownership details that can help the moderator verify your claim.'
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
                <span className="text-[11px] text-slate-400">
                  Your answer is visible only to the campus safety moderator during verification.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Message to Moderator / Owner <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Briefly explain where and when you lost this item..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Submitting...' : 'Submit Claim'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
