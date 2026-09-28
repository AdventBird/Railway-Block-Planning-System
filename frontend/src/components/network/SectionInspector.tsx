import { useMemo } from "react";
import type { CanonicalSection, CanonicalTrack } from "../../data/networkData";

export interface SectionInspectorProps {
  section: CanonicalSection | null;
  activeTrackId: string | null;
  activeTab: "overview" | "up" | "down" | "single";
  onTabChange: (tab: "overview" | "up" | "down" | "single") => void;
  onSelectTrack: (trackId: string, direction: "UP" | "DOWN" | "BOTH") => void;
  onClose: () => void;
  onShowPlanningImpact?: (blockId: string, date?: string, sectionId?: string, trackId?: string) => void;
}

const STATUS_DETAILS: Record<string, { label: string; color: string; desc: string }> = {
  clear: {
    label: "Clear",
    color: "#16a34a",
    desc: "Normal operations available. Full line capacity.",
  },
  occupied: {
    label: "Occupied",
    color: "#2563eb",
    desc: "Train present in section block.",
  },
  blocked: {
    label: "Blocked",
    color: "#dc2626",
    desc: "Section blocked for heavy engineering possession.",
  },
  maintenance: {
    label: "Maintenance",
    color: "#d97706",
    desc: "Planned maintenance work scheduled.",
  },
  caution: {
    label: "Caution Order",
    color: "#f59e0b",
    desc: "Speed restriction in force over designated KM.",
  },
};

