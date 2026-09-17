import type { TrackStatus } from "../types";
import { HIGHLIGHT_COLOR, STATUS_META } from "./statusStyles";

const LABEL_OVERRIDES: Partial<Record<TrackStatus, string>> = {
  occupied: "Occupied (train present)",
  blocked: "Blocked — active block",
  caution: "Caution — speed restriction",
};

interface LegendRow {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  pulse?: boolean;
  highlight?: boolean;
}

const ROWS: LegendRow[] = [
  ...(Object.keys(STATUS_META) as TrackStatus[]).map((key) => ({
    key,
    label: LABEL_OVERRIDES[key] ?? STATUS_META[key].label,
    color: STATUS_META[key].color,
    dashed: STATUS_META[key].dashed,
    pulse: STATUS_META[key].pulse,
  })),
  { key: "highlight", label: "Highlighted / selected", color: HIGHLIGHT_COLOR, highlight: true },
];

function StatusLegend() {
  return (
    <div className="pointer-events-auto rounded-xl border border-[#e3e6f0] bg-white/95 px-3.5 py-3 shadow-[0_8px_24px_rgba(23,26,48,0.12)] backdrop-blur-sm">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#878da1]">
        Track Status Legend
      </div>
      <div className="grid gap-1.5">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-center gap-2.5">
            <svg width="34" height="8" className="shrink-0">
              {row.highlight && (
                <line
                  x1="1"
                  y1="4"
                  x2="33"
                  y2="4"
                  stroke={row.color}
                  strokeWidth={7}
                  strokeLinecap="round"
                  opacity={0.25}
                />
              )}
              <line
                x1="1"
                y1="4"
                x2="33"
                y2="4"
                stroke={row.color}
                strokeWidth={row.highlight ? 2.5 : 3}
                strokeLinecap="round"
                strokeDasharray={row.dashed ? "6 4" : undefined}
                className={row.pulse ? "track-edge-pulse" : undefined}
              />
            </svg>
            <span className="whitespace-nowrap text-[11px] font-medium text-[#4d5468]">
              {row.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default StatusLegend;