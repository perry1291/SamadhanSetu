# SamadhanSetu Citizens

Build a government-grade AI-powered Citizen Grievance Redressal Platform called "SamadhanSetu" for India, based on SIH26-S02.

IMPORTANT:

Focus primarily on creating a polished, realistic UI/UX and complete application structure. Use realistic mock data for now. Do NOT over-engineer the backend or implement complex ML infrastructure yet. AI/ML features should be represented through clean placeholder functions that can be connected later.

The platform must feel like an actual Government of India / state government grievance system, not a generic hackathon dashboard.

CORE WORKFLOW:

Citizen Complaint

→ AI Classification

→ Department Routing

→ Priority Assessment

→ Duplicate Detection

→ Officer Action

→ Resolution

→ Citizen Tracking

ROLES:

1. CITIZEN

2. DEPARTMENT OFFICER

3. ADMIN / SUPERVISOR

CITIZEN PORTAL:

1. Landing Page

- "Your Voice, Our Action"

- File Complaint CTA

- Key statistics: complaints received, resolved, departments

- Simple 4-step process: Submit → Analyze → Route → Resolve

- Government-style trustworthy visual design

2. File Complaint

- Name, mobile number, email

- Preferred language

- Complaint title and description

- Location/address and pincode

- Optional image upload

- AI analysis preview showing:

  - Suggested department

  - Priority: High / Medium / Low

  - Confidence

  - Brief reasoning

  - Possible duplicate complaint

- Citizen can review/edit AI suggestions before submission

- Generate a unique Grievance ID after submission

3. Track Complaint

- Search using Grievance ID + mobile number

- Clear status timeline:

  Submitted → Under Review → Assigned → In Progress → Resolved → Closed

- Assigned department/officer

- Complaint location

- Resolution details

- Download acknowledgment

4. Citizen Dashboard

- My complaints

- Active / Resolved filters

- Status, priority and department

- View details

- Appeal / "Not Satisfied" option

OFFICER / GOVERNMENT DASHBOARD:

Create a professional administrative dashboard designed around accountability and workload management.

Dashboard:

- Total complaints

- Pending complaints

- High-priority complaints

- Complaints approaching SLA

- Resolution rate

- Average resolution time

Priority Queue:

- High / Medium / Low tabs

- Complaint ID

- Subject

- Department

- Location

- Priority

- Days pending

- Current status

- Actions: View / Assign / Escalate / Resolve

Grievance Detail:

- Complete complaint information

- Citizen information

- Location/map

- Uploaded evidence

- AI classification and reasoning

- Duplicate/related complaints

- Status update

- Assign officer

- Internal notes

- Resolution evidence

- Complete activity/audit timeline

DUPLICATE DETECTION:

Create a dedicated page showing AI-suggested duplicate complaints with:

- Similarity percentage

- Primary complaint

- Related complaints

- Side-by-side comparison

- Merge / Mark Unique actions

GIS / HOTSPOT VIEW:

Create a full-screen map showing complaint density across an area.

Include:

- Complaint clusters

- Department filter

- Priority filter

- Date filter

- Pincode/area search

- Complaint count per cluster

- Clickable complaint details

ANALYTICS:

- Complaints by department

- Priority distribution

- Resolution trends

- Average resolution time

- Top complaint locations/pincodes

- SLA compliance

DESIGN DIRECTION:

Make it look like a serious Indian government digital service:

- Clean, institutional and trustworthy

- Blue as primary color with restrained saffron/orange accents

- Excellent typography and spacing

- Accessible and mobile responsive

- Clear status and priority indicators

- Avoid excessive gradients, glassmorphism, neon colors or flashy startup aesthetics

- Use Indian administrative terminology where appropriate

- Include realistic Indian names, locations, pincodes, departments and grievance IDs in mock data

- Design for both mobile citizens and desktop government officers

- Include proper loading, empty, error and success states

IMPORTANT PRODUCT PRINCIPLES:

The system should emphasize:

- Citizen accessibility

- Transparency

- Accountability

- Department-wise ownership

- SLA monitoring

- Audit trails

- Evidence-backed decisions

- Privacy of citizen information

- Accessibility and multilingual readiness

Create all major pages, navigation, reusable components, realistic mock data and complete user flows.

For now, prioritize FRONTEND UI, UX, navigation and application structure over actual backend/AI implementation. Keep AI integration points modular so real classification, prioritization, embeddings and duplicate detection can be connected later.

Do not add unnecessary features beyond the grievance-management workflow.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/374bda74-d87c-43f9-aa39-b39f6b1581b2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
