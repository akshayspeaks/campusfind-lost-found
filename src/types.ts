export type UserRole = 'STUDENT' | 'FACULTY' | 'MODERATOR' | 'ADMIN' | 'USER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  contact_info?: string | null;
  created_at: string;
}

export type ItemType = 'LOST' | 'FOUND';
export type ItemStatus = 'OPEN' | 'MATCHED' | 'RESOLVED';

export type ItemCategory =
  | 'Electronics'
  | 'Wallet'
  | 'ID Card'
  | 'Keys'
  | 'Books'
  | 'Clothing'
  | 'Bag'
  | 'Jewelry'
  | 'Documents'
  | 'Accessories'
  | 'Other';

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  description: string;
  category: ItemCategory;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  event_time: string;
  image_url?: string | null;
  image_embedding?: number[] | null;
  verification_hint?: 'SCRATCH' | 'CONTENTS' | 'SERIAL' | 'WALLPAPER' | 'OTHER' | null;
  owner_id: string;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
}

export interface MatchScoreComponents {
  image_score: number | null;
  text_score: number;
  category_score: number;
  location_score: number;
  time_score: number;
  total_score: number;
  explanation: string;
  confidence_tier: 'VERY_LIKELY' | 'LIKELY' | 'POSSIBLE' | 'LOW';
}

export interface EnrichedMatch {
  match_id?: string;
  candidate_item: Item;
  scores: MatchScoreComponents;
}

export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Claim {
  id: string;
  item_id: string;
  claimant_id: string;
  message: string;
  verification_answer: string;
  handover_code?: string | null;
  claimant_confirmed_at?: string | null;
  finder_confirmed_at?: string | null;
  status: ClaimStatus;
  moderator_id?: string | null;
  moderator_note?: string | null;
  created_at: string;
  reviewed_at?: string | null;
}

export interface EnrichedClaim extends Claim {
  item: Item;
  finder_verification_detail?: string | null;
  risk?: {
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    total_claims: number;
    prior_rejections: number;
  };
  claimant: {
    id: string;
    name: string;
    email?: string;
    phone?: string | null;
  };
  owner: {
    id: string;
    name: string;
    email?: string;
    phone?: string | null;
  };
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  link?: string | null;
  read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  moderator_id: string;
  target: string;
  timestamp: string;
  note?: string | null;
}
