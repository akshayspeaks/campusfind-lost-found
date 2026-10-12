/**
 * Category similarity calculation.
 * Same category: 1.0
 * Different category: 0.0
 * If either or both is "Other": 0.3 (relies more heavily on text and visual evidence)
 */

export function calculateCategorySimilarity(
  categoryA: string,
  categoryB: string
): number {
  if (!categoryA || !categoryB) return 0;

  const catA = categoryA.trim().toLowerCase();
  const catB = categoryB.trim().toLowerCase();

  if (catA === catB) {
    if (catA === 'other') {
      return 0.4;
    }
    return 1.0;
  }

  if (catA === 'other' || catB === 'other') {
    return 0.3;
  }

  return 0.0;
}
