/**
 * Image similarity calculation using cosine similarity between normalized feature embeddings.
 * Formula: sim(A, B) = (A · B) / (||A|| * ||B||)
 * Safe against missing images, dimension mismatches, and zero-vectors.
 */

export function calculateCosineSimilarity(
  vecA: number[] | null | undefined,
  vecB: number[] | null | undefined
): number | null {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
    return null; // Missing image evidence
  }

  // If dimensions mismatch, truncate to minimum common length or return null
  const length = Math.min(vecA.length, vecB.length);
  if (length === 0) return null;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  // Avoid division by zero
  if (normA === 0 || normB === 0) {
    return 0;
  }

  const similarity = dotProduct / (normA * normB);
  // Clamp between 0.0 and 1.0
  return Math.max(0, Math.min(1, similarity));
}

/**
 * Normalizes a raw feature vector to unit length (||V|| = 1).
 */
export function normalizeVector(vector: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return vector.map(() => 0);
  return vector.map((val) => val / norm);
}