export default function SectionInspector({
  section,
  activeTrackId,
  activeTab,
  onTabChange,
  onSelectTrack,
  onClose,
  onShowPlanningImpact,
}: SectionInspectorProps) {
  if (!section) return null;

  const isDouble = section.lineType === "DOUBLE";
  const upTrack = section.tracks.find((t) => t.direction === "UP") || section.tracks[0];
  const dnTrack = section.tracks.find((t) => t.direction === "DOWN") || section.tracks[1];
  const singleTrack = section.tracks[0];

  // Selected track based on tab
  const currentTrack: CanonicalTrack = useMemo(() => {
    if (!isDouble) return singleTrack;
    if (activeTab === "up") return upTrack;
    if (activeTab === "down") return dnTrack;
    // Overview defaults to the currently selected track or UP
    return section.tracks.find((t) => t.id === activeTrackId) || upTrack;
  }, [isDouble, activeTab, upTrack, dnTrack, singleTrack, section.tracks, activeTrackId]);

  const activeStatus = STATUS_DETAILS[currentTrack?.status ?? "clear"];
  const upStatus = STATUS_DETAILS[upTrack?.status ?? "clear"];
  const dnStatus = STATUS_DETAILS[dnTrack?.status ?? "clear"];

  const handleTrackTab = (tab: "up" | "down" | "single") => {
    onTabChange(tab);
    if (tab === "up" && upTrack) onSelectTrack(upTrack.id, "UP");
    else if (tab === "down" && dnTrack) onSelectTrack(dnTrack.id, "DOWN");
    else if (tab === "single" && singleTrack) onSelectTrack(singleTrack.id, "BOTH");
  };

  const currentBlock = currentTrack.plannedBlock;

  return (
    <aside className="thin-scroll flex h-full w-[350px] shrink-0 flex-col border-l border-[#e3e6f0] bg-white text-[#171a30] shadow-xl">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[#eef0f6] px-5 py-4">
        <div>
          <h2 className="font-mono text-lg font-black tracking-wide text-[#171a30]">
            {section.name}
          </h2>
          <p className="mt-0.5 text-xs text-[#626982]">
            Section · {section.distanceKm} km · {isDouble ? "Double line" : "Single line"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-[#878da1] transition-colors hover:bg-[#f1f3f9] hover:text-[#171a30]"
          title="Close Inspector"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#eef0f6] px-4 pt-1">
        <button
          type="button"
          onClick={() => onTabChange("overview")}
          className={`border-b-2 px-3 py-2 text-xs font-bold transition-colors ${
            activeTab === "overview"
              ? "border-[#2e3092] text-[#2e3092]"
              : "border-transparent text-[#626982] hover:text-[#171a30]"
          }`}
        >
          Overview
        </button>
        {isDouble ? (
          <>
            <button
              type="button"
              onClick={() => handleTrackTab("up")}
              className={`border-b-2 px-3 py-2 text-xs font-bold transition-colors ${
                activeTab === "up"
                  ? "border-[#2e3092] text-[#2e3092]"
                  : "border-transparent text-[#626982] hover:text-[#171a30]"
              }`}
            >
              UP Track
            </button>
            <button
              type="button"
              onClick={() => handleTrackTab("down")}
              className={`border-b-2 px-3 py-2 text-xs font-bold transition-colors ${
                activeTab === "down"
                  ? "border-[#2e3092] text-[#2e3092]"
                  : "border-transparent text-[#626982] hover:text-[#171a30]"
              }`}
            >
              DOWN Track
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => handleTrackTab("single")}
            className={`border-b-2 px-3 py-2 text-xs font-bold transition-colors ${
              activeTab === "single"
                ? "border-[#2e3092] text-[#2e3092]"
                : "border-transparent text-[#626982] hover:text-[#171a30]"
            }`}
          >
            Track (Single)
          </button>
        )}
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {activeTab === "overview" ? (
          /* OVERVIEW TAB */
          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                Tracks in Section
              </div>
              <div className="mt-2 space-y-2">
                {isDouble ? (
                  <>
                    {/* UP TRACK CARD */}
                    <div
                      onClick={() => handleTrackTab("up")}
                      className="cursor-pointer rounded-xl border border-[#e3e6f0] p-3 transition-colors hover:border-[#2e3092] hover:bg-[#fbfbfe]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-[#171a30]">UP TRACK</span>
                        <span
                          className="flex items-center gap-1.5 text-xs font-bold"
                          style={{ color: upStatus.color }}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: upStatus.color }} />
                          {upStatus.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#626982]">{upStatus.desc}</p>
                      {upTrack.plannedBlock && (
                        <div className="mt-2 flex items-center justify-between rounded bg-[#fffbeb] px-2 py-1 text-[10px] font-bold text-[#b45309]">
                          <span>Planned Block {upTrack.plannedBlock.blockId}</span>
                          <span>{upTrack.plannedBlock.startTime} – {upTrack.plannedBlock.endTime}</span>
                        </div>
                      )}
                    </div>

                    {/* DOWN TRACK CARD */}
                    <div
                      onClick={() => handleTrackTab("down")}
                      className="cursor-pointer rounded-xl border border-[#e3e6f0] p-3 transition-colors hover:border-[#2e3092] hover:bg-[#fbfbfe]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-[#171a30]">DOWN TRACK</span>
                        <span
                          className="flex items-center gap-1.5 text-xs font-bold"
                          style={{ color: dnStatus.color }}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: dnStatus.color }} />
                          {dnStatus.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#626982]">{dnStatus.desc}</p>
                      {dnTrack.plannedBlock && (
                        <div className="mt-2 flex items-center justify-between rounded bg-[#fffbeb] px-2 py-1 text-[10px] font-bold text-[#b45309]">
                          <span>Planned Block {dnTrack.plannedBlock.blockId}</span>
                          <span>{dnTrack.plannedBlock.startTime} – {dnTrack.plannedBlock.endTime}</span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  /* SINGLE TRACK CARD */
                  <div
                    onClick={() => handleTrackTab("single")}
                    className="cursor-pointer rounded-xl border border-[#e3e6f0] p-3 transition-colors hover:border-[#2e3092] hover:bg-[#fbfbfe]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-[#171a30]">SINGLE LINE (BIDIRECTIONAL)</span>
                      <span
                        className="flex items-center gap-1.5 text-xs font-bold"
                        style={{ color: activeStatus.color }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: activeStatus.color }} />
                        {activeStatus.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#626982]">{activeStatus.desc}</p>
                    {singleTrack.plannedBlock && (
                      <div className="mt-2 flex items-center justify-between rounded bg-[#fffbeb] px-2 py-1 text-[10px] font-bold text-[#b45309]">
                        <span>Planned Block {singleTrack.plannedBlock.blockId}</span>
                        <span>{singleTrack.plannedBlock.startTime} – {singleTrack.plannedBlock.endTime}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Section Specifications */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                Infrastructure Specifications
              </div>
              <div className="mt-2 divide-y divide-[#f1f3f9] rounded-xl border border-[#e3e6f0] bg-[#fafbfe] px-3 text-xs">
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#626982]">Length</span>
                  <span className="font-mono font-bold text-[#171a30]">{section.distanceKm} km</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#626982]">Line Type</span>
                  <span className="font-bold text-[#171a30]">{isDouble ? "Double Line" : "Single Line"}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#626982]">Electrification</span>
                  <span className="font-bold text-[#171a30]">{section.electrification}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#626982]">Permissible Speed</span>
                  <span className="font-mono font-bold text-[#171a30]">{section.speedLimitKmH} km/h</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#626982]">Signaling Standard</span>
                  <span className="font-bold text-[#171a30]">Absolute Block (Automatic)</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* TRACK TAB (UP / DOWN / SINGLE) */
          <div className="space-y-4">
            {/* Status Banner */}
            <div
              className="rounded-xl border p-3.5"
              style={{
                borderColor: `${activeStatus.color}40`,
                background: `${activeStatus.color}08`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: activeStatus.color }} />
                <span className="font-mono text-xs font-black uppercase tracking-wider" style={{ color: activeStatus.color }}>
                  {currentTrack.direction} Track · {activeStatus.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#4d5468]">{activeStatus.desc}</p>
            </div>

            {/* Track Details */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                Track Details
              </div>
              <div className="mt-2 divide-y divide-[#f1f3f9] rounded-xl border border-[#e3e6f0] bg-[#fafbfe] px-3 text-xs">
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#626982]">Direction</span>
                  <span className="font-mono font-bold text-[#171a30]">
                    {currentTrack.direction === "UP"
                      ? `${section.fromStationId} → ${section.toStationId}`
                      : currentTrack.direction === "DOWN"
                      ? `${section.toStationId} → ${section.fromStationId}`
                      : "Bidirectional"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#626982]">Line type</span>
                  <span className="font-bold text-[#171a30]">
                    {currentTrack.lineType === "DOUBLE" ? "Double line" : "Single line"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#626982]">Length</span>
                  <span className="font-mono font-bold text-[#171a30]">{section.distanceKm} km</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#626982]">Electrification</span>
                  <span className="font-bold text-[#171a30]">{currentTrack.electrification}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#626982]">Track status</span>
                  <span className="flex items-center gap-1.5 font-bold" style={{ color: activeStatus.color }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: activeStatus.color }} />
                    {activeStatus.label}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#626982]">Last updated</span>
                  <span className="font-mono text-[11px] text-[#626982]">{currentTrack.lastUpdated}</span>
                </div>
              </div>
            </div>

            {/* Future Planning / Planned Maintenance Block */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                Future Planning
              </div>
              <div className="mt-2">
                {currentBlock ? (
                  <div className="rounded-xl border border-[#d97706]/40 bg-[#fffdf8] p-3.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#d97706] px-2 py-0.5 font-mono text-xs font-black text-white">
                          {currentBlock.blockId}
                        </span>
                        <span className="text-xs font-bold text-[#171a30]">
                          Planned Block
                        </span>
                      </div>
                      <span className="rounded-full bg-[#16a34a]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#166534]">
                        {currentBlock.approvalStatus}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-white p-2 border border-[#eef0f6]">
                        <div className="text-[9px] font-bold uppercase text-[#878da1]">Date</div>
                        <div className="font-mono font-bold text-[#171a30]">{currentBlock.date}</div>
                      </div>
                      <div className="rounded-lg bg-white p-2 border border-[#eef0f6]">
                        <div className="text-[9px] font-bold uppercase text-[#878da1]">Time Window</div>
                        <div className="font-mono font-bold text-[#171a30]">{currentBlock.startTime} – {currentBlock.endTime}</div>
                      </div>
                      <div className="rounded-lg bg-white p-2 border border-[#eef0f6]">
                        <div className="text-[9px] font-bold uppercase text-[#878da1]">Jobs Included</div>
                        <div className="font-bold text-[#171a30]">{currentBlock.jobsCount} maintenance jobs</div>
                      </div>
                      <div className="rounded-lg bg-white p-2 border border-[#eef0f6]">
                        <div className="text-[9px] font-bold uppercase text-[#878da1]">Expected Delay</div>
                        <div className="font-bold text-[#b45309]">{currentBlock.expectedImpact}</div>
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] text-[#4d5468]">
                      <span className="font-semibold text-[#171a30]">Scope:</span> {currentBlock.reason}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-[#e3e6f0] bg-[#fafbfe] p-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#16a34a]/10 text-[#16a34a]">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#171a30]">No planned maintenance block</div>
                      <div className="mt-0.5 text-[11px] text-[#626982]">
                        This track is available in the current plan.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Planned Train Movements */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                <span>Planned Train Movements ({currentTrack.plannedMovements?.length ?? 0})</span>
                <span className="cursor-pointer text-[#2e3092] hover:underline">View all</span>
              </div>
              <div className="mt-2 space-y-2">
                {currentTrack.plannedMovements && currentTrack.plannedMovements.length > 0 ? (
                  currentTrack.plannedMovements.map((tr) => (
                    <div
                      key={tr.trainNumber}
                      className="flex items-center justify-between rounded-xl border border-[#e3e6f0] bg-white p-2.5 shadow-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2e3092]/10 text-[#2e3092]">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <rect x="4" y="3" width="16" height="16" rx="2" />
                            <path d="M4 11h16M12 3v8M8 19l-2 3M16 19l2 3" />
                          </svg>
                        </div>
                        <div>
                          <div className="font-mono text-xs font-extrabold text-[#171a30]">
                            {tr.trainNumber} <span className="text-[11px] font-semibold text-[#626982]">{tr.trainName}</span>
                          </div>
                          <div className="text-[10px] text-[#878da1]">{tr.direction}</div>
                        </div>
                      </div>
                      <div className="font-mono text-xs font-bold text-[#171a30]">
                        {tr.timeWindow}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-[#e3e6f0] p-3 text-center text-xs text-[#878da1]">
                    No conflicting train movements in immediate block window.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Primary CTA Bottom Bar */}
      <div className="border-t border-[#eef0f6] bg-[#fafbfe] p-4">
        <button
          type="button"
          onClick={() => {
            const blockIdToOpen = currentBlock?.blockId ?? "W1";
            onShowPlanningImpact?.(
              blockIdToOpen,
              currentBlock?.date,
              section.id,
              currentTrack.id
            );
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2e3092] py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#232573] active:scale-[0.99]"
        >
          <span>View in Planning Workspace</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
