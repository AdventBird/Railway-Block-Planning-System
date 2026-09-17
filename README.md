# AI-Powered Intelligent Railway Block Planning & Maintenance Coordination

Frontend-only prototype (synthetic data, no backend/LLM/optimizer — outputs are simulated)
structured around the real workflow:

**Railway Data → Priority → Compatibility → Block Planning → Simulation → Explanation → Human Approval**

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Sections (sidebar)

| Group | View | Purpose |
| --- | --- | --- |
| Operations | **Command Center** | Attention → windows → combinations → plan → why → approval, at a glance |
| Operations | **Network Schematic** | Interactive railway diagram (kept intact from v1 — core feature) |
| Planning | **AI Planning Assistant** | Scripted conversational drafting; advisory only, never authorizes |
| Planning | **Priority Queue** | Unified TMS / SMMS / TDMS jobs, Tier 0–4 rulebook (no AI scores) |
| Planning | **Block Planner** | 22:00–08:00 corridor timeline: windows, trains, VIP special, existing + recommended blocks |
| Planning | **Compatibility & Bundling** | Compatible / Conditional / Incompatible groups — method & isolation based, never proximity |
| Planning | **Recommended Plan** | Per-window jobs, resources, train impact, deferrals with reasons |
| Planning | **Simulation** | 6 what-if toggles with Before/After plan, utilization and explanations |
| Governance | **Conflicts & Reasons** | Plain-language explanations for every deferral/rejection |
| Governance | **Human Approval** | Approve / Modify / Reject / Lock decision / override reason |
| Governance | **Weekly / Monthly** | 7-day strip, deferred bank, deadlines, asset availability, month summary |
| Governance | **Decision History** | Audit trail: recommendation, action, override reason, version, timestamp |

## Key principles baked in

- Priority is exclusively **Tier 0–4** — no confidence percentages, no numeric AI scores.
- Compatibility is decided by **work method, isolation and resources** — same corridor ≠ compatible.
- The assistant and the plan are **advisory**; only **Human Approval** authorizes a block.
- Every deferral carries a plain-language reason (insufficient window, train/resource/isolation
  conflict, incompatible maintenance, higher-priority work).

## Architecture

```
src/
  data/       opsData.ts · jobsData.ts · planData.ts · mockRailwayData.ts (schematic feed)
  components/ NetworkDiagram/TrackEdge/StationNode/StatusLegend (v1, intact)
              CommandCenter · PlanningAssistant · PriorityQueue · BlockPlanner
              Compatibility · BlockPlanView · Simulation · ConflictsView
              Approval · PlanningCalendar · DecisionHistory
              ui.tsx (primitives incl. Drawer / Collapse / Kpi)
              drawers.tsx (shared detail drawers — job · train · alert · conflict
                          · compat group · block window · planning day)
```

Progressive disclosure: every screen shows only the decision-relevant summary;
secondary information (job details, reasons, resources, history, audit records)
opens in the shared right-side `Drawer` or `Collapse` sections on click.

Swap the arrays in `src/data/` for a real feed later — every view derives automatically.
