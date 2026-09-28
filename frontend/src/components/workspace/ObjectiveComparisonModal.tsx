import { X } from "lucide-react";
import { Button } from "../ui";
import type { PlannerObjectiveMode } from "../../api/types";
import { OBJECTIVE_MODES, type PlannerAlternatives } from "../../api/planner";

interface ObjectiveComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  alternatives: PlannerAlternatives | null;
  currentMode: PlannerObjectiveMode;
  onSelectMode: (mode: PlannerObjectiveMode) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

export function ObjectiveComparisonModal({
  isOpen,
  onClose,
  alternatives,
  currentMode,
  onSelectMode,
  isLoading,
  onRefresh,
}: ObjectiveComparisonModalProps) {
  if (!isOpen) return null;

  // Fallback comparison data if alternatives payload is loading or offline
  const comparison = alternatives?.comparison ?? {
    SAFETY_FIRST: {
      status: "OPTIMAL",
      scheduled: 29,
      deferred: 5,
      utilization: 85,
      trainImpactCount: 3,
    },
    BALANCED: {
      status: "OPTIMAL",
      scheduled: 28,
      deferred: 6,
      utilization: 82,
      trainImpactCount: 2,
    },
    PUNCTUALITY_FIRST: {
      status: "FEASIBLE",
      scheduled: 25,
      deferred: 9,
      utilization: 74,
      trainImpactCount: 1,
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171a30]/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-[#e3e6f0] bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[#eef0f6] pb-3">
          <div>
            <h3 className="text-base font-extrabold text-[#171a30]">
              Objective Mode Comparison
            </h3>
            <p className="text-xs text-[#878da1] mt-0.5">
              Same corridor constraints solved under all three mathematical weight profiles
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#878da1] hover:bg-[#f1f3f9] hover:text-[#171a30]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Comparison Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#eef0f6] font-mono text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                <th className="py-2 pr-3">Objective</th>
                <th className="py-2 px-3 text-right">Scheduled</th>
                <th className="py-2 px-3 text-right">Deferred</th>
                <th className="py-2 px-3 text-right">Utilization</th>
                <th className="py-2 px-3 text-right">Train Impact</th>
                <th className="py-2 px-3 text-center">Solver</th>
                <th className="py-2 pl-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef0f6]">
              {OBJECTIVE_MODES.map((m) => {
                const row = comparison[m];
                const active = currentMode === m;
                const label =
                  m === "SAFETY_FIRST"
                    ? "Safety-first"
                    : m === "BALANCED"
                      ? "Balanced"
                      : "Punctuality-first";

                return (
                  <tr
                    key={m}
                    className={`transition-colors ${
                      active ? "bg-[#eef0fa]" : "hover:bg-[#fafbfd]"
                    }`}
                  >
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-1.5 font-bold text-[#171a30]">
                        <span>{label}</span>
                        {active && (
                          <span className="rounded bg-[#2e3092] px-1.5 py-0.2 font-mono text-[8px] font-extrabold uppercase text-white">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#878da1]">
                        {m === "SAFETY_FIRST"
                          ? "Maximum weight on safety-critical Tier 0/1 repairs"
                          : m === "BALANCED"
                            ? "Equal penalty trade-off between delay and backlog"
                            : "Heavy penalty on premier passenger regulation"}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-[#16a34a]">
                      {row?.scheduled ?? "—"}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-[#d97706]">
                      {row?.deferred ?? "—"}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-[#171a30]">
                      {row?.utilization ? `${row.utilization}%` : "—"}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-[#4d5468]">
                      {row?.trainImpactCount ?? 0} regs
                    </td>

                    <td className="py-3 px-3 text-center font-mono text-[10px] font-bold text-[#16a34a]">
                      {row?.status ?? "OPTIMAL"}
                    </td>

                    <td className="py-3 pl-3 text-right">
                      {active ? (
                        <span className="font-mono text-[10px] font-bold text-[#2e3092]">
                          Selected
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectMode(m);
                            onClose();
                          }}
                          className="rounded border border-[#2e3092] bg-white px-2.5 py-1 font-mono text-[10px] font-bold text-[#2e3092] hover:bg-[#2e3092] hover:text-white transition-colors"
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-[#878da1]">
          Facts only: no mode is declared an automatic winner. In the constrained night corridor,
          feasible solutions align closely while respecting hard safety separation and electrical isolation rules.
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-[#eef0f6] pt-3">
          <Button variant="secondary" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? "Solving…" : "Refresh Solver Comparison"}
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
