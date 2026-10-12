import { MatchScoreComponents } from '../models/types.js';

export const BASE_WEIGHTS = {
  image: 0.40,
  text: 0.25,
  category: 0.15,
  location: 0.10,
  time: 0.10,
};

export interface RawScores {
  image_score: number | null;
  text_score: number;
  category_score: number;
  location_score: number;
  time_score: number;
}

export function computeWeightedScore(scores: RawScores): {
  total_score: number;
  confidence_tier: 'VERY_LIKELY' | 'LIKELY' | 'POSSIBLE' | 'LOW';
  active_weights: {
    image?: number;
    text: number;
    category: number;
    location: number;
    time: number;
  };
} {
  let weightedSum = 0;
  let totalWeight = 0;

  // If image score is present and valid
  const hasImage = typeof scores.image_score === 'number' && !isNaN(scores.image_score);

  if (hasImage) {
    weightedSum += BASE_WEIGHTS.image * scores.image_score!;
    totalWeight += BASE_WEIGHTS.image;
  }

  weightedSum += BASE_WEIGHTS.text * scores.text_score;
  totalWeight += BASE_WEIGHTS.text;

  weightedSum += BASE_WEIGHTS.category * scores.category_score;
  totalWeight += BASE_WEIGHTS.category;

  weightedSum += BASE_WEIGHTS.location * scores.location_score;
  totalWeight += BASE_WEIGHTS.location;

  weightedSum += BASE_WEIGHTS.time * scores.time_score;
  totalWeight += BASE_WEIGHTS.time;

  // Normalized final score between 0.0 and 1.0
  const total_score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 1000) / 1000 : 0;

  // Determine confidence tier
  let confidence_tier: 'VERY_LIKELY' | 'LIKELY' | 'POSSIBLE' | 'LOW';
  if (total_score >= 0.80) {
    confidence_tier = 'VERY_LIKELY';
  } else if (total_score >= 0.65) {
    confidence_tier = 'LIKELY';
  } else if (total_score >= 0.50) {
    confidence_tier = 'POSSIBLE';
  } else {
    confidence_tier = 'LOW';
  }

  // Active normalized weights for transparency
  const active_weights: {
    image?: number;
    text: number;
    category: number;
    location: number;
    time: number;
  } = {
    text: Math.round((BASE_WEIGHTS.text / totalWeight) * 100) / 100,
    category: Math.round((BASE_WEIGHTS.category / totalWeight) * 100) / 100,
    location: Math.round((BASE_WEIGHTS.location / totalWeight) * 100) / 100,
    time: Math.round((BASE_WEIGHTS.time / totalWeight) * 100) / 100,
  };

  if (hasImage) {
    active_weights.image = Math.round((BASE_WEIGHTS.image / totalWeight) * 100) / 100;
  }

  return {
    total_score,
    confidence_tier,
    active_weights,
  };
}
