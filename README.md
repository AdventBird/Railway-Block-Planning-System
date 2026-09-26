# Railway Block Planning System

> **Intelligent Railway Block Planning, Evaluation, and Maintenance Optimization System**

A professional full-stack platform built around the real operational workflow:

$$\text{OBSERVE} \longrightarrow \text{PLAN} \longrightarrow \text{SIMULATE} \longrightarrow \text{APPROVE}$$

The railway officer is always the final authority: drafts, algorithmic evaluations, simulations, and the planning assistant are advisory; only **Human Approval** authorizes an operational block.

**Everything the UI shows is computed.** The plan on the Planning Workspace is the real OR-Tools CP-SAT result (`POST /api/planner/run`); every simulation AFTER-state is a real event-driven replan (`POST /api/replan`); metrics are derived from assignments, never canned; INFEASIBLE is reported honestly with diagnostics; and when the backend is unreachable the UI says so and falls back to clearly-labelled seeded data — never a silent fake.

---

## 🏗️ Repository Architecture

```
Railway-Block-Planning-System/
├── frontend/                     # React + TypeScript + Vite SPA
│   ├── src/
│   │   ├── api/                  # ONE backend-facing layer
│   │   │   ├── client.ts         #   envelope client, endpoints, health check
│   │   │   ├── types.ts          #   shared API contract types
│   │   │   ├── planner.ts        #   POST /api/planner/run + /api/replan, normalisation
│   │   │   ├── simulation.ts     #   scenarios, evaluation, replan event factories
│   │   │   └── approvals.ts      #   governance actions + audit trail
│   │   ├── components/           # Command Center, Network, Workspace, Simulation, Approval
│   │   ├── data/                 # Seeded demo datasets + idMap.ts (canonical ↔ seed bridge)
│   │   ├── lib/                  # Derived planning arithmetic (span/union/stats)
│   │   └── ...
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                      # Python Core Planning & Optimization Engine
│   ├── app/
│   │   ├── adapters/             # TMS / SMMS / TDMS / COA / BDMS / Timetable normalisers
│   │   ├── api/                  # ONE FastAPI app (app.py) + planning/governance router
│   │   ├── data/                 # Canonical source registers (dirty rows included)
│   │   ├── models/               # Configurable cross-department priority mapping (JSON)
│   │   ├── rules/                # Compatibility, possession, related-work, reason codes
│   │   ├── services/             # Ingestion → bridge → priority/optimizer → planner →
│   │   │                         #   replanning, scenarios, evaluation, governance
│   │   ├── tests/                # 258 tests (unit + end-to-end API flow)
│   │   ├── config.py             # Environment-driven settings
│   │   ├── main.py               # uvicorn entrypoint (python -m backend.app.main)
│   │   └── schemas.py            # Canonical Pydantic models & response envelope
│   ├── requirements.txt
│   └── pytest.ini
│
├── .github/workflows/ci.yml      # CI: backend tests + frontend build
├── package.json                  # Root monorepo orchestration
└── README.md
```

**One canonical dataset, one app.** The source registers (TMS defects, SMMS incidents, TDMS OHE, COA blocks, BDMS bridges, timetable) are ingested once into canonical Pydantic models. Every planner-facing entry point funnels through a single bridge projection into CP-SAT. The former legacy zero-dependency server is retired — `backend.app.api.app` is the only FastAPI application, and `python -m backend.app.main` is the only way to start it.

**Id bridge.** The seeded demo uses planning-desk ids (`W1…W3`, `J-01…J-13`) while the backend serves canonical register ids (`BLK-2026-…` blocks, `TMS-ENG-…`/`SMMS-SIG-…`/`TDMS-OHE-…` jobs). `frontend/src/data/idMap.ts` is the single documented correspondence between the two — the UI never silently renames an id.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18 or higher) & **npm**
- **Python** (v3.10 or higher)

### Installation

```bash
git clone https://github.com/AdventBird/Railway-Block-Planning-System.git
cd Railway-Block-Planning-System

# Frontend dependencies
cd frontend && npm install && cd ..

# Backend dependencies
pip install -r backend/requirements.txt
```

---

## 💻 Running the Application

### 1. Backend planning server (start this first)

```bash
npm run dev:backend
# or
python -m backend.app.main      # ONE FastAPI app on http://127.0.0.1:8000
```

### 2. Frontend development server

```bash
npm run dev
# → http://localhost:5173  (expects the backend on 127.0.0.1:8000)
```

