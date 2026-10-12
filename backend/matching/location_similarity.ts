/**
 * Location proximity calculation using Haversine formula when GPS is available,
 * with graceful fallback to location text token similarity.
 */

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Normalizes physical distance in km to a [0, 1] proximity score.
 * Within 100m (0.1km): ~0.95 - 1.0 (Same building/plaza)
 * 500m: ~0.75 (Adjacent campus zones)
 * 1.5km: ~0.40 (Opposite campus edges)
 * > 3.0km: ~0.00 (Off campus)
 */
export function distanceToScore(distanceKm: number): number {
  // Using exponential decay: score = exp(-distance / sigma)
  // sigma = 0.8 km provides realistic campus scale decay
  const sigma = 0.8;
  const score = Math.exp(-distanceKm / sigma);
  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}

export function calculateLocationTextSimilarity(locA: string, locB: string): number {
  if (!locA || !locB) return 0.5; // neutral fallback when unknown

  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 1);

  const wordsA = new Set(clean(locA));
  const wordsB = new Set(clean(locB));

  if (wordsA.size === 0 || wordsB.size === 0) return 0.5;

  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }

  const jaccard = common / (wordsA.size + wordsB.size - common);
  return Math.max(0, Math.min(1, Math.round(jaccard * 1000) / 1000));
}

export function calculateLocationSimilarity(
  locA: { location: string; latitude?: number | null; longitude?: number | null },
  locB: { location: string; latitude?: number | null; longitude?: number | null }
): number {
  const hasCoordsA =
    typeof locA.latitude === 'number' &&
    typeof locA.longitude === 'number' &&
    !isNaN(locA.latitude) &&
    !isNaN(locA.longitude);

  const hasCoordsB =
    typeof locB.latitude === 'number' &&
    typeof locB.longitude === 'number' &&
    !isNaN(locB.latitude) &&
    !isNaN(locB.longitude);

  if (hasCoordsA && hasCoordsB) {
    const dist = haversineDistanceKm(
      locA.latitude!,
      locA.longitude!,
      locB.latitude!,
      locB.longitude!
    );
    return distanceToScore(dist);
  }

  return calculateLocationTextSimilarity(locA.location, locB.location);
}
