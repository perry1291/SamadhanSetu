export type Priority = "High" | "Medium" | "Low";

export type GrievanceStatus =
  | "Submitted"
  | "Under Review"
  | "Assigned"
  | "In Progress"
  | "Resolved"
  | "Closed";

export const STATUS_FLOW: GrievanceStatus[] = [
  "Submitted",
  "Under Review",
  "Assigned",
  "In Progress",
  "Resolved",
  "Closed",
];

export interface Department {
  id: string;
  name: string;
  shortName: string;
  slaDays: number;
  nodalOfficer: string;
}

export interface TimelineEvent {
  at: string;
  actor: string;
  action: string;
  note?: string;
}

export interface Grievance {
  id: string;
  title: string;
  description: string;
  citizenName: string;
  mobile: string;
  email: string;
  language: string;
  departmentId: string;
  priority: Priority;
  status: GrievanceStatus;
  ward: string;
  city: string;
  state: string;
  pincode: string;
  address: string;
  lat: number;
  lng: number;
  filedOn: string;
  daysPending: number;
  slaDueOn: string;
  assignedOfficer?: string;
  aiConfidence: number;
  aiReasoning: string;
  category: string;
  evidence: string[];
  resolutionNote?: string;
  resolvedOn?: string;
  internalNotes: { at: string; by: string; text: string }[];
  timeline: TimelineEvent[];
}

export const DEPARTMENTS: Department[] = [
  {
    id: "PWD",
    name: "Public Works Department (Roads & Buildings)",
    shortName: "Public Works",
    slaDays: 15,
    nodalOfficer: "Er. Rakesh Deshmukh",
  },
  {
    id: "JAL",
    name: "Jal Board / Water Supply & Sewerage",
    shortName: "Water Supply",
    slaDays: 7,
    nodalOfficer: "Er. Sunita Nair",
  },
  {
    id: "SWM",
    name: "Solid Waste Management & Sanitation",
    shortName: "Sanitation",
    slaDays: 5,
    nodalOfficer: "Shri Mahesh Kulkarni",
  },
  {
    id: "ELEC",
    name: "Electricity Distribution (DISCOM)",
    shortName: "Electricity",
    slaDays: 3,
    nodalOfficer: "Er. Anil Ramteke",
  },
  {
    id: "HEALTH",
    name: "Public Health & Municipal Hospitals",
    shortName: "Public Health",
    slaDays: 10,
    nodalOfficer: "Dr. Kavita Iyer",
  },
  {
    id: "TRANS",
    name: "Transport & Traffic Management",
    shortName: "Transport",
    slaDays: 12,
    nodalOfficer: "Shri Prakash Jadhav",
  },
  {
    id: "REV",
    name: "Revenue & Land Records",
    shortName: "Revenue",
    slaDays: 21,
    nodalOfficer: "Smt. Neelam Chauhan",
  },
];

export const OFFICERS = [
  { id: "OFF-1021", name: "Er. Rakesh Deshmukh", designation: "Executive Engineer", dept: "PWD" },
  { id: "OFF-1044", name: "Er. Sunita Nair", designation: "Superintending Engineer", dept: "JAL" },
  { id: "OFF-1077", name: "Shri Mahesh Kulkarni", designation: "Sanitary Inspector", dept: "SWM" },
  { id: "OFF-1090", name: "Er. Anil Ramteke", designation: "Assistant Engineer", dept: "ELEC" },
  { id: "OFF-1112", name: "Dr. Kavita Iyer", designation: "Medical Officer", dept: "HEALTH" },
  { id: "OFF-1136", name: "Shri Prakash Jadhav", designation: "Traffic Cell Officer", dept: "TRANS" },
  { id: "OFF-1150", name: "Smt. Neelam Chauhan", designation: "Tehsildar", dept: "REV" },
];

export const LANGUAGES = [
  "English",
  "हिन्दी (Hindi)",
  "मराठी (Marathi)",
  "বাংলা (Bengali)",
  "தமிழ் (Tamil)",
  "తెలుగు (Telugu)",
  "ગુજરાતી (Gujarati)",
  "ಕನ್ನಡ (Kannada)",
];

