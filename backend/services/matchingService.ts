import crypto from 'crypto';
import { execute, query, queryOne } from '../database.js';
import { Item, MatchRecord } from '../models/types.js';
import { getItemById, mapRowToItem, ItemRow } from './itemService.js';
import { matchItems, MatchResult } from '../matching/index.js';
import { createNotification } from './notificationService.js';

export interface EnrichedMatch {
  match_id?: string;
  candidate_item: Item;
  scores: MatchResult;
}

/**
 * Finds all compatible matches for a given item, calculating live scores
 * and saving high-potential candidates to the matches table.
 */
export async function findMatchesForItem(itemId: string): Promise<EnrichedMatch[]> {
  const targetItem = await getItemById(itemId);
  if (!targetItem) {
    return [];
  }

  // Find candidate items of opposite type
  const oppositeType = targetItem.type === 'LOST' ? 'FOUND' : 'LOST';

  // Only consider OPEN candidates
  const rows = await query<ItemRow>(
    `SELECT * FROM items WHERE type = ? AND status = 'OPEN' AND id != ? ORDER BY created_at DESC LIMIT 50`,
    [oppositeType, itemId]
  );

  const candidates = rows.map(mapRowToItem);
  const enrichedMatches: EnrichedMatch[] = [];

  for (const candidate of candidates) {
    const result = matchItems(targetItem, candidate);
    if (result.is_compatible) {
      enrichedMatches.push({
        candidate_item: candidate,
        scores: result,
      });

      // If total score >= 0.50, persist or update in matches table
      if (result.total_score >= 0.50) {
        await persistMatchRecord(result);
      }
    }
  }

  // Sort by highest total_score first
  enrichedMatches.sort((a, b) => b.scores.total_score - a.scores.total_score);

  // If a high-confidence match exists (>= 0.70) and target item is LOST, notify owner
  const topMatch = enrichedMatches[0];
  if (topMatch && topMatch.scores.total_score >= 0.70 && targetItem.type === 'LOST') {
    await createNotification(
      targetItem.owner_id,
      'Possible Match Found',
      `A found ${topMatch.candidate_item.category} (${Math.round(topMatch.scores.total_score * 100)}% match) was reported near ${topMatch.candidate_item.location}.`,
      `/items/${topMatch.candidate_item.id}`
    );
  }

  return enrichedMatches;
}

async function persistMatchRecord(result: MatchResult): Promise<void> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM matches WHERE lost_item_id = ? AND found_item_id = ?`,
    [result.lost_item_id, result.found_item_id]
  );

  const now = new Date().toISOString();

  if (existing) {
    await execute(
      `UPDATE matches SET
        image_score = ?, text_score = ?, category_score = ?, location_score = ?,
        time_score = ?, total_score = ?, explanation = ?
       WHERE id = ?`,
      [
        result.image_score,
        result.text_score,
        result.category_score,
        result.location_score,
        result.time_score,
        result.total_score,
        result.explanation,
        existing.id,
      ]
    );
  } else {
    const id = 'match_' + crypto.randomUUID();
    await execute(
      `INSERT INTO matches (
        id, lost_item_id, found_item_id, image_score, text_score,
        category_score, location_score, time_score, total_score, explanation, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        result.lost_item_id,
        result.found_item_id,
        result.image_score,
        result.text_score,
        result.category_score,
        result.location_score,
        result.time_score,
        result.total_score,
        result.explanation,
        now,
      ]
    );
  }
}

export async function getHighConfidenceMatches(limit = 20): Promise<Array<MatchRecord & {
  lost_item: Item;
  found_item: Item;
}>> {
  const matches = await query<MatchRecord>(
    `SELECT * FROM matches WHERE total_score >= 0.65 ORDER BY total_score DESC LIMIT ?`,
    [limit]
  );

  const results = [];
  for (const m of matches) {
    const lostItem = await getItemById(m.lost_item_id);
    const foundItem = await getItemById(m.found_item_id);
    if (lostItem && foundItem) {
      results.push({
        ...m,
        lost_item: lostItem,
        found_item: foundItem,
      });
    }
  }

  return results;
}
