# Railway Block Planning System

**AI-Powered Intelligent Railway Block Planning & Maintenance Coordination** — a
**frontend-only prototype** (synthetic data, no backend / LLM / optimizer — all outputs are
simulated) built around the real operational workflow:

**OBSERVE → PLAN → SIMULATE → APPROVE**

The officer is always the final decision-maker: drafts, simulations and the assistant are
advisory; only **Human Approval** authorizes a block.

This folder is the whole project — landing, sign-in and the React application included.

## Run

```bash
npm install

# development (app opens directly, no sign-in gate):
npm run dev          # → http://localhost:5173

# production demo (landing → sign-in → app):
npm run build        # type-check (strict) + production build into dist/
node serve.mjs       # → http://localhost:5252  (PORT env overrides)
```

Sign in with the demo account **admin@railways.gov.in / admin123** (or create an account —
prototype credentials stay in the browser only).

## Screens (5 views, hash-routed)

| Group | View | Purpose |
| --- | --- | --- |
| Operations | **Command Center** | "What needs my attention right now" — 5 KPIs, attention list, tonight's plan strip, simulated data-source status |
| Operations | **Network** | Interactive NDLS–BSB schematic (14 sections, UP/DOWN lanes, search, filters, progressive-disclosure section panel) |
| Planning | **Planning Workspace** | Three-zone screen: work to schedule · railway timeline · recommended block plan. Compatibility, conflicts, deferred jobs and unused capacity live here; Tonight / Week / Month switch |
| Planning | **Simulation** | Reserve / change a window (relief train, emergency, reduce/remove window, priority change, restriction) → BEFORE → EVENT → AFTER with reasoning |
| Governance | **Approval & History** | Approve / Modify / Reject + lock, with the audit trail below |

The **Planning Assistant** (top-right button on every screen) understands natural-language
requests such as *"Reserve NDLS–GZB from 02:30–03:30 for a relief train and reorganize
tonight's maintenance"* — it prepares a structured scenario and hands it to the Simulation,
never authorizing anything itself.

## Single fictional world

All screens share one dataset: the **NDLS–BSB trunk (NCR)** with 5 operational corridors
(NDLS–GZB, TDL–CNB, PRYJ–DDU, GZB–ALJN, DDU–BSB), a unified TMS/SMMS/TDMS/BDMS job feed
with the **Tier 0–4 priority rulebook** (no numeric scores), and computed plan metrics
(blocks · jobs · utilization · unused capacity — derived in `src/lib/plan.ts`, never
hand-maintained).

## Architecture

```
index.html                 Vite entry (landing + auth live inside the React app)
serve.mjs                  zero-dependency static server for the production demo
src/auth.ts                prototype sign-in / register / sign-out (localStorage)
src/lib/plan.ts            derived planning arithmetic (single source of truth)
src/data/                  opsData · jobsData · planData · mockRailwayData
src/components/            App shell · Landing (+auth) · CommandCenter · Workspace
                           · Timeline · Simulation · ApprovalHistory · PlanningAssistant
                           · NetworkDiagram + TrackEdge/StationNode/StatusLegend
                           · ui.tsx primitives · drawers.tsx (shared detail drawers)
dist/                      production build (served by serve.mjs)
```

## Key principles baked in

- Priority is exclusively **Tier 0–4** — no confidence percentages, no numeric scores.
- Compatibility is decided by **work method, isolation and resources** — same corridor ≠ compatible.
- The assistant and every plan are **advisory**; only **Human Approval** authorizes a block.
- Every deferral carries a plain-language reason (insufficient window, train/resource/isolation
  conflict, incompatible maintenance, higher-priority work).
- Every screen practices progressive disclosure: decision-relevant summary by default,
  details in right-side drawers on click.
