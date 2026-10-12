import React, { useState, useRef } from 'react';
import { ItemCategory, ItemType, EnrichedMatch } from '../types.js';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { MatchScoreBadge } from '../components/MatchScoreBadge.js';
import {
  UploadCloud,
  Camera,
  MapPin,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  X,
} from 'lucide-react';

const CATEGORIES: ItemCategory[] = [
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

const CAMPUS_PRESETS = [
  { name: 'Main Campus Library', lat: 37.4275, lon: -122.1697 },
  { name: 'Student Union Cafeteria', lat: 37.4250, lon: -122.1705 },
  { name: 'Engineering Quad Hall 101', lat: 37.4288, lon: -122.1720 },
  { name: 'Campus Dining Commons', lat: 37.4260, lon: -122.1710 },
  { name: 'Campus Recreation Gymnasium', lat: 37.4295, lon: -122.1650 },
];

interface Props {
  initialType: ItemType;
  onNavigate: (path: string) => void;
}

export const ReportItemPage: React.FC<Props> = ({ initialType, onNavigate }) => {
  const { user } = useAuth();
  const [type, setType] = useState<ItemType>(initialType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [verificationDetail, setVerificationDetail] = useState('');
  const [verificationHint, setVerificationHint] = useState<'SCRATCH' | 'CONTENTS' | 'SERIAL' | 'WALLPAPER' | 'OTHER'>('OTHER');
  const [category, setCategory] = useState<ItemCategory>('Electronics');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [eventTime, setEventTime] = useState(new Date().toISOString().slice(0, 16));

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractingFeatures, setExtractingFeatures] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdMatches, setCreatedMatches] = useState<EnrichedMatch[] | null>(null);
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgPreviewRef = useRef<HTMLImageElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please select a JPG, PNG, or WebP image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image file must be under 5 MB.');
      return;
    }

    setError(null);
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handlePresetLocation = (preset: typeof CAMPUS_PRESETS[0]) => {
    setLocation(preset.name);
    setLatitude(preset.lat);
    setLongitude(preset.lon);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onNavigate('/auth');
      return;
    }

    if (!title.trim() || !description.trim() || !location.trim()) {
      setError('Please fill in title, description, and location.');
      return;
    }

    if (type === 'FOUND' && !verificationDetail.trim()) {
      setError('Please record a private verification detail for the finder.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let imageEmbedding: number[] | null = null;

      // Extract client-side MobileNet feature vector if an image was provided
      if (imgPreviewRef.current && selectedFile) {
        setExtractingFeatures(true);
        try {
          // Load TensorFlow.js/MobileNet only when a user actually attaches an image.
          const { extractImageEmbedding } = await import('../services/mobilenet.js');
          imageEmbedding = await extractImageEmbedding(imgPreviewRef.current);
        } catch {
          // fallback to server
        } finally {
          setExtractingFeatures(false);
        }
      }

      const formData = new FormData();
      formData.append('type', type);
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      if (type === 'FOUND') {
        formData.append('verification_detail', verificationDetail.trim());
        formData.append('verification_hint', verificationHint);
      }
      formData.append('category', category);
      formData.append('location', location.trim());
      if (latitude !== null) formData.append('latitude', latitude.toString());
      if (longitude !== null) formData.append('longitude', longitude.toString());
      formData.append('event_time', new Date(eventTime).toISOString());

      if (selectedFile) {
        formData.append('image', selectedFile);
      }

      if (imageEmbedding) {
        formData.append('image_embedding', JSON.stringify(imageEmbedding));
      }

      const result = await api.createItem(formData);
      setCreatedItemId(result.item.id);
      setCreatedMatches(result.suggested_matches);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create report.');
    } finally {
      setSubmitting(false);
    }
  };

  // Success view with immediate candidate matches
  if (createdItemId && createdMatches) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-900">
            {type === 'LOST' ? 'Lost Item Report Logged' : 'Found Item Registered!'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            Your report is live on the campus registry. The matching algorithm automatically compared your entry against compatible active items.
          </p>

          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => onNavigate(`/items/${createdItemId}`)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              View Your Item Post
            </button>
            <button
              onClick={() => onNavigate('/browse')}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Back to Directory
            </button>
          </div>
        </div>

        {/* Top Matches section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h3 className="font-bold text-slate-900 text-base">
              Instant Matches Discovered ({createdMatches.length})
            </h3>
          </div>

          {createdMatches.length === 0 ? (
            <div className="p-6 bg-white rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
              No matching {type === 'LOST' ? 'FOUND' : 'LOST'} posts currently score above threshold.
              You will be notified as soon as a compatible post is registered.
            </div>
          ) : (
            <div className="space-y-3">
              {createdMatches.map((m) => (
                <div
                  key={m.candidate_item.id}
                  className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                      {m.candidate_item.type} • {m.candidate_item.category}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm">
                      {m.candidate_item.title}
                    </h4>
                    <p className="text-xs text-slate-500 line-clamp-1">
                      {m.candidate_item.location} • {new Date(m.candidate_item.event_time).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="w-full sm:w-auto flex items-center gap-3">
                    <MatchScoreBadge scores={m.scores} />
                    <button
                      onClick={() => onNavigate(`/items/${m.candidate_item.id}`)}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                    >
                      Compare
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {type === 'LOST' ? 'Report a Lost Belonging' : 'Report a Found Belonging'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
          {type === 'LOST'
            ? 'Provide descriptive details and approximate location. Our system will alert you to candidate found matches.'
            : 'Add a photo and location so the rightful owner can be identified without exposing private contact info.'}
        </p>

        {/* Type Toggle */}
        <div className="inline-flex bg-slate-100 p-1 rounded-xl mt-2">
          <button
            type="button"
            onClick={() => setType('LOST')}
            className={`px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              type === 'LOST'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            I Lost Something
          </button>
          <button
            type="button"
            onClick={() => setType('FOUND')}
            className={`px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              type === 'FOUND'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            I Found Something
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Item Title <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'LOST' ? "e.g. 'Black Samsung Galaxy S23 Phone'" : "e.g. 'Black Samsung smartphone found on desk'"}
            className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Category & Date Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Category <span className="text-rose-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ItemCategory)}
              className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Date &amp; Time {type === 'LOST' ? 'Lost' : 'Found'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="datetime-local"
              required
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        {/* Campus Location */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Campus Location <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. 'Main Campus Library 2nd Floor Quiet Study Stacks'..."
            className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Quick Preset Buttons */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span className="font-medium mr-1">Quick Select:</span>
            {CAMPUS_PRESETS.map((p) => (
              <button
                type="button"
                key={p.name}
                onClick={() => handlePresetLocation(p)}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors cursor-pointer"
              >
                {p.name.split(' ')[0]} {p.name.split(' ')[1] || ''}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Detailed Description <span className="text-rose-500">*</span>
          </label>
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe color, materials, brand, identifiable stickers or characteristics. (Avoid revealing secret lock codes or private serial numbers if you are reporting a found item)..."
            className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {type === 'FOUND' && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
            <label className="block text-xs font-semibold text-amber-900 mb-1">
              Private Finder Verification Detail <span className="text-rose-500">*</span>
            </label>
            <select
              value={verificationHint}
              onChange={(e) => setVerificationHint(e.target.value as typeof verificationHint)}
              className="w-full px-3.5 py-2.5 text-xs border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="SCRATCH">Scratch / physical mark</option>
              <option value="CONTENTS">Contents inside</option>
              <option value="SERIAL">Serial / identifier</option>
              <option value="WALLPAPER">Wallpaper / screen image</option>
              <option value="OTHER">Other private detail</option>
            </select>
            <textarea
              required
              rows={3}
              value={verificationDetail}
              onChange={(e) => setVerificationDetail(e.target.value)}
              placeholder="Record one detail that a genuine owner can know but that you will not publish (e.g. a scratch location, wallpaper, bag contents, or last 4 serial digits)."
              className="w-full px-3.5 py-2.5 text-xs border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <p className="text-[11px] text-amber-800 leading-relaxed">
              This stays hidden from public item pages. During a claim review, the moderator will compare it with the claimant's private answer.
            </p>
          </div>
        )}

        {/* Photo Upload Area */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Photo Asset {type === 'FOUND' && <span className="text-blue-600 font-normal">(Highly Recommended for Visual Matching)</span>}
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />

          {previewUrl ? (
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 max-h-64 flex items-center justify-center group">
              <img
                ref={imgPreviewRef}
                src={previewUrl}
                alt="Preview"
                crossOrigin="anonymous"
                className="max-h-64 object-contain"
              />
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
                className="absolute top-3 right-3 p-1.5 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) processFile(file);
              }}
              className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-blue-50/20"
            >
              <Camera className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-xs font-semibold text-slate-700">
                Click to browse or drag &amp; drop item photo
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                JPEG, PNG, or WebP up to 5 MB. Features are extracted client-side with MobileNet.
              </p>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <span>Automatic similarity matching runs immediately upon submission.</span>
          </div>

          <button
            type="submit"
            disabled={submitting || extractingFeatures}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50 ${
              type === 'LOST' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {extractingFeatures
              ? 'Analyzing visual features...'
              : submitting
              ? 'Submitting report...'
              : type === 'LOST'
              ? 'Submit Lost Report'
              : 'Submit Found Report'}
          </button>
        </div>
      </form>
    </div>
  );
};
