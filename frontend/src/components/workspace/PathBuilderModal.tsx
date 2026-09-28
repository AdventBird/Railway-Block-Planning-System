import { useState } from "react";
import { X, Plus, Trash2, ArrowDown, MapPin, Check } from "lucide-react";
import { Button } from "../ui";
import { ALL_NETWORK_STATIONS, DEFAULT_CORRIDOR_PATH } from "../../data/horizonData";

interface PathBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string[];
  onSavePath: (newPath: string[]) => void;
}

export function PathBuilderModal({
  isOpen,
  onClose,
  currentPath,
  onSavePath,
}: PathBuilderModalProps) {
  const [stations, setStations] = useState<string[]>([...currentPath]);
  const [selectedToAdd, setSelectedToAdd] = useState<string>("");

  if (!isOpen) return null;

  const handleAddStation = () => {
    if (!selectedToAdd || stations.includes(selectedToAdd)) return;
    setStations([...stations, selectedToAdd]);
    setSelectedToAdd("");
  };

  const handleRemoveStation = (index: number) => {
    if (stations.length <= 2) return; // Keep at least 2 stations (origin & destination)
    setStations(stations.filter((_, i) => i !== index));
  };

  const handleReset = () => {
    setStations([...DEFAULT_CORRIDOR_PATH]);
  };

  const handleSave = () => {
    onSavePath(stations);
    onClose();
  };

  const availableStations = ALL_NETWORK_STATIONS.filter(
    (st) => !stations.includes(st.code)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171a30]/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[#e3e6f0] bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[#eef0f6] pb-3">
          <div>
            <h3 className="text-base font-extrabold text-[#171a30]">
              Corridor Route Builder
            </h3>
            <p className="text-xs text-[#878da1] mt-0.5">
              Customize the stations and track sections active in the planning workspace
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#878da1] hover:bg-[#f1f3f9] hover:text-[#171a30]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stations Sequence */}
        <div className="mt-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[#878da1]">
            Active Station Sequence ({stations.length} stations)
          </div>

          <div className="thin-scroll max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {stations.map((code, idx) => {
              const stationInfo = ALL_NETWORK_STATIONS.find((s) => s.code === code);
              const isOrigin = idx === 0;
              const isDest = idx === stations.length - 1;

              return (
                <div key={`${code}-${idx}`} className="flex flex-col">
                  <div className="flex items-center justify-between rounded-lg border border-[#e3e6f0] bg-[#fafbfd] px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <MapPin
                        size={14}
                        className={isOrigin || isDest ? "text-[#2e3092]" : "text-[#878da1]"}
                      />
                      <span className="font-mono font-bold text-[#171a30]">{code}</span>
                      <span className="text-[#4d5468]">{stationInfo?.name ?? code}</span>
                      {isOrigin && (
                        <span className="rounded bg-[#eef0fa] px-1.5 py-0.2 font-mono text-[9px] font-bold text-[#2e3092]">
                          Origin
                        </span>
                      )}
                      {isDest && (
                        <span className="rounded bg-[#f0fdf4] px-1.5 py-0.2 font-mono text-[9px] font-bold text-[#166534]">
                          Destination
                        </span>
                      )}
                    </div>

                    {!isOrigin && !isDest && (
                      <button
                        onClick={() => handleRemoveStation(idx)}
                        className="rounded p-1 text-[#878da1] hover:bg-[#fef2f2] hover:text-[#dc2626] transition-colors"
                        title="Remove intermediate station"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {idx < stations.length - 1 && (
                    <div className="my-0.5 flex justify-center text-[#c4c9e2]">
                      <ArrowDown size={12} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Add Station */}
        {availableStations.length > 0 && (
          <div className="mt-4 flex items-center gap-2 border-t border-[#eef0f6] pt-3">
            <select
              value={selectedToAdd}
              onChange={(e) => setSelectedToAdd(e.target.value)}
              className="flex-1 rounded-md border border-[#e3e6f0] bg-white px-3 py-1.5 text-xs text-[#171a30] focus:border-[#2e3092] focus:outline-none"
            >
              <option value="">-- Select station to add --</option>
              {availableStations.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.code} · {st.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleAddStation}
              disabled={!selectedToAdd}
              className="flex items-center gap-1 rounded-md bg-[#2e3092] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#24266f] disabled:opacity-50 transition-colors"
            >
              <Plus size={13} />
              <span>Add Station</span>
            </button>
          </div>
        )}

        {/* Modal Actions */}
        <div className="mt-5 flex items-center justify-between border-t border-[#eef0f6] pt-3">
          <button
            onClick={handleReset}
            className="text-xs font-bold text-[#878da1] hover:text-[#171a30] hover:underline"
          >
            Reset to Default Trunk
          </button>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} className="flex items-center gap-1">
              <Check size={13} />
              <span>Apply Route</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
