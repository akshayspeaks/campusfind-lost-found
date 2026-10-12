/**
 * Time compatibility calculation.
 * Uses an exponential decay function: time_score = exp(-delta_hours / T)
 * with asymmetry: a found item reported significantly before the lost time
 * receives a heavy penalty / near-zero score.
 */

// Decay constant T in hours: 48 hours (2 days)
export const DECAY_HOURS_T = 48.0;

export function calculateTimeSimilarity(
  lostEventTimeIso: string,
  foundEventTimeIso: string
): number {
  const lostTime = new Date(lostEventTimeIso).getTime();
  const foundTime = new Date(foundEventTimeIso).getTime();

  if (isNaN(lostTime) || isNaN(foundTime)) {
    return 0.5; // neutral fallback for unparseable dates
  }

  // Calculate delta in hours: (foundTime - lostTime)
  const diffHours = (foundTime - lostTime) / (1000 * 60 * 60);

  // Scenario 1: Found item was recorded significantly BEFORE the lost item was lost.
  // Allow a small grace margin of 3 hours for human reporting inaccuracies (e.g. clock difference or approximate memory).
  if (diffHours < -3) {
    // Incompatible: Found before it was supposedly lost
    // Severe penalty: decays rapidly to 0
    const invertedHours = Math.abs(diffHours);
    const score = Math.exp(-invertedHours / 6.0) * 0.1; // steep drop
    return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
  }

  // Scenario 2: Found event is roughly at or after the lost event
  const effectiveDelta = Math.abs(diffHours);
  const score = Math.exp(-effectiveDelta / DECAY_HOURS_T);

  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}
