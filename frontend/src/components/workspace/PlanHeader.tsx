import { useState } from "react";
import {
  Sparkles,
  GitBranch,
  ChevronDown,
  BarChart3,
} from "lucide-react";
import { Button, StatusBadge } from "../ui";
import type { PlannerObjectiveMode } from "../../api/types";
import { OBJECTIVE_MODES } from "../../api/planner";

interface PlanHeaderProps {
  horizon: "month" | "week" | "day";
  setHorizon: (h: "month" | "week" | "day") => void;
  planVersion: string;
  planStatus: string;
  generatedDate: string;
  activePathTitle: string;
  onOpenPathBuilder: () => void;
  onGeneratePlan: () => void;
  isGenerating: boolean;
  objectiveMode: PlannerObjectiveMode;
  onSelectObjectiveMode: (mode: PlannerObjectiveMode) => void;
  onOpenObjectiveComparison: () => void;
}

export function PlanHeader({
  horizon,
  setHorizon,
  planVersion,
  planStatus,
  generatedDate,
  activePathTitle,
  onOpenPathBuilder,
  onGeneratePlan,
  isGenerating,
  objectiveMode,
  onSelectObjectiveMode,
  onOpenObjectiveComparison,
}: PlanHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const horizonTabs = [
    { id: "month", label: "Month" },
    { id: "week", label: "Week" },
    { id: "day", label: "Day" },
  ] as const;

  return (
    <header className="mb-4 rounded-xl border border-[#e3e6f0] bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Title, Subtitle, and Route Selector */}
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-[#171a30]">
                Planning Workspace
              </h1>
              <span className="rounded bg-[#eef0fa] px-2 py-0.5 text-[10px] font-bold text-[#2e3092]">
                Future Maintenance Plan
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#878da1]">
              Plan, review and adjust future maintenance work across the corridor
            </p>
          </div>

          {/* Route path selector */}
          <div className="flex items-center gap-1.5 rounded-lg border border-[#e3e6f0] bg-[#f8f9fd] px-2.5 py-1.5">
            <GitBranch size={13} className="text-[#2e3092]" />
            <button
              onClick={onOpenPathBuilder}
              className="flex items-center gap-1.5 text-xs font-bold text-[#171a30] hover:text-[#2e3092]"
              title="Click to edit corridor stations"
            >
              <span>{activePathTitle}</span>
              <ChevronDown size={13} className="text-[#878da1]" />
            </button>
            <button
              onClick={onOpenPathBuilder}
              className="ml-1 rounded border border-[#d9ddef] bg-white px-2 py-0.5 text-[10px] font-bold text-[#2e3092] hover:bg-[#eef0fa]"
            >
              Change Path
            </button>
          </div>
        </div>

        {/* Plan metadata, objective mode, and action controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Plan revision & authorization state */}
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className="font-mono text-xs font-bold text-[#171a30]">{planVersion}</span>
              <StatusBadge label={planStatus} tone="#d97706" />
            </div>
            <div className="mt-0.5 text-[10px] text-[#878da1]">{generatedDate}</div>
          </div>

          {/* Objective Mode Control */}
          <div className="relative">
            <div className="flex items-center rounded-lg border border-[#e3e6f0] bg-white p-0.5">
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-[#171a30] hover:bg-[#f5f6fc] rounded"
                title="Objective Weight Profile"
              >
                <span className="text-[10px] text-[#878da1] uppercase">Obj:</span>
                <span className="text-[#2e3092]">
                  {objectiveMode === "BALANCED"
                    ? "Balanced"
                    : objectiveMode === "SAFETY_FIRST"
                      ? "Safety"
                      : "Punctuality"}
                </span>
                <ChevronDown size={12} className="text-[#878da1]" />
              </button>

              <button
                type="button"
                onClick={onOpenObjectiveComparison}
                className="flex items-center gap-1 border-l border-[#eef0f6] px-2 py-1 text-[10px] font-bold text-[#4d5468] hover:text-[#2e3092] hover:bg-[#f5f6fc]"
                title="Compare objective profiles"
              >
                <BarChart3 size={12} />
                <span>Compare</span>
              </button>
            </div>

            {dropdownOpen && (
              <div
                className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-[#e3e6f0] bg-white p-1 shadow-lg"
                onMouseLeave={() => setDropdownOpen(false)}
              >
                <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                  Optimization Profile
                </div>
                {OBJECTIVE_MODES.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      onSelectObjectiveMode(mode);
                      setDropdownOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs font-semibold ${
                      objectiveMode === mode
                        ? "bg-[#eef0fa] text-[#2e3092]"
                        : "text-[#171a30] hover:bg-[#f5f6fc]"
                    }`}
                  >
                    <span>
                      {mode === "SAFETY_FIRST"
                        ? "Safety-first"
                        : mode === "BALANCED"
                          ? "Balanced"
                          : "Punctuality-first"}
                    </span>
                    {objectiveMode === mode && <span className="text-[10px] font-bold">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Month / Week / Day Switch */}
          <div className="flex rounded-lg border border-[#e3e6f0] bg-[#f1f3f9] p-0.5" role="tablist">
            {horizonTabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={horizon === t.id}
                onClick={() => setHorizon(t.id)}
                className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
                  horizon === t.id
                    ? "bg-[#2e3092] text-white shadow-xs"
                    : "text-[#4d5468] hover:text-[#171a30]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Generate Plan Button */}
          <Button
            onClick={onGeneratePlan}
            disabled={isGenerating}
            variant="primary"
            className="flex items-center gap-1.5"
          >
            <Sparkles size={13} className={isGenerating ? "animate-spin" : ""} />
            <span>{isGenerating ? "Planning…" : "Generate Plan"}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
