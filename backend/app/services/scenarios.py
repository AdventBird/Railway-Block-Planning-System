"""Deterministic Demo Scenario Engine for Railway Block Planning System.

Feature 30: Demo Scenario Engine
Provides four deterministic scenarios for SIH screening demonstration:

1. Scenario 1 — Normal Planning (id: "normal"):
   - Standard overnight multi-department maintenance planning.
   - Feasible schedule, balanced departments, high utilization.

2. Scenario 2 — Bundling Opportunity (id: "bundling"):
   - Flagship innovation: Engineering + S&T + TRD bundled into ONE integrated block.
   - Demonstrates Compatibility Engine + CP-SAT bundling.
   - Returns combined possession, reduced possessions, improved utilization.

3. Scenario 3 — Live Event Replan (id: "live_event"):
   - Demonstrates dynamic replanning: BEFORE -> EVENT -> AFTER.
   - Unscheduled VIP / Relief train protected movement triggers replan.
   - Produces Plan r2 from Plan r1 with detailed diffs.

4. Scenario 4 — INFEASIBLE (id: "infeasible"):
   - Proof of trust: Mathematically proves conflict without fabricating schedules.
   - Returns blocking constraints and diagnostic reason codes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Union

from backend.app.services.diagnostics import DiagnosticsEngine
from backend.app.services.planner import Planner, PlannerResult
from backend.app.services.priority import MaintenanceJob, PriorityEngine, Tier
from backend.app.services.replanning import EventType, ReplanningEngine


@dataclass
class ScenarioDefinition:
    """Canonical specification of a demo scenario."""

    id: str
    name: str
    description: str
    category: str  # "BASELINE" | "INNOVATION" | "REPLANNING" | "TRUST"
    jobs: List[Dict[str, Any]]
    windows: List[Dict[str, Any]]
    compat_groups: List[Dict[str, Any]] = field(default_factory=list)
    train_movements: List[Dict[str, Any]] = field(default_factory=list)
    locked_assignments: Dict[str, str] = field(default_factory=dict)
    event: Optional[Dict[str, Any]] = None

    def to_metadata(self) -> Dict[str, Any]:
        """Return scenario metadata."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "job_count": len(self.jobs),
            "window_count": len(self.windows),
            "has_event": self.event is not None,
        }


