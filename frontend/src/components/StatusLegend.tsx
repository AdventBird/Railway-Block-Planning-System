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

// Inline horizontal legend — sits in the toolbar (spec: no floating overlays
// competing with the map).
function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {ROWS.map((row) => (
        <span key={row.key} className="inline-flex items-center gap-1.5" title={row.label}>
          <svg width="20" height="7" className="shrink-0">
            {row.highlight && (
              <line x1="1" y1="3.5" x2="19" y2="3.5" stroke={row.color} strokeWidth={6} strokeLinecap="round" opacity={0.25} />
            )}
            <line
              x1="1"
              y1="3.5"
              x2="19"
              y2="3.5"
              stroke={row.color}
              strokeWidth={row.highlight ? 2.5 : 3}
              strokeLinecap="round"
              strokeDasharray={row.dashed ? "6 4" : undefined}
              className={row.pulse ? "track-edge-pulse" : undefined}
            />
          </svg>
          <span className="whitespace-nowrap text-[10px] font-medium text-[#4d5468]">{row.label}</span>
        </span>
      ))}
    </div>
  );
}

export default StatusLegend;