import { useState } from "react";
import {
  CANONICAL_STATIONS,
  CANONICAL_STATIONS_BY_ID,
  getValidIntermediateStations,
  findShortestPath,
} from "../../data/networkData";

export interface PathControlsProps {
  selectedPath: string[];
  onPathChange: (newPath: string[]) => void;
  onSelectStation: (stationId: string) => void;
  onFitView: () => void;
}

export default function PathControls({
  selectedPath,
  onPathChange,
  onSelectStation,
  onFitView,
}: PathControlsProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [addBetweenIndex, setAddBetweenIndex] = useState<number>(1);
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const originId = selectedPath[0] ?? "";
  const destinationId = selectedPath[selectedPath.length - 1] ?? "";

  // Handle changing Origin station
  const handleOriginChange = (newOrigin: string) => {
    if (!newOrigin) return;
    if (newOrigin === destinationId) return;
    const path = findShortestPath(newOrigin, destinationId || "PRYJ");
    if (path) onPathChange(path);
    else onPathChange([newOrigin]);
  };

  // Handle changing Destination station
  const handleDestinationChange = (newDest: string) => {
    if (!newDest) return;
    if (newDest === originId) return;
    const path = findShortestPath(originId || "NDLS", newDest);
    if (path) onPathChange(path);
    else onPathChange([originId || "NDLS", newDest]);
  };

  // Swap Origin and Destination
  const handleSwap = () => {
    if (selectedPath.length < 2) return;
    const reversed = [...selectedPath].reverse();
    onPathChange(reversed);
  };

  // Reverse path
  const handleReverse = () => {
    if (selectedPath.length < 2) return;
    onPathChange([...selectedPath].reverse());
  };

  // Clear path
  const handleClear = () => {
    onPathChange([]);
  };

  // Restore default path if cleared
  const handleRestoreDefault = () => {
    onPathChange(["NDLS", "GZB", "ALJN", "TDL", "CNB", "PRYJ"]);
  };

  // Available intermediate stations for the selected insertion segment
  const currentStnA = selectedPath[addBetweenIndex - 1];
  const currentStnB = selectedPath[addBetweenIndex];
  const availableIntermediate =
    currentStnA && currentStnB ? getValidIntermediateStations(currentStnA, currentStnB) : [];

  const handleInsertStation = (stationId: string) => {
    const updated = [...selectedPath];
    updated.splice(addBetweenIndex, 0, stationId);
    onPathChange(updated);
    setShowAddModal(false);
  };

  const handleRemoveStation = (stationId: string) => {
    const updated = selectedPath.filter((id) => id !== stationId);
    onPathChange(updated);
    setShowRemoveModal(false);
  };

  const pathTitle =
    selectedPath.length >= 2
      ? `${selectedPath[0]} → ${selectedPath[selectedPath.length - 1]}`
      : "No Path Selected";

  return (
    <div className="border-b border-[#e3e6f0] bg-white px-5 py-3.5">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black tracking-tight text-[#171a30]">Network</h1>
            <div className="hidden rounded-full border border-[#2e3092]/30 bg-[#2e3092]/5 px-2.5 py-0.5 font-mono text-[10px] font-bold text-[#2e3092] sm:inline-flex items-center gap-1.5">
              <span>{pathTitle}</span>
              <span className="text-[#16a34a] font-semibold">(Active Corridor)</span>
            </div>
          </div>
          <p className="text-xs text-[#626982]">
            Railway infrastructure, corridor selection and path configuration
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFitView}
            className="flex items-center gap-1.5 rounded-lg border border-[#e3e6f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#4d5468] transition-colors hover:border-[#2e3092] hover:text-[#171a30]"
            title="Reset and fit canvas view"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
            <span>Fit View</span>
          </button>
        </div>
      </div>

      {/* Path Builder & Edit Row */}
      <div className="flex flex-wrap items-center gap-3 border-t border-[#eef0f6] pt-3">
        {/* Origin dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] font-extrabold uppercase tracking-wider text-[#878da1]">
            From
          </span>
          <select
            value={originId}
            onChange={(e) => handleOriginChange(e.target.value)}
            className="h-8 rounded-lg border border-[#e3e6f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#171a30] transition-colors hover:border-[#2e3092] focus:border-[#2e3092] focus:outline-none"
          >
            {CANONICAL_STATIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} – {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Swap button */}
        <button
          type="button"
          onClick={handleSwap}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e3e6f0] bg-white text-[#626982] transition-colors hover:border-[#2e3092] hover:text-[#171a30]"
          title="Swap origin and destination"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>

        {/* Destination dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] font-extrabold uppercase tracking-wider text-[#878da1]">
            To
          </span>
          <select
            value={destinationId}
            onChange={(e) => handleDestinationChange(e.target.value)}
            className="h-8 rounded-lg border border-[#e3e6f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#171a30] transition-colors hover:border-[#2e3092] focus:border-[#2e3092] focus:outline-none"
          >
            {CANONICAL_STATIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} – {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Path Spine Breadcrumb */}
        {selectedPath.length > 0 ? (
          <div className="thin-scroll flex max-w-xl items-center gap-1.5 overflow-x-auto rounded-xl border border-[#e3e6f0] bg-[#fafbfe] px-3 py-1 text-xs font-semibold">
            {selectedPath.map((stnId, index) => {
              const stn = CANONICAL_STATIONS_BY_ID[stnId];
              return (
                <div key={stnId} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectStation(stnId)}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-[#171a30] transition-colors hover:bg-[#2e3092]/10 hover:text-[#2e3092]"
                    title={`Click to inspect ${stn?.name ?? stnId}`}
                  >
                    <span className="h-2 w-2 rounded-full bg-[#2e3092]" />
                    <span className="font-mono">{stn?.code ?? stnId}</span>
                  </button>
                  {index < selectedPath.length - 1 && (
                    <span className="text-[#a2a7ba] font-mono">───</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#d9ddef] bg-[#f8f9fd] px-3 py-1 text-xs text-[#878da1]">
            <span>No corridor path selected.</span>
            <button
              type="button"
              onClick={handleRestoreDefault}
              className="font-bold text-[#2e3092] hover:underline"
            >
              Load NDLS–PRYJ Corridor
            </button>
          </div>
        )}

        {/* Path Action Buttons */}
        <div className="ml-auto flex items-center gap-2">
          {/* Add Station */}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 rounded-lg border border-[#2e3092]/40 bg-[#2e3092]/5 px-2.5 py-1.5 text-xs font-bold text-[#2e3092] transition-colors hover:bg-[#2e3092]/10"
            title="Insert intermediate station"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Add Station</span>
          </button>

          {/* Remove Station */}
          {selectedPath.length > 2 && (
            <button
              type="button"
              onClick={() => setShowRemoveModal(true)}
              className="flex items-center gap-1 rounded-lg border border-[#e3e6f0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#4d5468] transition-colors hover:border-[#dc2626] hover:text-[#dc2626]"
              title="Remove station from path"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Remove</span>
            </button>
          )}

          {/* Reverse */}
          <button
            type="button"
            onClick={handleReverse}
            className="flex items-center gap-1 rounded-lg border border-[#e3e6f0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#4d5468] transition-colors hover:border-[#2e3092] hover:text-[#171a30]"
            title="Reverse corridor direction"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 12h16m-7-7l7 7-7 7" />
            </svg>
            <span>Reverse</span>
          </button>

          {/* Clear Path */}
          {selectedPath.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-[#e3e6f0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#dc2626] transition-colors hover:border-[#dc2626]/40 hover:bg-[#fef2f2]"
              title="Clear corridor selection"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* MODAL: ADD INTERMEDIATE STATION */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#eef0f6] pb-3">
              <h3 className="font-mono text-sm font-extrabold text-[#171a30]">
                Add Intermediate Station
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-[#878da1] hover:bg-[#f1f3f9] hover:text-[#171a30]"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                  Insert Between Section
                </label>
                <select
                  value={addBetweenIndex}
                  onChange={(e) => setAddBetweenIndex(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[#e3e6f0] p-2 text-xs font-semibold text-[#171a30]"
                >
                  {selectedPath.slice(0, -1).map((stnId, idx) => (
                    <option key={stnId} value={idx + 1}>
                      Between {stnId} and {selectedPath[idx + 1]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                  Available Valid Intermediate Stations
                </div>
                {availableIntermediate.length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {availableIntermediate.map((stnId) => {
                      const stn = CANONICAL_STATIONS_BY_ID[stnId];
                      return (
                        <div
                          key={stnId}
                          className="flex items-center justify-between rounded-xl border border-[#e3e6f0] bg-[#fafbfe] p-2.5"
                        >
                          <div>
                            <span className="font-mono font-bold text-[#171a30]">{stn?.code}</span>
                            <span className="ml-2 text-xs text-[#626982]">{stn?.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleInsertStation(stnId)}
                            className="rounded-lg bg-[#2e3092] px-3 py-1 text-xs font-bold text-white hover:bg-[#232573]"
                          >
                            + Insert
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-2 rounded-xl border border-dashed border-[#e3e6f0] p-3 text-xs text-[#878da1]">
                    No intermediate stations exist directly between {currentStnA} and {currentStnB}.
                    Try selecting another section.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-[#e3e6f0] px-4 py-1.5 text-xs font-semibold text-[#4d5468] hover:bg-[#f1f3f9]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REMOVE STATION */}
      {showRemoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#eef0f6] pb-3">
              <h3 className="font-mono text-sm font-extrabold text-[#171a30]">
                Remove Station from Corridor
              </h3>
              <button
                type="button"
                onClick={() => setShowRemoveModal(false)}
                className="rounded-lg p-1 text-[#878da1] hover:bg-[#f1f3f9] hover:text-[#171a30]"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-xs text-[#626982]">
                Select an intermediate station to remove. The network will reconnect adjacent valid routes.
              </div>
              <div className="mt-2 space-y-1.5">
                {selectedPath.slice(1, -1).map((stnId) => {
                  const stn = CANONICAL_STATIONS_BY_ID[stnId];
                  return (
                    <div
                      key={stnId}
                      className="flex items-center justify-between rounded-xl border border-[#e3e6f0] bg-[#fafbfe] p-2.5"
                    >
                      <div>
                        <span className="font-mono font-bold text-[#171a30]">{stn?.code}</span>
                        <span className="ml-2 text-xs text-[#626982]">{stn?.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveStation(stnId)}
                        className="rounded-lg bg-[#dc2626] px-3 py-1 text-xs font-bold text-white hover:bg-[#b91c1c]"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRemoveModal(false)}
                className="rounded-lg border border-[#e3e6f0] px-4 py-1.5 text-xs font-semibold text-[#4d5468] hover:bg-[#f1f3f9]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
