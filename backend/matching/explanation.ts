import { RawScores } from './scoring.js';

export function generateExplanation(
  scores: RawScores,
  totalScore: number,
  categoryA: string,
  categoryB: string,
  locationA: string,
  locationB: string
): string {
  const points: string[] = [];

  // Category
  if (scores.category_score >= 0.9) {
    points.push(`identical "${categoryA}" category`);
  } else if (scores.category_score >= 0.3) {
    points.push(`compatible generic categories ("${categoryA}" and "${categoryB}")`);
  } else {
    points.push(`mismatched categories ("${categoryA}" vs "${categoryB}")`);
  }

  // Text
  if (scores.text_score >= 0.7) {
    points.push('strong keyword/description overlap');
  } else if (scores.text_score >= 0.4) {
    points.push('moderate descriptive similarity');
  } else if (scores.text_score > 0) {
    points.push('minor text correlation');
  }

  // Location
  if (scores.location_score >= 0.8) {
    points.push(`high location proximity near "${locationA}"`);
  } else if (scores.location_score >= 0.5) {
    points.push(`neighboring campus locations ("${locationA}" and "${locationB}")`);
  }

  // Time
  if (scores.time_score >= 0.8) {
    points.push('closely aligned lost and found timestamps');
  } else if (scores.time_score >= 0.5) {
    points.push('acceptable chronological window');
  } else if (scores.time_score < 0.2) {
    points.push('large or inconsistent time gap between events');
  }

  // Image
  if (scores.image_score !== null) {
    if (scores.image_score >= 0.8) {
      points.push('strong visual feature alignment in photos');
    } else if (scores.image_score >= 0.5) {
      points.push('moderate visual similarity');
    } else {
      points.push('divergent visual photo features');
    }
  } else {
    points.push('weights dynamically renormalized for missing image');
  }

  const overallPct = Math.round(totalScore * 100);
  let descriptor = 'Low similarity';
  if (totalScore >= 0.80) {
    descriptor = 'Very high match likelihood';
  } else if (totalScore >= 0.65) {
    descriptor = 'Likely match';
  } else if (totalScore >= 0.50) {
    descriptor = 'Possible match candidate';
  }

  return `${descriptor} (${overallPct}%). Factors: ${points.join(', ')}.`;
}
