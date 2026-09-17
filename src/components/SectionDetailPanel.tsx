// ---------------------------------------------------------------------------
// Section detail panel — Network Schematic click-through (§8).
// DEFAULT: section + status only. CLICKED: active block, affected trains,
// next window, then expandable ▼ Maintenance / Compatibility / Train impact /
// Resources / History.
// ---------------------------------------------------------------------------
import type { ReactNode } from "react";
import type { Station, TrackSection } from "../types";
import { APPROVAL_META, DEPARTMENT_META, FALLBACK_META, STATUS_META } from "./statusStyles";
import { Collapse } from "./ui";
import { sectionOps } from "../data/mockRailwayData";

interface NetworkSummary {
  total: number;
  clear: number;
  occupied: number;
  blocked: number;
  maintenance: number;
  caution: number;
}

interface SectionDetailPanelProps {
  section: TrackSection | null;
  stationsById: Record<string, Station>;
  summary: NetworkSummary;
  /** Sections with an active block request (blocked / maintenance). */
  activeBlocks: TrackSection[];
  onSelect: (sectionId: string) => void;
  onClose: () => void;
}

function StatusChip({ status }: { status: TrackSection["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
      style={{
        color: meta.color,
        background: `${meta.color}14`,
        border: `1px solid ${meta.color}55`,
      }}
    >
      <span className="relative flex h-2 w-2">
        {meta.pulse && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: meta.color }} />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: meta.color }} />
      </span>
      {meta.label}
    </span>
  );
}

function DeptChip({ dept }: { dept: string }) {
  const meta = DEPARTMENT_META[dept] ?? { ...FALLBACK_META, label: dept };
  return (
    <span
      className="whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: meta.color, background: meta.bg, border: "1px solid #e3e6f0" }}
    >
      {meta.label}
    </span>
  );
}

function ApprovalChip({ status }: { status: string }) {
  const meta = APPROVAL_META[status] ?? { ...FALLBACK_META, label: status };
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-bold"
      style={{ color: meta.color, background: meta.bg }}
    >
      {status === "pending" && <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: meta.color }} />}
      {meta.label}
    </span>
  );
}

function Endpoint({ station, role }: { station?: Station; role: "FROM" | "TO" }) {
  if (!station) return null;
  return (
    <div className="min-w-0 flex-1">
      <div className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">{role}</div>
      <div className="truncate font-mono text-xs font-bold text-[#171a30]">{station.code}</div>
    </div>
  );
}

function Tile({ label, value, tone = "#171a30" }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-[#e3e6f0] bg-white px-2.5 py-2">
      <div className="truncate text-[9px] font-bold uppercase tracking-wider text-[#878da1]">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[11px] font-bold" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  summary,
  activeBlocks,
  onSelect,
}: {
  summary: NetworkSummary;
  activeBlocks: TrackSection[];
  onSelect: (sectionId: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-4">
      <div>
        <div className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">Network summary</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-[#4d5468]">
          <span>{summary.total} sections</span>
          <span className="text-[#16a34a]">{summary.clear} clear</span>
          <span className="text-[#2e3092]">{summary.occupied} occupied</span>
          <span className="text-[#dc2626]">{summary.blocked} blocked</span>
          <span className="text-[#d97706]">{summary.maintenance} maintenance</span>
        </div>
      </div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
        Sections with active blocks — click to inspect
      </div>
      <div className="space-y-1.5">
        {activeBlocks.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="focus-primary flex w-full items-center justify-between gap-2 rounded-lg border border-[#e3e6f0] px-3 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
          >
            <span className="min-w-0 truncate text-[11px] font-bold text-[#171a30]">{s.name}</span>
            <StatusChip status={s.status} />
          </button>
        ))}
      </div>
      <p className="mt-auto text-[10px] text-[#a2a7ba]">Select any section on the diagram for details.</p>
    </div>
  );
}

function SectionDetailPanel({ section, stationsById, summary, activeBlocks, onSelect, onClose }: SectionDetailPanelProps) {
  if (!section) {
    return <EmptyState summary={summary} activeBlocks={activeBlocks} onSelect={onSelect} />;
  }

  const block = section.currentBlock;
  const ops = sectionOps[section.id];

  return (
    <div className="thin-scroll flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {/* Header — endpoints + identity */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-sm font-bold text-[#171a30]" title={section.name}>
            {section.name}
          </h3>
          <button
            onClick={onClose}
            className="focus-primary shrink-0 rounded-md border border-[#e3e6f0] px-2 py-0.5 text-[10px] font-bold text-[#878da1] transition-colors duration-200 hover:text-[#171a30]"
          >
            Back
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Endpoint station={stationsById[section.fromStationId]} role="FROM" />
          <svg
            width="16"
            height="10"
            viewBox="0 0 16 10"
            className="shrink-0"
            fill="none"
            stroke="#878da1"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 5h13M10 1l4 4-4 4" />
          </svg>
          <Endpoint station={stationsById[section.toStationId]} role="TO" />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[#878da1]">
          <span className="rounded bg-[#f1f3f9] px-1.5 py-0.5">{section.id}</span>
          {section.line && (
            <span className="rounded bg-[#f1f3f9] px-1.5 py-0.5">
              {section.line === "DOWN" ? "DOWN LINE" : `${section.line} LINE`}
            </span>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between rounded-lg border border-[#e3e6f0] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#878da1]">Status</span>
        <StatusChip status={section.status} />
      </div>

      {/* At-a-glance tiles */}
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Active block" value={block ? block.blockId : "—"} tone={block ? "#d97706" : "#a2a7ba"} />
        <Tile label="Next window" value={ops?.nextWindow ?? "—"} />
        <Tile
          label="Trains affected"
          value={ops ? String(ops.trainImpact) : "—"}
          tone={ops && ops.trainImpact > 0 ? "#d97706" : "#16a34a"}
        />
      </div>

      {/* Progressive disclosure — details on demand */}
      <div className="space-y-2">
        {block ? (
          <Collapse title="Maintenance">
            <p className="leading-relaxed">{block.reason}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-[#878da1]">
                {block.startTime}–{block.endTime} IST
              </span>
              <DeptChip dept={block.requestedBy} />
              <ApprovalChip status={block.approvalStatus} />
            </div>
          </Collapse>
        ) : (
          <div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-[11px] leading-relaxed text-[#166534]">
            No block in force on this section.
            {section.status === "caution" && " Caution order in effect — restricted speed."}
            {section.status === "occupied" && " A train is currently on the section."}
          </div>
        )}
        {ops?.compat && <Collapse title="Compatibility">{ops.compat}</Collapse>}
        {ops && (
          <Collapse title="Train impact">
            {ops.trainImpact > 0 ? (
              <p className="leading-relaxed">
                {ops.trainImpact} movement{ops.trainImpact > 1 ? "s" : ""} affected.
                {ops.trainNote ? ` ${ops.trainNote}` : ""}
              </p>
            ) : (
              <p>No movements affected.</p>
            )}
          </Collapse>
        )}
        {ops?.resources && <Collapse title="Resources">{ops.resources}</Collapse>}
        {ops?.history && <Collapse title="History">{ops.history}</Collapse>}
      </div>

      <p className="mt-auto text-[10px] text-[#a2a7ba]">Simulated telemetry — swap the mock feed for the live block registry later.</p>
    </div>
  );
}

export default SectionDetailPanel;