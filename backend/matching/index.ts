import { Item, MatchScoreComponents } from '../models/types.js';
import { calculateCosineSimilarity } from './image_similarity.js';
import { calculateTextSimilarity } from './text_similarity.js';
import { calculateCategorySimilarity } from './category_similarity.js';
import { calculateLocationSimilarity } from './location_similarity.js';
import { calculateTimeSimilarity } from './time_similarity.js';
import { computeWeightedScore, RawScores } from './scoring.js';
import { generateExplanation } from './explanation.js';
import { isCandidateCompatible } from './candidate_filter.js';

export interface MatchResult extends MatchScoreComponents {
  is_compatible: boolean;
  lost_item_id: string;
  found_item_id: string;
}

/**
 * Pure, deterministic matching function comparing a LOST item and a FOUND item.
 * Zero external paid APIs, zero historical training data used.
 */
export function matchItems(itemA: Item, itemB: Item): MatchResult {
  const lostItem = itemA.type === 'LOST' ? itemA : itemB;
  const foundItem = itemA.type === 'FOUND' ? itemA : itemB;

  const compatible = isCandidateCompatible(itemA, itemB, { allowNonOpen: true });

  if (!compatible) {
    return {
      is_compatible: false,
      lost_item_id: lostItem.id,
      found_item_id: foundItem.id,
      image_score: null,
      text_score: 0,
      category_score: 0,
      location_score: 0,
      time_score: 0,
      total_score: 0,
      confidence_tier: 'LOW',
      explanation: 'Incompatible items (must compare one LOST item with one FOUND item).',
    };
  }

  // 1. Image similarity
  const image_score = calculateCosineSimilarity(
    lostItem.image_embedding,
    foundItem.image_embedding
  );

  // 2. Text similarity (combine title, description, and category terms)
  const fullTextLost = `${lostItem.title} ${lostItem.description} ${lostItem.category}`;
  const fullTextFound = `${foundItem.title} ${foundItem.description} ${foundItem.category}`;
  const text_score = calculateTextSimilarity(fullTextLost, fullTextFound);

  // 3. Category similarity
  const category_score = calculateCategorySimilarity(lostItem.category, foundItem.category);

  // 4. Location similarity
  const location_score = calculateLocationSimilarity(
    {
      location: lostItem.location,
      latitude: lostItem.latitude,
      longitude: lostItem.longitude,
    },
    {
      location: foundItem.location,
      latitude: foundItem.latitude,
      longitude: foundItem.longitude,
    }
  );

  // 5. Time compatibility
  const time_score = calculateTimeSimilarity(lostItem.event_time, foundItem.event_time);

  const rawScores: RawScores = {
    image_score,
    text_score,
    category_score,
    location_score,
    time_score,
  };

  // 6. Weighted scoring with dynamic missing-image renormalization
  const { total_score, confidence_tier } = computeWeightedScore(rawScores);

  // 7. Transparent explanation
  const explanation = generateExplanation(
    rawScores,
    total_score,
    lostItem.category,
    foundItem.category,
    lostItem.location,
    foundItem.location
  );

  return {
    is_compatible: true,
    lost_item_id: lostItem.id,
    found_item_id: foundItem.id,
    image_score,
    text_score,
    category_score,
    location_score,
    time_score,
    total_score,
    confidence_tier,
    explanation,
  };
}

export * from './image_similarity.js';
export * from './text_similarity.js';
export * from './category_similarity.js';
export * from './location_similarity.js';
export * from './time_similarity.js';
export * from './scoring.js';
export * from './explanation.js';
export * from './candidate_filter.js';