export const departmentById = (id: string) =>
  DEPARTMENTS.find((d) => d.id === id) ?? DEPARTMENTS[0]!;

const t = (at: string, actor: string, action: string, note?: string): TimelineEvent =>
  note === undefined ? { at, actor, action } : { at, actor, action, note };

export const GRIEVANCES: Grievance[] = [
  {
    id: "GRV/2026/MH/0084217",
    title: "Large potholes on Karve Road causing accidents",
    description:
      "A stretch of nearly 300 metres on Karve Road near Nal Stop chowk has developed deep potholes after the last spell of rain. Two-wheeler riders have fallen thrice this week. Request immediate patchwork and permanent resurfacing.",
    citizenName: "Aditya Kulkarni",
    mobile: "9822014477",
    email: "aditya.kulkarni@example.in",
    language: "मराठी (Marathi)",
    departmentId: "PWD",
    priority: "High",
    status: "In Progress",
    ward: "Ward 14 — Kothrud",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411038",
    address: "Karve Road, near Nal Stop Chowk, Kothrud",
    lat: 18.5074,
    lng: 73.8177,
    filedOn: "2026-08-19",
    daysPending: 13,
    slaDueOn: "2026-09-03",
    assignedOfficer: "Er. Rakesh Deshmukh",
    aiConfidence: 0.94,
    aiReasoning:
      "Keywords 'pothole', 'road', 'resurfacing' with a named arterial road map to Roads & Buildings. Injury mention and repeat reports from the same pincode raise severity.",
    category: "Road & Pothole Repair",
    evidence: ["Road damage photograph (2 files)", "Ward inspection note"],
    internalNotes: [
      { at: "2026-08-22", by: "Er. Rakesh Deshmukh", text: "Site inspected. Cold-mix patching approved; tender for resurfacing under ward budget." },
    ],
    timeline: [
      t("2026-08-19 09:14", "Citizen Portal", "Grievance submitted", "Filed in Marathi via web portal"),
      t("2026-08-19 09:14", "AI Triage Engine", "Auto-classified to Public Works Department", "Confidence 94%"),
      t("2026-08-19 11:02", "Ward Grievance Cell", "Marked Under Review"),
      t("2026-08-20 10:30", "Supervisor — Zone 3", "Assigned to Er. Rakesh Deshmukh"),
      t("2026-08-22 16:45", "Er. Rakesh Deshmukh", "Status changed to In Progress", "Patchwork scheduled"),
    ],
  },
  {
    id: "GRV/2026/MH/0084311",
    title: "No water supply in Sahakar Nagar for five days",
    description:
      "Households in Lane 4, Sahakar Nagar have not received piped water since 26 August. Tanker supply is irregular. Elderly residents are severely affected.",
    citizenName: "Meenakshi Raghavan",
    mobile: "9004512238",
    email: "meenakshi.r@example.in",
    language: "English",
    departmentId: "JAL",
    priority: "High",
    status: "Assigned",
    ward: "Ward 09 — Sahakar Nagar",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411009",
    address: "Lane 4, Sahakar Nagar No. 2",
    lat: 18.4836,
    lng: 73.8478,
    filedOn: "2026-08-27",
    daysPending: 5,
    slaDueOn: "2026-09-03",
    assignedOfficer: "Er. Sunita Nair",
    aiConfidence: 0.97,
    aiReasoning:
      "Explicit mention of piped water supply interruption and tanker dependency maps to Water Supply & Sewerage. Duration over 72 hours triggers High priority rule.",
    category: "Water Supply Disruption",
    evidence: ["Empty overhead tank photograph"],
    internalNotes: [],
    timeline: [
      t("2026-08-27 08:02", "Citizen Portal", "Grievance submitted"),
      t("2026-08-27 08:02", "AI Triage Engine", "Auto-classified to Jal Board", "Confidence 97%"),
      t("2026-08-27 12:20", "Zonal Cell", "Marked Under Review"),
      t("2026-08-28 09:40", "Supervisor — Zone 2", "Assigned to Er. Sunita Nair"),
    ],
  },
  {
    id: "GRV/2026/MH/0084355",
    title: "Garbage not collected in Dhanori for over a week",
    description:
      "The ghanta gaadi has not visited Vishrantwadi–Dhanori Road for eight days. Overflowing bins near the community hall are attracting stray dogs.",
    citizenName: "Imran Shaikh",
    mobile: "8600771290",
    email: "imran.shaikh@example.in",
    language: "हिन्दी (Hindi)",
    departmentId: "SWM",
    priority: "Medium",
    status: "Under Review",
    ward: "Ward 03 — Dhanori",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411015",
    address: "Vishrantwadi–Dhanori Road, near community hall",
    lat: 18.5896,
    lng: 73.8935,
    filedOn: "2026-08-29",
    daysPending: 3,
    slaDueOn: "2026-09-03",
    aiConfidence: 0.91,
    aiReasoning:
      "Terms 'garbage', 'bins', 'collection vehicle' map to Solid Waste Management. Public health risk noted but no outbreak reported — Medium priority.",
    category: "Waste Collection",
    evidence: ["Overflowing bin photograph"],
    internalNotes: [],
    timeline: [
      t("2026-08-29 18:31", "Citizen Portal", "Grievance submitted"),
      t("2026-08-29 18:31", "AI Triage Engine", "Auto-classified to Solid Waste Management", "Confidence 91%"),
      t("2026-08-30 10:05", "Ward Grievance Cell", "Marked Under Review"),
    ],
  },
  {
    id: "GRV/2026/MH/0084102",
    title: "Street lights non-functional on Baner Road service lane",
    description:
      "Eleven street light poles between Baner Phata and Sakal Nagar have been dark for three weeks. The stretch is unsafe for women commuters after 8 pm.",
    citizenName: "Priya Deshpande",
    mobile: "9730044118",
    email: "priya.deshpande@example.in",
    language: "English",
    departmentId: "ELEC",
    priority: "High",
    status: "Resolved",
    ward: "Ward 07 — Baner",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411045",
    address: "Baner Road service lane, near Sakal Nagar",
    lat: 18.5642,
    lng: 73.7769,
    filedOn: "2026-08-11",
    daysPending: 0,
    slaDueOn: "2026-08-14",
    assignedOfficer: "Er. Anil Ramteke",
    aiConfidence: 0.95,
    aiReasoning:
      "Street lighting failure maps to DISCOM maintenance wing. Safety-of-women context elevates priority to High per SOP 4.2.",
    category: "Street Lighting",
    evidence: ["Night photograph of dark stretch"],
    resolutionNote:
      "All eleven poles restored with LED fittings on 14 August. Feeder cable joint replaced. Joint verification done with ward committee member.",
    resolvedOn: "2026-08-14",
    internalNotes: [
      { at: "2026-08-13", by: "Er. Anil Ramteke", text: "Cable fault localised near pole 6; material issued from Aundh store." },
    ],
    timeline: [
      t("2026-08-11 20:11", "Citizen Portal", "Grievance submitted"),
      t("2026-08-11 20:11", "AI Triage Engine", "Auto-classified to Electricity Distribution", "Confidence 95%"),
      t("2026-08-12 09:15", "Zonal Cell", "Assigned to Er. Anil Ramteke"),
      t("2026-08-13 15:00", "Er. Anil Ramteke", "Status changed to In Progress"),
      t("2026-08-14 17:22", "Er. Anil Ramteke", "Marked Resolved", "Restoration verified"),
    ],
  },
  {
    id: "GRV/2026/MH/0084298",
    title: "Potholes near Nal Stop damaging vehicles",
    description:
      "Karve Road stretch close to Nal Stop has multiple craters. My scooter suspension was damaged yesterday. Kindly repair the road urgently.",
    citizenName: "Sneha Patil",
    mobile: "9921887654",
    email: "sneha.patil@example.in",
    language: "मराठी (Marathi)",
    departmentId: "PWD",
    priority: "Medium",
    status: "Submitted",
    ward: "Ward 14 — Kothrud",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411038",
    address: "Karve Road, Nal Stop",
    lat: 18.5081,
    lng: 73.8189,
    filedOn: "2026-08-26",
    daysPending: 6,
    slaDueOn: "2026-09-10",
    aiConfidence: 0.89,
    aiReasoning:
      "Semantic similarity of 0.93 with GRV/2026/MH/0084217 within 400 m and same pincode — flagged as probable duplicate for officer review.",
    category: "Road & Pothole Repair",
    evidence: ["Vehicle damage photograph"],
    internalNotes: [],
    timeline: [
      t("2026-08-26 07:48", "Citizen Portal", "Grievance submitted"),
      t("2026-08-26 07:48", "AI Triage Engine", "Duplicate candidate flagged", "93% similarity with GRV/2026/MH/0084217"),
    ],
  },
  {
    id: "GRV/2026/MH/0084377",
    title: "Mosquito breeding due to stagnant water near school",
    description:
      "Stagnant water has accumulated behind the municipal school in Hadapsar for two weeks. Several dengue cases reported in the lane. Request fogging and drainage.",
    citizenName: "Ravi Teja Kondapalli",
    mobile: "7020394411",
    email: "ravi.teja@example.in",
    language: "తెలుగు (Telugu)",
    departmentId: "HEALTH",
    priority: "High",
    status: "In Progress",
    ward: "Ward 21 — Hadapsar",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411028",
    address: "Behind PMC School No. 42, Hadapsar",
    lat: 18.5089,
    lng: 73.926,
    filedOn: "2026-08-24",
    daysPending: 8,
    slaDueOn: "2026-09-03",
    assignedOfficer: "Dr. Kavita Iyer",
    aiConfidence: 0.92,
    aiReasoning:
      "Vector-borne disease indicators (dengue, stagnant water, fogging) route to Public Health. Reported cases trigger High priority.",
    category: "Vector Control & Sanitation",
    evidence: ["Stagnant water photograph", "Lane survey sheet"],
    internalNotes: [
      { at: "2026-08-26", by: "Dr. Kavita Iyer", text: "Fogging round 1 completed; abatement of breeding site pending PWD drainage support." },
    ],
    timeline: [
      t("2026-08-24 11:20", "Citizen Portal", "Grievance submitted"),
      t("2026-08-24 11:20", "AI Triage Engine", "Auto-classified to Public Health", "Confidence 92%"),
      t("2026-08-25 09:00", "Zonal Cell", "Assigned to Dr. Kavita Iyer"),
      t("2026-08-26 14:10", "Dr. Kavita Iyer", "Status changed to In Progress", "Fogging round 1 done"),
    ],
  },
  {
    id: "GRV/2026/MH/0083990",
    title: "Illegal parking blocking ambulance access in Camp",
    description:
      "Vehicles parked on both sides of East Street near the clinic block ambulance movement. Request enforcement and no-parking signage.",
    citizenName: "Farhan Qureshi",
    mobile: "9860221145",
    email: "farhan.q@example.in",
    language: "English",
    departmentId: "TRANS",
    priority: "Medium",
    status: "Closed",
    ward: "Ward 05 — Camp",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411001",
    address: "East Street, Camp",
    lat: 18.5142,
    lng: 73.8797,
    filedOn: "2026-07-30",
    daysPending: 0,
    slaDueOn: "2026-08-11",
    assignedOfficer: "Shri Prakash Jadhav",
    aiConfidence: 0.88,
    aiReasoning: "Parking enforcement and signage requests route to Transport & Traffic Management.",
    category: "Traffic & Parking",
    evidence: ["Street photograph"],
    resolutionNote:
      "No-parking boards installed on the northern kerb, towing round conducted on 08 August. Citizen confirmed satisfaction on 12 August.",
    resolvedOn: "2026-08-09",
    internalNotes: [],
    timeline: [
      t("2026-07-30 13:05", "Citizen Portal", "Grievance submitted"),
      t("2026-08-01 10:00", "Traffic Cell", "Assigned to Shri Prakash Jadhav"),
      t("2026-08-09 12:40", "Shri Prakash Jadhav", "Marked Resolved"),
      t("2026-08-12 09:30", "Citizen Portal", "Closed after citizen confirmation"),
    ],
  },
  {
    id: "GRV/2026/MH/0084402",
    title: "Delay in mutation entry of land record",
    description:
      "Application for mutation of 7/12 extract submitted at Haveli Tehsil office on 02 July is still pending. Repeated visits have not helped.",
    citizenName: "Sushil Bhosale",
    mobile: "9975336612",
    email: "sushil.bhosale@example.in",
    language: "मराठी (Marathi)",
    departmentId: "REV",
    priority: "Low",
    status: "Under Review",
    ward: "Haveli Taluka",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411030",
    address: "Haveli Tehsil Office, Pune",
    lat: 18.5108,
    lng: 73.8489,
    filedOn: "2026-08-30",
    daysPending: 2,
    slaDueOn: "2026-09-20",
    aiConfidence: 0.86,
    aiReasoning: "Mutation, 7/12 extract and tehsil office references map to Revenue & Land Records.",
    category: "Land Records & Mutation",
    evidence: ["Acknowledgement receipt scan"],
    internalNotes: [],
    timeline: [
      t("2026-08-30 15:44", "Citizen Portal", "Grievance submitted"),
      t("2026-08-31 10:12", "Tehsil Grievance Cell", "Marked Under Review"),
    ],
  },
  {
    id: "GRV/2026/MH/0084188",
    title: "Sewage overflow in Yerwada lane",
    description:
      "Drainage chamber overflowing near Gunjan Chowk for six days. Foul smell and slush outside houses.",
    citizenName: "Anjali Gaikwad",
    mobile: "9552104477",
    email: "anjali.gaikwad@example.in",
    language: "मराठी (Marathi)",
    departmentId: "JAL",
    priority: "High",
    status: "In Progress",
    ward: "Ward 11 — Yerwada",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411006",
    address: "Gunjan Chowk lane, Yerwada",
    lat: 18.5518,
    lng: 73.8867,
    filedOn: "2026-08-21",
    daysPending: 11,
    slaDueOn: "2026-08-28",
    assignedOfficer: "Er. Sunita Nair",
    aiConfidence: 0.93,
    aiReasoning: "Sewage chamber overflow maps to Sewerage wing of Jal Board. Health hazard and SLA breach risk raise priority.",
    category: "Sewerage & Drainage",
    evidence: ["Overflow photograph (3 files)"],
    internalNotes: [
      { at: "2026-08-25", by: "Er. Sunita Nair", text: "Jetting machine deployed; root cause is collapsed line requiring 20 m replacement." },
    ],
    timeline: [
      t("2026-08-21 08:55", "Citizen Portal", "Grievance submitted"),
      t("2026-08-22 09:30", "Zonal Cell", "Assigned to Er. Sunita Nair"),
      t("2026-08-25 11:00", "Er. Sunita Nair", "Status changed to In Progress"),
      t("2026-08-28 09:00", "SLA Monitor", "SLA breached — escalated to Supervisor"),
    ],
  },
  {
    id: "GRV/2026/MH/0084420",
    title: "Overflowing garbage bins near Dhanori community hall",
    description:
      "Bins at the Dhanori community hall have not been emptied for a week. Same problem as reported by other residents.",
    citizenName: "Kiran Wagh",
    mobile: "9764412200",
    email: "kiran.wagh@example.in",
    language: "मराठी (Marathi)",
    departmentId: "SWM",
    priority: "Medium",
    status: "Submitted",
    ward: "Ward 03 — Dhanori",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411015",
    address: "Dhanori community hall",
    lat: 18.59,
    lng: 73.8941,
    filedOn: "2026-08-31",
    daysPending: 1,
    slaDueOn: "2026-09-05",
    aiConfidence: 0.9,
    aiReasoning: "High textual and spatial similarity with GRV/2026/MH/0084355 (same ward, same category).",
    category: "Waste Collection",
    evidence: [],
    internalNotes: [],
    timeline: [
      t("2026-08-31 07:20", "Citizen Portal", "Grievance submitted"),
      t("2026-08-31 07:20", "AI Triage Engine", "Duplicate candidate flagged", "88% similarity with GRV/2026/MH/0084355"),
    ],
  },
  {
    id: "GRV/2026/MH/0084061",
    title: "Broken footpath slabs near Shivajinagar bus stand",
    description: "Several footpath slabs are broken creating a trip hazard for senior citizens.",
    citizenName: "Deepak Sharma",
    mobile: "9822556611",
    email: "deepak.sharma@example.in",
    language: "हिन्दी (Hindi)",
    departmentId: "PWD",
    priority: "Low",
    status: "Resolved",
    ward: "Ward 08 — Shivajinagar",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411005",
    address: "Near ST bus stand, Shivajinagar",
    lat: 18.5308,
    lng: 73.8478,
    filedOn: "2026-08-05",
    daysPending: 0,
    slaDueOn: "2026-08-20",
    assignedOfficer: "Er. Rakesh Deshmukh",
    aiConfidence: 0.87,
    aiReasoning: "Footpath repair falls under Roads & Buildings maintenance wing.",
    category: "Footpath Repair",
    evidence: ["Footpath photograph"],
    resolutionNote: "Twenty-two slabs replaced and levelled on 18 August under ward maintenance contract.",
    resolvedOn: "2026-08-18",
    internalNotes: [],
    timeline: [
      t("2026-08-05 10:00", "Citizen Portal", "Grievance submitted"),
      t("2026-08-07 11:00", "Ward Cell", "Assigned to Er. Rakesh Deshmukh"),
      t("2026-08-18 16:00", "Er. Rakesh Deshmukh", "Marked Resolved"),
    ],
  },
  {
    id: "GRV/2026/MH/0084433",
    title: "Frequent power cuts in Wanowrie during evening hours",
    description: "Unscheduled outages of 1–2 hours every evening for the past ten days affecting students and small shops.",
    citizenName: "Nikhil Pawar",
    mobile: "9130447788",
    email: "nikhil.pawar@example.in",
    language: "English",
    departmentId: "ELEC",
    priority: "Medium",
    status: "Assigned",
    ward: "Ward 18 — Wanowrie",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411040",
    address: "Salunke Vihar Road, Wanowrie",
    lat: 18.4869,
    lng: 73.8998,
    filedOn: "2026-08-28",
    daysPending: 4,
    slaDueOn: "2026-08-31",
    assignedOfficer: "Er. Anil Ramteke",
    aiConfidence: 0.93,
    aiReasoning: "Unscheduled outage pattern maps to DISCOM feeder maintenance.",
    category: "Power Outage",
    evidence: [],
    internalNotes: [],
    timeline: [
      t("2026-08-28 19:40", "Citizen Portal", "Grievance submitted"),
      t("2026-08-29 09:10", "Sub-division Cell", "Assigned to Er. Anil Ramteke"),
    ],
  },
];

