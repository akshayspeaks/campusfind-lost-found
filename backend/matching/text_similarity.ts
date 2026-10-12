/**
 * Transparent text similarity using tokenization, stop-word removal,
 * Term-Frequency weighting, and Cosine Similarity.
 * Completely deterministic without paid or external APIs.
 */

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'could', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having',
  'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'me', 'more', 'most', 'my',
  'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
  'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should',
  'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
  // Common context words that don't differentiate items
  'lost', 'found', 'item', 'please', 'help', 'contact'
]);

export function simpleStem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  return word;
}

export function tokenizeAndClean(text: string): string[] {
  if (!text) return [];
  // Lowercase and remove punctuation
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  // Split into tokens, filter out single characters and stop words
  const rawTokens = cleaned
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  const result: string[] = [];
  for (const t of rawTokens) {
    result.push(t);
    const stemmed = simpleStem(t);
    if (stemmed !== t && !STOP_WORDS.has(stemmed)) {
      result.push(stemmed);
    }
    // Decompose common compound words like "smartphone" -> "phone"
    if (t.includes('phone') && t !== 'phone') {
      result.push('phone');
    }
  }
  return result;
}

export function computeTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  if (tokens.length === 0) return tf;

  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  // Sublinear scaling: 1 + log(count) to prevent repeated words from dominating
  const scaledTf = new Map<string, number>();
  for (const [term, count] of tf.entries()) {
    scaledTf.set(term, 1 + Math.log(count));
  }
  return scaledTf;
}

export function calculateTextSimilarity(textA: string, textB: string): number {
  const tokensA = tokenizeAndClean(textA);
  const tokensB = tokenizeAndClean(textB);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return 0;
  }

  const tfA = computeTermFrequency(tokensA);
  const tfB = computeTermFrequency(tokensB);

  // Collect all unique terms
  const allTerms = new Set([...tfA.keys(), ...tfB.keys()]);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term of allTerms) {
    const valA = tfA.get(term) || 0;
    const valB = tfB.get(term) || 0;

    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const cosineSim = dotProduct / (normA * normB);
  return Math.max(0, Math.min(1, Math.round(cosineSim * 1000) / 1000));
}
