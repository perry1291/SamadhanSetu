# SamadhanSetu 🇮🇳

### AI-Powered Citizen Grievance Redressal Platform

SamadhanSetu is a modern, AI-powered citizen grievance redressal platform designed to streamline the process of submitting, managing, routing, and resolving public complaints. The platform focuses on improving **transparency, accountability, department-wise ownership, and citizen accessibility** through an intuitive interface for citizens and government officials.

---

## 🌐 Project Overview

Traditional grievance systems can often involve delayed responses, incorrect department routing, duplicate complaints, and limited visibility into the resolution process.

SamadhanSetu addresses these challenges through an intelligent grievance-management workflow:

**Submit Complaint → AI Analysis → Department Routing → Priority Assessment → Officer Action → Resolution → Citizen Tracking**

The project is designed around realistic Indian government administrative workflows and provides separate interfaces for citizens, department officers, and administrators.

---

## ✨ Key Features

### 👤 Citizen Portal

- Submit grievances with location and contact details
- Upload supporting evidence
- AI-assisted complaint analysis
- Suggested department and priority level
- Duplicate complaint detection
- Unique Grievance ID generation
- Real-time grievance status tracking
- Complaint history dashboard
- Resolution details and citizen feedback
- Appeal or "Not Satisfied" option

### 🏛️ Government Officer Dashboard

- Centralized grievance management
- Priority-based complaint queue
- High-priority and SLA monitoring
- Department-wise complaint assignment
- Officer assignment and escalation
- Internal notes and activity tracking
- Resolution evidence management
- Complete grievance audit timeline

### 🤖 AI-Assisted Workflow

The application structure includes modular integration points for future AI capabilities such as:

- Complaint classification
- Department recommendation
- Priority assessment
- Duplicate complaint detection
- Similarity analysis
- AI-generated reasoning and recommendations

> Currently, AI functionality uses structured placeholder logic and realistic mock data, allowing real AI/ML models to be integrated in the future.

### 📊 Analytics & Monitoring

- Complaints by department
- Priority distribution
- Resolution trends
- Average resolution time
- SLA compliance monitoring
- Top complaint locations and pincodes

### 🗺️ GIS & Complaint Hotspots

- Complaint density visualization
- Location-based complaint clusters
- Department and priority filters
- Area and pincode search
- Interactive complaint information

---

## 👥 User Roles

### Citizen

Citizens can:

- Register and access their dashboard
- File grievances
- Track complaint progress
- View resolution details
- Provide feedback or raise an appeal

### Department Officer

Officers can:

- View assigned grievances
- Manage complaint queues
- Update grievance status
- Add internal notes
- Upload resolution evidence
- Escalate or resolve complaints

### Administrator / Supervisor

Administrators can:

- Monitor grievance performance
- Manage departments and officers
- Track SLA compliance
- Analyze complaint trends
- Identify duplicate and related grievances

---

## 🛠️ Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Modern component-based UI architecture

### Backend

- Node.js
- Express.js
- TypeScript

### Database & Services

The project structure includes modular service layers designed for future integration with:

- MongoDB
- Cloudinary
- Groq AI
- WhatsApp API

### AI/ML Integration Points

Future implementations can integrate:

- Natural Language Processing (NLP)
- Machine Learning classification models
- Text embeddings
- Vector databases
- Semantic similarity detection
- Large Language Models (LLMs)

---

## 📁 Project Structure

```text
SamadhanSetu/
│
├── public/                 # Static assets
├── src/                    # Frontend application
│   ├── components/         # Reusable UI components
│   ├── routes/             # Application pages and routes
│   ├── lib/                # Utility and service modules
│   └── styles.css          # Global styling
│
├── server/                 # Backend application
│   └── src/
│       ├── middleware/     # Authentication and middleware
│       ├── models/         # Database models
│       ├── routes/         # API routes
│       ├── services/       # Business logic
│       └── lib/            # Server-side utilities
│
├── .env.example            # Environment variable template
├── package.json
└── vite.config.ts
````

---

## 🔄 Core Grievance Workflow

```text
Citizen Complaint
       ↓
AI Classification
       ↓
Department Routing
       ↓
Priority Assessment
       ↓
Duplicate Detection
       ↓
Officer Assignment
       ↓
Investigation & Action
       ↓
Resolution
       ↓
Citizen Feedback & Closure
```

---

## 🎯 Project Highlights

* Government-oriented UI/UX design
* Realistic Indian administrative workflows
* Multi-role application architecture
* Modular frontend and backend structure
* AI-ready service architecture
* SLA and accountability-focused dashboards
* Privacy-conscious grievance management
* Responsive design for citizens and government officials
* Realistic mock data for demonstration

---

## 🚀 Getting Started

### Clone the Repository

```bash
git clone https://github.com/perry1291/SamadhanSetu.git
```

### Navigate to the Project

```bash
cd SamadhanSetu
```

### Install Dependencies

```bash
npm install
```

### Start the Development Server

```bash
npm run dev
```

---

## 🔐 Environment Variables

Create a `.env.local` file based on `.env.example`.

Example:

```env
MONGO_URI_SIH=your_mongodb_connection_string
GROQ_API_KEY=your_groq_api_key

META_WHATSAPP_TOKEN=your_meta_whatsapp_token
META_PHONE_NUMBER_ID=your_phone_number_id
META_TEMPLATE_NAME=your_template_name

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

JWT_SECRET=your_secure_jwt_secret
```

> Never commit `.env.local` or other files containing sensitive credentials to GitHub.

---

## 🔮 Future Improvements

* Integration with real government department APIs
* Production-ready AI classification models
* Semantic duplicate detection using embeddings
* Real-time notifications
* WhatsApp grievance updates
* Multilingual complaint processing
* Advanced GIS analytics
* Role-based authentication
* Automated SLA escalation
* Production database integration

---

## 📸 Project Purpose

SamadhanSetu was developed as a portfolio and problem-solving project inspired by the need for more efficient, transparent, and citizen-centric grievance redressal systems.

The project demonstrates skills in:

* Full-Stack Development
* React and TypeScript
* Backend Architecture
* REST API Design
* UI/UX Design
* AI Application Architecture
* Authentication and Role-Based Systems
* Database and Cloud Service Integration

---
