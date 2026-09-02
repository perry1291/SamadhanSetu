/**
 * AI integration points — MOCK IMPLEMENTATIONS.
 *
 * Every function here is a deterministic placeholder with the exact signature a
 * real model-backed service would expose. Swap the bodies for server functions
 * calling a classifier / embedding service without touching any UI code.
 */
import {
  DEPARTMENTS,
  GRIEVANCES,
  type Grievance,
  type Priority,
} from "./mock-data";

export interface ClassificationInput {
  title: string;
  description: string;
  pincode?: string;
  address?: string;
  language?: string;
}

export interface DuplicateCandidate {
  grievanceId: string;
  title: string;
  similarity: number;
  status: Grievance["status"];
  filedOn: string;
  area: string;
}

export interface ClassificationResult {
  departmentId: string;
  category: string;
  priority: Priority;
  confidence: number;
  reasoning: string;
  duplicate?: DuplicateCandidate;
  language: string;
}

const KEYWORD_MAP: {
  deptId: string;
  category: string;
  words: string[];
  basePriority: Priority;
}[] = [
  { deptId: "PWD", category: "Road & Pothole Repair", words: ["pothole", "road", "footpath", "gaddha", "khadda", "resurfac", "pavement", "bridge"], basePriority: "Medium" },
  { deptId: "JAL", category: "Water Supply Disruption", words: ["water", "tanker", "pipeline", "sewage", "drain", "nala", "gutter", "supply"], basePriority: "High" },
  { deptId: "SWM", category: "Waste Collection", words: ["garbage", "waste", "bin", "kachra", "sweep", "litter", "sanitation", "dump"], basePriority: "Medium" },
  { deptId: "ELEC", category: "Street Lighting / Power", words: ["light", "power", "electric", "outage", "transformer", "meter", "pole", "bijli"], basePriority: "High" },
  { deptId: "HEALTH", category: "Public Health & Vector Control", words: ["dengue", "mosquito", "hospital", "malaria", "stagnant", "disease", "health", "clinic"], basePriority: "High" },
  { deptId: "TRANS", category: "Traffic & Parking", words: ["traffic", "parking", "bus", "signal", "encroach", "auto", "rickshaw"], basePriority: "Medium" },
  { deptId: "REV", category: "Land Records & Mutation", words: ["mutation", "7/12", "land", "record", "tehsil", "property", "survey"], basePriority: "Low" },
];

const URGENCY_WORDS = ["accident", "injur", "urgent", "danger", "child", "elderly", "ambulance", "dengue", "unsafe", "collapse", "death", "fire", "days", "week"];

const SEVERITY_NOTE: Record<Priority, string> = {
  High: "Safety or public-health impact detected, so the grievance is placed in the High priority queue with a compressed SLA.",
  Medium: "Service-delivery impact without an immediate safety risk — standard departmental SLA applies.",
  Low: "Routine administrative request; scheduled within the normal departmental SLA.",
};

function tokenSet(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097F\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

/** Placeholder for a real embedding-similarity search (pgvector / hosted index). */
export function findDuplicateCandidate(
  input: ClassificationInput,
  departmentId?: string,
): DuplicateCandidate | undefined {
  const query = tokenSet(`${input.title} ${input.description}`);
  if (query.size === 0) return undefined;

  let best: { g: Grievance; score: number } | undefined;
  for (const g of GRIEVANCES) {
    const other = tokenSet(`${g.title} ${g.description}`);
    let overlap = 0;
    query.forEach((w) => {
      if (other.has(w)) overlap += 1;
    });
    let score = overlap / Math.max(4, Math.min(query.size, other.size));
    if (input.pincode && g.pincode === input.pincode) score += 0.22;
    if (departmentId && g.departmentId === departmentId) score += 0.08;
    score = Math.min(0.97, score);
    if (!best || score > best.score) best = { g, score };
  }

  if (!best || best.score < 0.45) return undefined;
  return {
    grievanceId: best.g.id,
    title: best.g.title,
    similarity: Number(best.score.toFixed(2)),
    status: best.g.status,
    filedOn: best.g.filedOn,
    area: `${best.g.ward}, ${best.g.pincode}`,
  };
}

/** Placeholder for the classification + prioritisation model. */
export function classifyGrievance(input: ClassificationInput): ClassificationResult {
  const text = `${input.title} ${input.description}`.toLowerCase();

  let bestMatch = KEYWORD_MAP[0]!;
  let bestHits = 0;
  for (const entry of KEYWORD_MAP) {
    const hits = entry.words.filter((w) => text.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestMatch = entry;
    }
  }

  const urgencyHits = URGENCY_WORDS.filter((w) => text.includes(w)).length;
  let priority: Priority = bestMatch.basePriority;
  if (urgencyHits >= 2) priority = "High";
  else if (urgencyHits === 0 && priority === "High") priority = "Medium";

  const confidence = Math.min(0.97, 0.62 + bestHits * 0.09 + (input.pincode ? 0.05 : 0));
  const dept = DEPARTMENTS.find((d) => d.id === bestMatch.deptId) ?? DEPARTMENTS[0]!;
  const duplicate = findDuplicateCandidate(input, dept.id);

  const matchedWords = bestMatch.words.filter((w) => text.includes(w)).slice(0, 3);
  const reasoning =
    `Indicative terms ${matchedWords.length ? matchedWords.map((w) => `“${w}”`).join(", ") : "in the description"} map this grievance to ${dept.name}. ` +
    SEVERITY_NOTE[priority];

  const result: ClassificationResult = {
    departmentId: dept.id,
    category: bestMatch.category,
    priority,
    confidence: Number(confidence.toFixed(2)),
    reasoning,
    language: input.language ?? "English",
  };
  if (duplicate) result.duplicate = duplicate;
  return result;
}

/** Simulates model latency so loading states are exercised in the UI. */
export function analyseGrievance(input: ClassificationInput, delayMs = 1200) {
  return new Promise<ClassificationResult>((resolve) => {
    setTimeout(() => resolve(classifyGrievance(input)), delayMs);
  });
}

/** Grievance ID generator matching the state registry format. */
export function generateGrievanceId(stateCode = "MH") {
  const serial = String(84_000 + Math.floor(Math.random() * 900) + 500).padStart(7, "0");
  return `GRV/${new Date().getFullYear()}/${stateCode}/${serial}`;
}