### API surface (all answers use the canonical envelope `{status, generated_at, payload, data_quality, errors}`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Ingestion snapshot + honest data-quality verdict |
| GET | `/api/jobs` · `/api/trains` · `/api/blocks` · `/api/network` | Canonical world queries |
| POST | `/api/ingest` · `/api/validate` | Ingestion & validation with per-record messages |
| GET | `/api/jobs/{id}/block-compatibility` · `/related` · `/possession` | Rule-engine queries |
| GET | `/api/coordination` · `/api/reason-codes` | Compatibility verdicts & reason-code catalogue |
| **POST** | **`/api/planner/run`** | **Real CP-SAT plan** (`mode`: SAFETY_FIRST / BALANCED / PUNCTUALITY_FIRST); stores `PLAN-r1` |
| **POST** | **`/api/replan`** | **Event-driven replan** (SPECIAL_TRAIN, TRAIN_CANCELLED, RESOURCE_FAILURE, EMERGENCY_JOB, WINDOW_REDUCED, WINDOW_WITHDRAWN, PRIORITY_CHANGE, OPERATIONAL_RESTRICTION) → r2, r3, … with before/after diffs |
| GET/POST | `/api/scenarios` · `/api/scenarios/run` | Seeded scenario world + runs |
| POST | `/api/evaluate` | Baseline comparison: EARLIEST_AVAILABLE vs GREEDY_PRIORITY vs CP_SAT on identical inputs |
| POST | `/api/plans/{id}/approve` · `/modify` · `/reject` · `/lock` | Officer-gated governance lifecycle |
| GET | `/api/plans/{id}` · `/api/plans/{id}/audit` · `/api/audit` | Governed plan + immutable audit trail |
| POST | `/api/plans/{id}/staleness` | Snapshot-vs-world drift detection (STALE status) |

Envelope `status` is the worst data-quality verdict across returned records (READY → REVIEW_REQUIRED → STALE → INVALID) — the malformed register rows in the seed data are flagged, never hidden.

### 3. Production build & preview

```bash
npm run build
npm run preview
```

---

## 🧪 Testing

```bash
# Backend: 258 tests — unit coverage (adapters, canonical models, data quality,
# rules, priority, optimizer, planner, replanning, scenarios, evaluation,
# fairness, buffer, resources) + end-to-end API flow tests (test_e2e.py) that
# pin the §46 invariants and the CP-SAT scheduling guarantees (genuine
# parallelism for compatible jobs, conditional ordering, interval-exact
# resource conflicts, locked assignments, cross-midnight intervals) through
# the same endpoints the frontend calls.
npm run test:backend
# or
python -m pytest backend/app/tests -q

# Typecheck + production build of the frontend
npm run typecheck
npm run build

# Full monorepo validation
npm test
```

---

## 🖥️ Operational Views

| Group | View | Purpose |
| --- | --- | --- |
| **Operations** | **Command Center** | "What needs my attention right now" — KPIs, attention list, tonight's plan strip, data-source status |
| **Operations** | **Network** | Interactive NDLS–BSB schematic (sections, UP/DOWN lanes, search, filters, progressive-disclosure section panel) |
| **Planning** | **Planning Workspace** | Work to schedule · railway timeline · recommended block plan. The plan IS the CP-SAT result; "Generate Plan" re-runs it live; INFEASIBLE shows backend blocking constraints and reason codes |
| **Planning** | **Simulation** | Operational replay: BEFORE → EVENT → AFTER. The AFTER plan is the real `POST /api/replan` result (banner shows live CP-SAT + plan version); a scripted projection is used only when the backend is unreachable, and says so |
| **Planning** | **Planning Assistant** | Advisory natural-language helper — proposes scenarios, never mutates the plan |
| **Governance** | **Approval & History** | Approve / Modify / Reject / Lock through the backend plan store (`PLAN-r1`), with the backend's immutable audit trail alongside the seeded decision history |

---

## ⚙️ Core Principles

- **Tier 0–4 Priority Rulebook**: strict operational prioritization — no ambiguous confidence percentages or arbitrary scores.
- **Resource & Method Compatibility**: compatibility comes from work method, electrical isolation, track access and machinery. Same corridor ≠ automatically compatible.
- **Human-in-the-Loop Governance**: the planner, replanner and assistant are advisory; only explicit officer approval commits blocks. Every action records officer, timestamp, version, reason and affected jobs in a backend audit trail.
- **Locked plans stay locked**: a LOCKED plan rejects further mutations until a new plan version is issued.
- **Explainable deferrals**: every deferred job carries backend-owned reason codes (INSUFFICIENT_WINDOW, TRAIN_CONFLICT, RESOURCE_CONFLICT, ISOLATION_CONFLICT, INCOMPATIBLE_WORK, LOWER_PRIORITY, …) plus plain-language explanations.
- **Honesty over polish**: solver status (OPTIMAL / FEASIBLE / HEURISTIC / INFEASIBLE), data-quality verdicts and backend availability are always shown as they are — computed scenario metrics, never fabricated ones.
