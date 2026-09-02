/**
 * Server-side lexical similarity for duplicate candidate ranking.
 *
 * Why this and not embeddings: the expensive stage (Groq adjudication) is
 * rate-limited, so its input must be narrowed cheaply and locally. A vector
 * database or embedding model would add a dependency and a second network call
 * per candidate for what is, at this stage, only a funnel. This runs in-process
 * with no dependency and no network.
 *
 * Why two measures combined:
 *  - Token Dice catches shared vocabulary regardless of word order, so
 *    "water leaking from the main pipeline" and "pipeline water leakage" match.
 *  - Character trigram cosine catches morphological variation and typos that
 *    token matching misses entirely — "potholes" vs "pothole", "streetlight" vs
 *    "street light" — which matters for citizen-typed text.
 *
 * Neither is a verdict. This produces a ranking signal; the decision is made
 * later by adjudication against documented thresholds.
 *
 * Language note: both operands are `normalizedText`, the English rendering the
 * classifier already produced, so a Hindi complaint and an English complaint
 * about the same problem are compared in one language rather than across scripts.
 */
import "@tanstack/react-start/server-only";

/**
 * Words carrying no discriminating power in a grievance corpus.
 *
 * Includes ordinary English stopwords plus civic filler that appears in nearly
 * every complaint ("complaint", "please", "kindly", "request", "sir"). Without
 * this, two unrelated complaints score high purely on politeness.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "no",
  "not",
  "of",
  "on",
  "or",
  "our",
  "she",
  "so",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "too",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "which",
  "who",
  "will",
  "with",
  "you",
  "your",
  // Civic boilerplate.
  "also",
  "action",
  "area",
  "authority",
  "because",
  "complaint",
  "concerned",
  "department",
  "due",
  "even",
  "get",
  "getting",
  "immediate",
  "issue",
  "kindly",
  "last",
  "many",
  "matter",
  "much",
  "need",
  "needed",
  "office",
  "officer",
  "past",
  "people",
  "please",
  "problem",
  "public",
  "regarding",
  "request",
  "requesting",
  "residents",
  "respected",
  "sir",
  "madam",
  "several",
  "since",
  "solve",
  "solved",
  "take",
  "taken",
  "thank",
  "thanks",
  "time",
  "times",
  "urgent",
  "various",
  "week",
  "weeks",
]);

/** Character n-gram width. 3 balances typo tolerance against false matches. */
const TRIGRAM_SIZE = 3;

/**
 * Relative weight of token overlap versus character overlap.
 *
 * Tokens lead because agreeing on *which things* are discussed matters more than
 * surface spelling; trigrams contribute enough to rescue inflectional differences.
 */
const TOKEN_WEIGHT = 0.65;
const TRIGRAM_WEIGHT = 0.35;

/**
 * Lowercases, strips punctuation, and keeps letters and digits.
 *
 * `\p{L}` retains Devanagari, so the function still behaves sensibly if it is
 * ever handed original-language text rather than the English rendering.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Content words only. Single characters and stopwords are dropped. */
function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/**
 * Very light suffix folding so "flooding"/"flooded"/"floods" collapse together.
 *
 * Deliberately not a real stemmer: a full Porter implementation would be more
 * code to review for a marginal gain at this stage of the funnel.
 */
function fold(token: string): string {
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (token.length > suffix.length + 2 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

function trigrams(text: string): Map<string, number> {
  const padded = ` ${normalize(text).replace(/\s+/g, " ")} `;
  const counts = new Map<string, number>();
  for (let index = 0; index + TRIGRAM_SIZE <= padded.length; index += 1) {
    const gram = padded.slice(index, index + TRIGRAM_SIZE);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** Dice coefficient over unique folded tokens: 2|A∩B| / (|A|+|B|). */
function tokenDice(left: string, right: string): number {
  const a = new Set(tokenize(left).map(fold));
  const b = new Set(tokenize(right).map(fold));
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/** Cosine similarity over character-trigram frequency vectors. */
function trigramCosine(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  if (a.size === 0 || b.size === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [gram, count] of a) {
    normA += count * count;
    const other = b.get(gram);
    if (other !== undefined) dot += count * other;
  }
  for (const count of b.values()) normB += count * count;
  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Combined similarity in [0, 1]. Higher means more alike.
 *
 * Pure text comparison: takes no citizen identity, no location and no timestamp,
 * so it cannot accidentally rank on anything but wording.
 */
export function textSimilarity(left: string, right: string): number {
  if (left === "" || right === "") return 0;
  const score = TOKEN_WEIGHT * tokenDice(left, right) + TRIGRAM_WEIGHT * trigramCosine(left, right);
  // Guard against floating point drift pushing the value outside the range.
  return Math.min(1, Math.max(0, Number(score.toFixed(4))));
}

/**
 * Great-circle distance in metres.
 *
 * Used to report how far apart two complaints were filed, and to rank candidates
 * when MongoDB returned them by a coarser filter than the final radius.
 */
export function distanceMetres(
  [lonA, latA]: readonly [number, number],
  [lonB, latB]: readonly [number, number],
): number {
  const EARTH_RADIUS_METRES = 6_371_000;
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(latB - latA);
  const deltaLon = toRadians(lonB - lonA);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(deltaLon / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(haversine))));
}