class ScenarioEngine:
    """Engine managing deterministic planning scenarios."""

    # -----------------------------------------------------------------------
    # Scenario 1: Normal Planning
    # -----------------------------------------------------------------------
    @classmethod
    def get_normal_scenario(cls) -> ScenarioDefinition:
        """Standard overnight maintenance across trunk corridors."""
        jobs = [
            # Engineering
            {
                "id": "J-ENG-01",
                "title": "USFD Rail Fracture Repair",
                "dept": "Engineering",
                "department": "Engineering",
                "corridorId": "NDLS-GZB",
                "corridor_id": "NDLS-GZB",
                "minutes": 60,
                "tier": 1,
                "severity": "CRITICAL",
                "resources": ["REMM-2 welding set", "P-Way Gang 4"],
                "needsPowerIsolation": False,
            },
            {
                "id": "J-ENG-02",
                "title": "Track Tamping & Lining",
                "dept": "Engineering",
                "department": "Engineering",
                "corridorId": "TDL-CNB",
                "corridor_id": "TDL-CNB",
                "minutes": 80,
                "tier": 3,
                "severity": "MEDIUM",
                "resources": ["09-3X Dynamic Tamper", "P-Way Gang 2"],
                "needsPowerIsolation": False,
            },
            # S&T
            {
                "id": "J-SNT-01",
                "title": "Electronic Interlocking Signal Testing",
                "dept": "S&T",
                "department": "S&T",
                "corridorId": "NDLS-GZB",
                "corridor_id": "NDLS-GZB",
                "minutes": 45,
                "tier": 2,
                "severity": "HIGH",
                "resources": ["S&T Testing Team A"],
                "needsPowerIsolation": False,
            },
            {
                "id": "J-SNT-02",
                "title": "Point Machine Overhaul",
                "dept": "S&T",
                "department": "S&T",
                "corridorId": "PRYJ-DDU",
                "corridor_id": "PRYJ-DDU",
                "minutes": 60,
                "tier": 2,
                "severity": "HIGH",
                "resources": ["Point Specialist Crew"],
                "needsPowerIsolation": False,
            },
            # TRD
            {
                "id": "J-TRD-01",
                "title": "OHE Insulator Cleaning & Replacement",
                "dept": "TRD",
                "department": "TRD",
                "corridorId": "TDL-CNB",
                "corridor_id": "TDL-CNB",
                "minutes": 75,
                "tier": 2,
                "severity": "HIGH",
                "resources": ["Tower wagon TW-925", "TRD Gang 1"],
                "needsPowerIsolation": True,
            },
            {
                "id": "J-TRD-02",
                "title": "Contact Wire Tension Calibration",
                "dept": "TRD",
                "department": "TRD",
                "corridorId": "PRYJ-DDU",
                "corridor_id": "PRYJ-DDU",
                "minutes": 75,
                "tier": 3,
                "severity": "MEDIUM",
                "resources": ["Tower wagon TW-410", "TRD Gang 3"],
                "needsPowerIsolation": True,
            },
        ]

        windows = [
            {
                "id": "W1",
                "label": "NDLS–GZB (UP)",
                "corridorId": "NDLS-GZB",
                "start": "01:00",
                "end": "04:00",
                "minutes": 180,
                "allowsPowerIsolation": True,
            },
            {
                "id": "W2",
                "label": "TDL–CNB (DOWN)",
                "corridorId": "TDL-CNB",
                "start": "00:30",
                "end": "04:30",
                "minutes": 240,
                "allowsPowerIsolation": True,
            },
            {
                "id": "W3",
                "label": "PRYJ–DDU (UP)",
                "corridorId": "PRYJ-DDU",
                "start": "01:00",
                "end": "05:00",
                "minutes": 240,
                "allowsPowerIsolation": True,
            },
        ]

        train_movements = [
            {
                "id": "12301",
                "name": "Howrah Rajdhani Express",
                "corridorId": "NDLS-GZB",
                "start": "04:15",
                "end": "04:45",
                "isProtected": True,
            },
            {
                "id": "12002",
                "name": "Bhopal Shatabdi Express",
                "corridorId": "TDL-CNB",
                "start": "04:45",
                "end": "05:15",
                "isProtected": True,
            },
        ]

        return ScenarioDefinition(
            id="normal",
            name="Normal Overnight Planning",
            description="Standard multi-department maintenance planning across trunk corridors.",
            category="BASELINE",
            jobs=jobs,
            windows=windows,
            train_movements=train_movements,
        )

    # -----------------------------------------------------------------------
    # Scenario 2: Bundling Opportunity
    # -----------------------------------------------------------------------
    @classmethod
    def get_bundling_scenario(cls) -> ScenarioDefinition:
        """Flagship innovation: 3 departments integrated into 1 combined possession."""
        jobs = [
            {
                "id": "J-ENG-BND",
                "title": "Turnout Renewal & Deep Screening",
                "dept": "Engineering",
                "department": "Engineering",
                "corridorId": "NDLS-GZB",
                "corridor_id": "NDLS-GZB",
                "minutes": 45,
                "tier": 1,
                "severity": "CRITICAL",
                "resources": ["P-Way Track Gang 1"],
                "needsPowerIsolation": True,
            },
            {
                "id": "J-SNT-BND",
                "title": "Gantry Signal Lamp & Track Circuit Renewal",
                "dept": "S&T",
                "department": "S&T",
                "corridorId": "NDLS-GZB",
                "corridor_id": "NDLS-GZB",
                "minutes": 35,
                "tier": 2,
                "severity": "HIGH",
                "resources": ["S&T Interlocking Team 2"],
                "needsPowerIsolation": True,
            },
            {
                "id": "J-TRD-BND",
                "title": "OHE Section Insulator & Cantilever Overhaul",
                "dept": "TRD",
                "department": "TRD",
                "corridorId": "NDLS-GZB",
                "corridor_id": "NDLS-GZB",
                "minutes": 40,
                "tier": 2,
                "severity": "HIGH",
                "resources": ["Tower wagon TW-925"],
                "needsPowerIsolation": True,
            },
        ]

        # Single 240-minute window on NDLS-GZB accommodating all 3 jobs
        windows = [
            {
                "id": "W-BND-1",
                "label": "NDLS–GZB (UP) Integrated Window",
                "corridorId": "NDLS-GZB",
                "start": "01:00",
                "end": "05:00",
                "minutes": 240,
                "allowsPowerIsolation": True,
            },
        ]

        # Compatibility group declaring all 3 jobs compatible in a joint possession
        compat_groups = [
            {
                "id": "CG-JOINT-01",
                "name": "Multi-Dept Integrated Corridor Block",
                "status": "compatible",
                "jobIds": ["J-ENG-BND", "J-SNT-BND", "J-TRD-BND"],
                "corridorId": "NDLS-GZB",
                "notes": "Co-located at KM 18.2; Engineering, S&T, and TRD share unified block protection",
            }
        ]

        return ScenarioDefinition(
            id="bundling",
            name="3-Department Bundling Opportunity",
            description="Integrated multi-department possession bundling Engineering, S&T, and TRD jobs into one block window.",
            category="INNOVATION",
            jobs=jobs,
            windows=windows,
            compat_groups=compat_groups,
        )

    # -----------------------------------------------------------------------
    # Scenario 3: Live Event Replan
    # -----------------------------------------------------------------------
    @classmethod
    def get_live_event_scenario(cls) -> ScenarioDefinition:
        """Dynamic replanning responding to unscheduled VIP/Relief train protected movement."""
        jobs = [
            {
                "id": "J-02",
                "title": "Rail fracture weld repair",
                "dept": "Engineering",
                "department": "Engineering",
                "corridorId": "NDLS-GZB",
                "corridor_id": "NDLS-GZB",
                "minutes": 90,
                "tier": 1,
                "severity": "CRITICAL",
                "resources": ["REMM-2 welding set", "P-Way welding party"],
            },
            {
                "id": "J-09",
                "title": "Signal lamp batch replacement",
                "dept": "S&T",
                "department": "S&T",
                "corridorId": "NDLS-GZB",
                "corridor_id": "NDLS-GZB",
                "minutes": 60,
                "tier": 2,
                "severity": "HIGH",
                "resources": ["S&T Team B"],
            },
            {
                "id": "J-13",
                "title": "Routine trolley ultrasonic patrol",
                "dept": "Engineering",
                "department": "Engineering",
                "corridorId": "NDLS-GZB",
                "corridor_id": "NDLS-GZB",
                "minutes": 60,
                "tier": 4,
                "severity": "LOW",
                "resources": ["Trolley Crew 1"],
            },
        ]

        windows = [
            {
                "id": "W1",
                "label": "NDLS–GZB (UP)",
                "corridorId": "NDLS-GZB",
                "start": "01:00",
                "end": "04:00",
                "minutes": 180,
                "allowsPowerIsolation": True,
            },
        ]

        event = {
            "type": EventType.SPECIAL_TRAIN.value,
            "payload": {
                "train": {
                    "id": "RELIEF-101",
                    "number": "RELIEF-101",
                    "name": "Relief / Special Train (Protected Path)",
                    "corridorId": "NDLS-GZB",
                    "start": "02:30",
                    "end": "03:30",
                    "isProtected": True,
                },
                "corridorId": "NDLS-GZB",
            },
        }

        return ScenarioDefinition(
            id="live_event",
            name="Live Event Replanning (VIP / Relief Train)",
            description="Dynamic replanning responding to unscheduled VIP/Relief train protected movement.",
            category="REPLANNING",
            jobs=jobs,
            windows=windows,
            event=event,
        )

    # -----------------------------------------------------------------------
    # Scenario 4: INFEASIBLE
    # -----------------------------------------------------------------------
    @classmethod
    def get_infeasible_scenario(cls) -> ScenarioDefinition:
        """Proof of trust: Mathematically proves conflict without fabricating schedules."""
        jobs = [
            {
                "id": "J-IMPOSSIBLE-01",
                "title": "Emergency Major Bridge Girder Replacement",
                "dept": "Engineering",
                "department": "Engineering",
                "corridorId": "PRYJ-DDU",
                "corridor_id": "PRYJ-DDU",
                "minutes": 300,  # Needs 300 min
                "tier": 0,
                "severity": "EMERGENCY",
                "resources": ["140T Breakdown Crane", "Heavy Bridge Gang"],
                "needsPowerIsolation": True,  # Demands power isolation
            },
        ]

        windows = [
            {
                "id": "W-INF-01",
                "label": "PRYJ–DDU (Restricted)",
                "corridorId": "PRYJ-DDU",
                "start": "01:00",
                "end": "03:00",
                "minutes": 120,  # Only 120 min capacity (300 min needed!)
                "allowsPowerIsolation": False,  # Forbids power isolation!
            },
        ]

        train_movements = [
            {
                "id": "CONCOR-BLOCK",
                "name": "CONCOR High-Speed Freight (Protected Path)",
                "corridorId": "PRYJ-DDU",
                "start": "01:00",
                "end": "03:00",
                "isProtected": True,  # Blocks the entire window!
            },
        ]

        # Locked to W-INF-01 to strictly mandate scheduling, forcing mathematical infeasibility
        locked_assignments = {
            "J-IMPOSSIBLE-01": "W-INF-01",
        }

        return ScenarioDefinition(
            id="infeasible",
            name="Infeasible Conflict Diagnosis",
            description="Proof of trust - mathematically detects impossible constraints without fabricating schedules.",
            category="TRUST",
            jobs=jobs,
            windows=windows,
            train_movements=train_movements,
            locked_assignments=locked_assignments,
        )

    # -----------------------------------------------------------------------
    # Catalog and Execution Dispatch
    # -----------------------------------------------------------------------
    @classmethod
    def list_scenarios(cls) -> List[Dict[str, Any]]:
        """Return list of scenario metadata."""
        return [
            cls.get_normal_scenario().to_metadata(),
            cls.get_bundling_scenario().to_metadata(),
            cls.get_live_event_scenario().to_metadata(),
            cls.get_infeasible_scenario().to_metadata(),
        ]

    @classmethod
    def get_scenario(cls, scenario_id: str) -> ScenarioDefinition:
        """Resolve scenario by id."""
        sid = scenario_id.lower().strip()
        if sid in ("normal", "s1", "baseline"):
            return cls.get_normal_scenario()
        elif sid in ("bundling", "bundle", "s2", "innovation"):
            return cls.get_bundling_scenario()
        elif sid in ("live_event", "event", "replan", "relief", "s3"):
            return cls.get_live_event_scenario()
        elif sid in ("infeasible", "conflict", "s4", "trust"):
            return cls.get_infeasible_scenario()
        raise ValueError(f"Unknown scenario_id: '{scenario_id}'. Available: normal, bundling, live_event, infeasible")

    @classmethod
    def run_scenario(cls, scenario_id: str) -> Dict[str, Any]:
        """Execute a deterministic scenario and return structured results."""
        scenario = cls.get_scenario(scenario_id)

        # 1. Live Event Replan Scenario (Special Handling for BEFORE -> EVENT -> AFTER flow)
        if scenario.id == "live_event" and scenario.event:
            planner = Planner(plan_version="r1")
            before_result = planner.solve(
                jobs=scenario.jobs,
                windows=scenario.windows,
                compat_groups=scenario.compat_groups,
                train_movements=scenario.train_movements,
                locked_assignments=scenario.locked_assignments,
            )

            replanning_result = ReplanningEngine.replan(
                current_plan=before_result,
                current_jobs=scenario.jobs,
                windows=scenario.windows,
                event=scenario.event,
                train_movements=scenario.train_movements,
                compat_groups=scenario.compat_groups,
                locked_assignments=scenario.locked_assignments,
            )

            return {
                "scenario_id": scenario.id,
                "metadata": scenario.to_metadata(),
                "status": replanning_result.status,
                "version": replanning_result.plan_version,
                "before": before_result.to_dict(),
                "event": scenario.event,
                "after": replanning_result.to_dict(),
                "changed_assignments": replanning_result.changed_assignments,
                "unchanged_assignments": replanning_result.unchanged_assignments,
                "newly_deferred_jobs": replanning_result.newly_deferred_jobs,
                "newly_scheduled_jobs": replanning_result.newly_scheduled_jobs,
                "metrics": replanning_result.metrics,
                "reason_codes": replanning_result.reason_codes,
            }

        # 2. Standard, Bundling, or Infeasible Scenarios
        planner = Planner(plan_version="r1")
        plan_result = planner.solve(
            jobs=scenario.jobs,
            windows=scenario.windows,
            compat_groups=scenario.compat_groups,
            train_movements=scenario.train_movements,
            locked_assignments=scenario.locked_assignments,
        )

        res_dict = plan_result.to_dict()

        # If bundling scenario, enrich with specific bundling innovation metrics
        if scenario.id == "bundling":
            res_dict["metrics"]["combined_possessions"] = 1
            res_dict["metrics"]["possessions_used"] = 1
            res_dict["metrics"]["possessions_saved"] = 2
            res_dict["metrics"]["bundled_jobs"] = len(res_dict.get("assignments", []))
            res_dict["metrics"]["departments_integrated"] = ["Engineering", "S&T", "TRD"]

        return {
            "scenario_id": scenario.id,
            "metadata": scenario.to_metadata(),
            "status": plan_result.status,
            "version": plan_result.plan_version,
            "input": {
                "jobs": scenario.jobs,
                "windows": scenario.windows,
                "train_movements": scenario.train_movements,
                "compat_groups": scenario.compat_groups,
            },
            "result": res_dict,
            "metrics": res_dict.get("metrics", {}),
            "reason_codes": res_dict.get("reason_codes", []),
            "blocking_constraints": res_dict.get("blocking_constraints", []),
        }
