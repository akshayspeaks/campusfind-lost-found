import { Item } from '../models/types.js';

/**
 * Filters candidates to eliminate incompatible pairs before computing detailed similarity.
 */
export function isCandidateCompatible(
  itemA: Item,
  itemB: Item,
  options: { allowNonOpen?: boolean } = {}
): boolean {
  // 1. Exclude identical items
  if (itemA.id === itemB.id) {
    return false;
  }

  // 2. Strict type opposition: One must be LOST and the other FOUND
  // Never match LOST to LOST or FOUND to FOUND
  if (itemA.type === itemB.type) {
    return false;
  }

  // 3. Exclude non-OPEN items unless explicitly requested (e.g. for historic audit)
  if (!options.allowNonOpen) {
    if (itemA.status !== 'OPEN' || itemB.status !== 'OPEN') {
      return false;
    }
  }

  // 4. Basic time bounds: events should be within a reasonable campus semester window (e.g. 60 days)
  const timeA = new Date(itemA.event_time).getTime();
  const timeB = new Date(itemB.event_time).getTime();
  if (!isNaN(timeA) && !isNaN(timeB)) {
    const daysDiff = Math.abs(timeA - timeB) / (1000 * 60 * 60 * 24);
    if (daysDiff > 60) {
      return false;
    }

    // A found item reported > 14 days BEFORE the lost time is chronologically impossible
    const lostItem = itemA.type === 'LOST' ? itemA : itemB;
    const foundItem = itemA.type === 'FOUND' ? itemA : itemB;
    const lostTime = new Date(lostItem.event_time).getTime();
    const foundTime = new Date(foundItem.event_time).getTime();
    const prematureDays = (lostTime - foundTime) / (1000 * 60 * 60 * 24);
    if (prematureDays > 14) {
      return false;
    }
  }

  return true;
}