export interface DuplicateGroup {
  id: string;
  primaryId: string;
  relatedIds: string[];
  similarity: number;
  rationale: string;
  distanceMetres: number;
  status: "Pending review" | "Merged" | "Marked unique";
}

export const DUPLICATE_GROUPS: DuplicateGroup[] = [
  {
    id: "DUP-2026-0431",
    primaryId: "GRV/2026/MH/0084217",
    relatedIds: ["GRV/2026/MH/0084298"],
    similarity: 0.93,
    rationale:
      "Near-identical description embeddings, same category (Road & Pothole Repair), same pincode 411038 and geo-distance under 400 m within a 7-day window.",
    distanceMetres: 340,
    status: "Pending review",
  },
  {
    id: "DUP-2026-0446",
    primaryId: "GRV/2026/MH/0084355",
    relatedIds: ["GRV/2026/MH/0084420"],
    similarity: 0.88,
    rationale:
      "Both grievances reference the Dhanori community hall bins and non-collection over a week. Same ward and department.",
    distanceMetres: 65,
    status: "Pending review",
  },
];

export const MONTHLY_TRENDS = [
  { month: "Mar", received: 1840, resolved: 1602 },
  { month: "Apr", received: 2012, resolved: 1778 },
  { month: "May", received: 2244, resolved: 1965 },
  { month: "Jun", received: 2680, resolved: 2211 },
  { month: "Jul", received: 3012, resolved: 2604 },
  { month: "Aug", received: 3288, resolved: 2947 },
];

