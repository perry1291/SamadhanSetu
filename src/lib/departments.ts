/**
 * Controlled department registry for automatic grievance routing.
 *
 * This is a CLOSED list of five departments. It is the single source of truth:
 * the Zod enum, the JSON Schema sent to Groq, the prompt catalogue, the stored
 * routing values and the frontend display all derive from this file. Adding or
 * renaming a department here propagates everywhere, and the classifier's output
 * is validated against it, so a hallucinated department is rejected rather than
 * persisted.
 *
 * Scope: municipal and state-level civic services. Unrelated to the legacy mock
 * `DEPARTMENTS` in `mock-data.ts`, which the old Lovable pages still use and
 * which plays no part in classification.
 *
 * `slaDays` is configuration, not a per-grievance value: the SLA deadline is
 * derived from the routed department at submission time. These are working days
 * and should be confirmed against the relevant Citizen's Charter before
 * production use.
 *
 * Contains no personal data, so it is safe in the client bundle.
 */

export const DEPARTMENT_IDS = [
  "MUNICIPAL_URBAN_DEVELOPMENT",
  "POWER_ELECTRICITY",
  "PUBLIC_HEALTH_SANITATION",
  "ROADS_TRANSPORT",
  "POLICE_LAW_ORDER",
] as const;

export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

export interface DepartmentEntry {
  readonly id: DepartmentId;
  readonly name: string;
  readonly nativeName: string;
  /** Working days allowed for redressal, used to compute `slaDueAt`. */
  readonly slaDays: number;
  /** Remit given to the classifier, including explicit boundary rules. */
  readonly scope: string;
}

export const DEPARTMENTS: readonly DepartmentEntry[] = [
  {
    id: "MUNICIPAL_URBAN_DEVELOPMENT",
    name: "Municipal / Urban Development",
    nativeName: "नगर निगम / शहरी विकास",
    slaDays: 15,
    scope:
      "Piped water supply and tankers, water billing, storm-water drains, building permissions and unauthorised construction, encroachment on public land, property tax, birth and death certificates, parks and civic amenities, stray animals. NOT road surfaces (Roads & Transport), NOT garbage or sewage (Public Health & Sanitation).",
  },
  {
    id: "POWER_ELECTRICITY",
    name: "Power & Electricity (MSEDCL/DISCOM)",
    nativeName: "ऊर्जा एवं विद्युत (महावितरण / डिस्कॉम)",
    slaDays: 3,
    scope:
      "Power outages and load shedding, voltage fluctuation, electricity billing and meter faults, new connections and name transfer, transformer and feeder faults, damaged or live-hanging electric poles and wires, street light not working. Anything electrical belongs here, including street lighting.",
  },
  {
    id: "PUBLIC_HEALTH_SANITATION",
    name: "Public Health & Sanitation",
    nativeName: "सार्वजनिक स्वास्थ्य एवं स्वच्छता",
    slaDays: 7,
    scope:
      "Garbage collection and overflowing bins, street sweeping, public toilets, sewage and drainage overflow, blocked or broken sewer lines, mosquito breeding and fogging, stagnant water, disease outbreak, food adulteration, government hospitals, dispensaries and primary health centres, medical staff conduct. All waste and sewage matters belong here.",
  },
  {
    id: "ROADS_TRANSPORT",
    name: "Roads & Transport",
    nativeName: "सड़क एवं परिवहन",
    slaDays: 15,
    scope:
      "Potholes and damaged road surfaces, broken footpaths and dividers, road construction and repair quality, missing road signage, traffic signal not working, public bus services and routes, bus stops, auto and taxi fare or refusal complaints, driving licence and vehicle registration, parking infrastructure. Road and transport INFRASTRUCTURE belongs here; enforcement against offenders belongs to Police & Law/Order.",
  },
  {
    id: "POLICE_LAW_ORDER",
    name: "Police & Law/Order",
    nativeName: "पुलिस एवं विधि व्यवस्था",
    slaDays: 7,
    scope:
      "Theft, robbery and other crime, harassment, threats and public safety, women's and children's safety, missing persons, illegal parking and traffic-rule enforcement, drunken driving, rash driving, noise pollution and loudspeaker nuisance, illegal liquor or gambling, unlawful assembly, police inaction or misconduct, FIR registration difficulty. ENFORCEMENT and law-and-order matters belong here.",
  },
];

const BY_ID = new Map<string, DepartmentEntry>(DEPARTMENTS.map((d) => [d.id, d]));

export function findDepartment(id: string): DepartmentEntry | undefined {
  return BY_ID.get(id);
}

/** Authoritative membership test used to validate model output. */
export function isDepartmentId(value: unknown): value is DepartmentId {
  return typeof value === "string" && BY_ID.has(value);
}

export function departmentName(id: string, locale: "en" | "hi"): string {
  const entry = BY_ID.get(id);
  if (entry === undefined) return id;
  return locale === "hi" ? entry.nativeName : entry.name;
}

/**
 * Compact catalogue handed to the classifier. Derived from the same table as the
 * validator, so the prompt and the enum can never disagree.
 */
export function departmentCatalogueForPrompt(): string {
  return DEPARTMENTS.map((d) => `- ${d.id}: ${d.name}. ${d.scope}`).join("\n");
}
