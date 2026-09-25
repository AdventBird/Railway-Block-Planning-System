# Railway Block Planning System

> **Intelligent Railway Block Planning, Evaluation, and Maintenance Optimization System**

A professional full-stack platform built around the real operational workflow:

$$\text{OBSERVE} \longrightarrow \text{PLAN} \longrightarrow \text{SIMULATE} \longrightarrow \text{APPROVE}$$

The railway officer is always the final authority: drafts, algorithmic evaluations, simulations, and the planning assistant are advisory; only **Human Approval** authorizes an operational block.

---

## 🏗️ Repository Architecture

The project is structured as an industry-standard full-stack monorepo:

```
Railway-Block-Planning-System/
├── frontend/                     # React + TypeScript + Vite SPA
│   ├── src/
│   │   ├── api/                  # API client & planner service (backend-ready)
│   │   ├── components/           # UI components, diagrams, drawers, panels
│   │   ├── data/                 # Operational seed datasets & types
│   │   ├── lib/                  # Derived planning arithmetic
│   │   ├── App.tsx               # Root application router/layout
│   │   ├── auth.ts               # Authentication state & roles
│   │   ├── index.css             # Design system & custom animations
│   │   ├── main.tsx              # DOM entry point
│   │   └── types.ts              # Core shared TypeScript declarations
│   ├── index.html                # Vite HTML template
│   ├── package.json              # Frontend dependencies and scripts
│   ├── tsconfig.json             # TypeScript configuration
│   ├── vite.config.ts            # Vite bundler configuration
│   └── serve.mjs                 # Production/preview static server
│
├── backend/                      # Python Core Planning & Optimization Engine
│   ├── app/
│   │   ├── services/             # Optimization, Evaluation, Replanning, Fairness, etc.
│   │   ├── tests/                # 92 unit tests covering all planning algorithms
│   │   ├── api.py                # REST API router & zero-dependency HTTP server
│   │   └── __init__.py
│   ├── __init__.py
│   ├── requirements.txt          # Python dependencies
│   └── pytest.ini                # Pytest configuration
│
├── .github/                      # CI/CD Workflows
│   └── workflows/
│       └── ci.yml                # Automated CI: backend tests + frontend build
│
├── .gitignore                    # Comprehensive ignore rules
├── package.json                  # Root monorepo orchestration
└── README.md                     # Project documentation
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18 or higher) & **npm**
- **Python** (v3.10 or higher)

### Installation

```bash
# Clone the repository
git clone https://github.com/AdventBird/Railway-Block-Planning-System.git
cd Railway-Block-Planning-System

# Install frontend dependencies
npm run dev --prefix frontend  # or cd frontend && npm install

# Install backend dependencies
pip install -r backend/requirements.txt
```

---

## 💻 Running the Application

### 1. Frontend Development Server
From the root directory:
```bash
npm run dev
# or
npm run dev:frontend
# → Opens at http://localhost:5173
```

### 2. Backend Planning Server
From the root directory:
```bash
npm run dev:backend
# or
python -m backend.app.api
# → Runs on http://127.0.0.1:8000
```

### 3. Production Build & Preview
```bash
npm run build
npm run preview
```

---

## 🧪 Testing

### Backend Unit Tests (Pytest)
Run the complete test suite (92 unit tests covering the evaluation engine, replanning, multi-criteria optimizer, fairness metrics, buffer algorithms, and API endpoints):
```bash
npm run test:backend
# or
python -m pytest backend/app/tests
```

### Full Monorepo Validation
```bash
npm test
```

---

## 🖥️ Operational Views

| Group | View | Purpose |
| --- | --- | --- |
| **Operations** | **Command Center** | "What needs my attention right now" — 5 KPIs, attention list, tonight's plan strip, simulated data-source status |
| **Operations** | **Network** | Interactive NDLS–BSB schematic (14 sections, UP/DOWN lanes, search, filters, progressive-disclosure section panel) |
| **Planning** | **Planning Workspace** | Three-zone screen: work to schedule · railway timeline · recommended block plan. Compatibility, conflicts, deferred jobs and unused capacity; Tonight / Week / Month switch |
| **Planning** | **Simulation** | Reserve / change a window (relief train, emergency, reduce/remove window, priority change, restriction) → BEFORE → EVENT → AFTER with reasoning |
| **Governance** | **Approval & History** | Approve / Modify / Reject + lock, with full audit trail |

---

## ⚙️ Core Principles

- **Tier 0–4 Priority Rulebook**: Strict operational prioritization without ambiguous confidence percentages or arbitrary scoring.
- **Resource & Method Compatibility**: Compatibility is determined by work method, electrical isolation, track access, and machinery. Same corridor $\neq$ automatically compatible.
- **Human-in-the-Loop Governance**: The algorithmic planner and natural-language planning assistant are advisory; only explicit officer approval can commit blocks.
- **Explainable Deferrals**: Every deferred maintenance task carries clear operational reason codes (e.g. insufficient window, train conflict, isolation clash, crew limit).