export const RESOLUTION_TIME_BY_DEPT = DEPARTMENTS.map((d, i) => ({
  department: d.shortName,
  days: [8.4, 4.1, 2.9, 2.2, 6.5, 7.8, 14.6][i]!,
  slaDays: d.slaDays,
  compliance: [82, 91, 96, 94, 88, 79, 68][i]!,
}));

export const TOP_PINCODES = [
  { pincode: "411038", area: "Kothrud", count: 412, topCategory: "Road & Pothole Repair" },
  { pincode: "411015", area: "Dhanori", count: 368, topCategory: "Waste Collection" },
  { pincode: "411006", area: "Yerwada", count: 341, topCategory: "Sewerage & Drainage" },
  { pincode: "411028", area: "Hadapsar", count: 305, topCategory: "Vector Control" },
  { pincode: "411045", area: "Baner", count: 288, topCategory: "Street Lighting" },
  { pincode: "411009", area: "Sahakar Nagar", count: 254, topCategory: "Water Supply" },
];

export const HOTSPOTS = [
  { id: "HS-01", area: "Kothrud", pincode: "411038", count: 412, priority: "High" as Priority, deptId: "PWD", x: 22, y: 58 },
  { id: "HS-02", area: "Dhanori", pincode: "411015", count: 368, priority: "Medium" as Priority, deptId: "SWM", x: 62, y: 18 },
  { id: "HS-03", area: "Yerwada", pincode: "411006", count: 341, priority: "High" as Priority, deptId: "JAL", x: 58, y: 34 },
  { id: "HS-04", area: "Hadapsar", pincode: "411028", count: 305, priority: "High" as Priority, deptId: "HEALTH", x: 78, y: 62 },
  { id: "HS-05", area: "Baner", pincode: "411045", count: 288, priority: "Medium" as Priority, deptId: "ELEC", x: 18, y: 26 },
  { id: "HS-06", area: "Sahakar Nagar", pincode: "411009", count: 254, priority: "Medium" as Priority, deptId: "JAL", x: 38, y: 70 },
  { id: "HS-07", area: "Camp", pincode: "411001", count: 187, priority: "Low" as Priority, deptId: "TRANS", x: 52, y: 50 },
  { id: "HS-08", area: "Wanowrie", pincode: "411040", count: 163, priority: "Medium" as Priority, deptId: "ELEC", x: 68, y: 74 },
  { id: "HS-09", area: "Shivajinagar", pincode: "411005", count: 149, priority: "Low" as Priority, deptId: "PWD", x: 42, y: 40 },
  { id: "HS-10", area: "Haveli", pincode: "411030", count: 96, priority: "Low" as Priority, deptId: "REV", x: 34, y: 52 },
];

export const PLATFORM_STATS = {
  received: 128_446,
  resolved: 112_318,
  departments: DEPARTMENTS.length,
  avgResolutionDays: 6.4,
  slaCompliance: 87,
  districts: 36,
};

export const grievanceById = (id: string) => GRIEVANCES.find((g) => g.id === id);

/** Mock "my complaints" — grievances tied to the signed-in demo citizen. */
export const MY_CITIZEN_MOBILE = "9822014477";
export const myGrievances = () =>
  GRIEVANCES.filter((g) =>
    ["GRV/2026/MH/0084217", "GRV/2026/MH/0084102", "GRV/2026/MH/0083990", "GRV/2026/MH/0084433"].includes(g.id),
  );
