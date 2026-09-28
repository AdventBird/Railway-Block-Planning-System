import { Clock, Play, RotateCcw } from "lucide-react";
import {
  CANONICAL_PLANS,
  CANONICAL_SIM_BLOCKS,
  type EventTypeKey,
  type SimBlockMeta,
  type SimulationEventParams,
} from "../../data/simulationData";

interface SetupStepsProps {
  selectedPlanId: string;
  onPlanChange: (planId: string) => void;
  selectedBlockId: string;
  onBlockChange: (blockId: string) => void;
  selectedEventType: EventTypeKey;
  onEventTypeChange: (eventType: EventTypeKey) => void;
  eventParams: SimulationEventParams;
  onEventParamsChange: (params: SimulationEventParams) => void;
  onRunSimulation: () => void;
  onReset: () => void;
  simulating: boolean;
}

export default function SetupSteps({
  selectedPlanId,
  onPlanChange,
  selectedBlockId,
  onBlockChange,
  selectedEventType,
  onEventTypeChange,
  eventParams,
  onEventParamsChange,
  onRunSimulation,
  onReset,
  simulating,
}: SetupStepsProps) {
  const currentBlock: SimBlockMeta =
    CANONICAL_SIM_BLOCKS.find((b) => b.id === selectedBlockId) || CANONICAL_SIM_BLOCKS[0];

  const EVENT_TABS: { key: EventTypeKey; label: string; icon: string }[] = [
    { key: "special_train", label: "Special train", icon: "🚆" },
    { key: "reduce_window", label: "Reduce block window", icon: "⏱" },
    { key: "remove_block", label: "Remove block", icon: "🗑" },
    { key: "emergency_job", label: "Emergency job", icon: "⚠️" },
    { key: "resource_unavailable", label: "Resource unavailable", icon: "🛠" },
    { key: "priority_change", label: "Priority change", icon: "🏷" },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* STEP 1: SELECT PLAN AND BLOCK (4 cols) */}
      <div className="flex flex-col justify-between rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-xs lg:col-span-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2e3092] font-mono text-[11px] font-bold text-white">
              1
            </span>
            <h2 className="text-xs font-black uppercase tracking-wider text-[#171a30]">
              Select plan and block
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#626982]">
            Choose the baseline plan and the block you want to test
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {/* Plan Select */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                Plan
              </label>
              <select
                value={selectedPlanId}
                onChange={(e) => onPlanChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#e3e6f0] bg-white px-2.5 py-1.5 text-xs font-bold text-[#171a30] transition-colors hover:border-[#2e3092] focus:border-[#2e3092] focus:outline-none"
              >
                {CANONICAL_PLANS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Block Select */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                Block
              </label>
              <select
                value={selectedBlockId}
                onChange={(e) => onBlockChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#e3e6f0] bg-white px-2.5 py-1.5 text-xs font-bold text-[#171a30] transition-colors hover:border-[#2e3092] focus:border-[#2e3092] focus:outline-none"
              >
                {CANONICAL_SIM_BLOCKS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Selected Block Summary Card */}
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#eef0f6] bg-[#fafbfe] p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2e3092]/10 text-[#2e3092]">
            <Clock size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[#171a30]">
              <span>17 Sep 2026</span>
              <span className="text-[#a2a7ba]">·</span>
              <span className="font-mono text-[#2e3092]">
                {currentBlock.startTime} – {currentBlock.endTime} ({currentBlock.durationHours})
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-[#626982]">
              {currentBlock.section} · <span className="font-mono font-bold">{currentBlock.track}</span> ·{" "}
              {currentBlock.jobsCount} jobs
            </div>
          </div>
        </div>
      </div>

      {/* STEP 2: DEFINE THE CHANGE (5 cols) */}
      <div className="flex flex-col justify-between rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-xs lg:col-span-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2e3092] font-mono text-[11px] font-bold text-white">
              2
            </span>
            <h2 className="text-xs font-black uppercase tracking-wider text-[#171a30]">
              Define the change
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#626982]">
            Select the type of operational change and provide details
          </p>

          {/* Event Type Filter Chips */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EVENT_TABS.map((tab) => {
              const active = selectedEventType === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onEventTypeChange(tab.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                    active
                      ? "bg-[#2e3092] text-white shadow-xs"
                      : "border border-[#e3e6f0] bg-white text-[#4d5468] hover:border-[#2e3092] hover:text-[#171a30]"
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Active Event Sub-Form */}
          <div className="mt-4 rounded-xl border border-[#eef0f6] bg-[#fafbfe] p-3.5">
            {selectedEventType === "special_train" && (
              <div>
                <div className="text-xs font-bold text-[#171a30]">
                  Special / relief train
                </div>
                <div className="text-[11px] text-[#626982]">
                  Add a new protected train movement that must be accommodated.
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                      Direction
                    </label>
                    <select
                      value={eventParams.direction || currentBlock.direction}
                      onChange={(e) =>
                        onEventParamsChange({ ...eventParams, direction: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-[#e3e6f0] bg-white p-1 text-xs font-bold text-[#171a30]"
                    >
                      <option value="UP">UP</option>
                      <option value="DOWN">DOWN</option>
                      <option value="BOTH">BOTH</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                      From – To
                    </label>
                    <input
                      type="text"
                      value={eventParams.fromTo || currentBlock.section}
                      onChange={(e) =>
                        onEventParamsChange({ ...eventParams, fromTo: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-[#e3e6f0] bg-white p-1 text-xs font-bold text-[#171a30]"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                      Time
                    </label>
                    <input
                      type="text"
                      value={
                        eventParams.timeStart && eventParams.timeEnd
                          ? `${eventParams.timeStart} – ${eventParams.timeEnd}`
                          : "02:30 – 03:30"
                      }
                      onChange={(e) => {
                        const parts = e.target.value.split("–").map((s) => s.trim());
                        onEventParamsChange({
                          ...eventParams,
                          timeStart: parts[0] || "02:30",
                          timeEnd: parts[1] || "03:30",
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-[#e3e6f0] bg-white p-1 font-mono text-xs font-bold text-[#171a30]"
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedEventType === "reduce_window" && (
              <div>
                <div className="text-xs font-bold text-[#171a30]">
                  Reduce block window
                </div>
                <div className="text-[11px] text-[#626982]">
                  Current: {currentBlock.startTime} – {currentBlock.endTime} ({currentBlock.durationHours})
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                      New end time
                    </label>
                    <select
                      value={eventParams.newEndTime || "03:00"}
                      onChange={(e) =>
                        onEventParamsChange({ ...eventParams, newEndTime: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-[#e3e6f0] bg-white p-1.5 font-mono text-xs font-bold text-[#171a30]"
                    >
                      <option value="02:30">02:30 (-90 min)</option>
                      <option value="03:00">03:00 (-60 min)</option>
                      <option value="03:30">03:30 (-30 min)</option>
                    </select>
                  </div>
                  <div className="rounded-lg bg-white border border-[#eef0f6] px-3 py-1.5 text-xs font-bold text-[#d97706]">
                    Curtailed by 60 min
                  </div>
                </div>
              </div>
            )}

            {selectedEventType === "remove_block" && (
              <div>
                <div className="text-xs font-bold text-[#171a30]">
                  Remove block window
                </div>
                <div className="text-[11px] text-[#626982]">
                  Simulates full possession cancellation due to interlocking fault.
                </div>
                <div className="mt-2 text-xs font-bold text-[#dc2626]">
                  ⚠️ Warning: All jobs in {currentBlock.label} will be evaluated for deferral.
                </div>
              </div>
            )}

            {selectedEventType === "emergency_job" && (
              <div>
                <div className="text-xs font-bold text-[#171a30]">
                  Emergency job insertion
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                      Emergency Title
                    </label>
                    <input
                      type="text"
                      value={eventParams.emergencyTitle || "EMG-01 · Rail fracture"}
                      onChange={(e) =>
                        onEventParamsChange({ ...eventParams, emergencyTitle: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-[#e3e6f0] bg-white p-1 text-xs font-bold text-[#171a30]"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                      Duration (min)
                    </label>
                    <input
                      type="number"
                      value={eventParams.emergencyDuration || 90}
                      onChange={(e) =>
                        onEventParamsChange({
                          ...eventParams,
                          emergencyDuration: Number(e.target.value),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[#e3e6f0] bg-white p-1 text-xs font-bold text-[#171a30]"
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedEventType === "resource_unavailable" && (
              <div>
                <div className="text-xs font-bold text-[#171a30]">
                  Resource unavailable
                </div>
                <div className="mt-2">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                    Equipment / Gang
                  </label>
                  <select
                    value={eventParams.unavailableResource || "Tower Wagon RU-04"}
                    onChange={(e) =>
                      onEventParamsChange({ ...eventParams, unavailableResource: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-[#e3e6f0] bg-white p-1.5 text-xs font-bold text-[#171a30]"
                  >
                    <option value="Tower Wagon RU-04">Tower Wagon RU-04</option>
                    <option value="BCM-0932 Ballast Cleaner">BCM-0932 Ballast Cleaner</option>
                    <option value="Rail Weld Gang NCR-2">Rail Weld Gang NCR-2</option>
                  </select>
                </div>
              </div>
            )}

            {selectedEventType === "priority_change" && (
              <div>
                <div className="text-xs font-bold text-[#171a30]">
                  Priority escalation
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                      Job
                    </label>
                    <select
                      value={eventParams.changedJobId || currentBlock.jobIds[0] || "J-13"}
                      onChange={(e) =>
                        onEventParamsChange({ ...eventParams, changedJobId: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-[#e3e6f0] bg-white p-1 text-xs font-bold text-[#171a30]"
                    >
                      {currentBlock.jobIds.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                      New Priority
                    </label>
                    <select
                      value={eventParams.newTier || 1}
                      onChange={(e) =>
                        onEventParamsChange({ ...eventParams, newTier: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-lg border border-[#e3e6f0] bg-white p-1 text-xs font-bold text-[#171a30]"
                    >
                      <option value={0}>Tier 0 (Emergency)</option>
                      <option value={1}>Tier 1 (Critical)</option>
                      <option value={2}>Tier 2 (Regular)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* STEP 3: RUN SIMULATION (3 cols) */}
      <div className="flex flex-col justify-between rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-xs lg:col-span-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2e3092] font-mono text-[11px] font-bold text-white">
              3
            </span>
            <h2 className="text-xs font-black uppercase tracking-wider text-[#171a30]">
              Run simulation
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#626982]">
            Recalculate the plan with the new condition
          </p>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              disabled={simulating}
              onClick={onRunSimulation}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2e3092] py-3 text-xs font-extrabold text-white shadow-md transition-all hover:bg-[#232573] active:scale-[0.99] disabled:opacity-60"
            >
              <Play size={14} fill="currentColor" />
              <span>{simulating ? "Replanning…" : "Run simulation"}</span>
            </button>

            <button
              type="button"
              onClick={onReset}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#e3e6f0] bg-white py-2 text-xs font-semibold text-[#626982] transition-colors hover:border-[#2e3092] hover:text-[#171a30]"
            >
              <RotateCcw size={12} />
              <span>Reset simulation</span>
            </button>
          </div>
        </div>

        <p className="mt-4 text-[10px] leading-relaxed text-[#878da1]">
          This will re-optimize the plan and show how jobs and blocks are affected.
        </p>
      </div>
    </div>
  );
}
