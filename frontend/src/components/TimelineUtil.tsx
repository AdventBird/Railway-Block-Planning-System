// ---------------------------------------------------------------------------
// Utilization bar — shared by the workspace, week/month views and simulation.
// ---------------------------------------------------------------------------
export function UtilBar({ pct, tone = "#16a34a" }: { pct: number; tone?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eef0f6]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, pct)}%`, background: tone }}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-[10px] font-bold text-[#4d5468]">{pct}%</span>
    </div>
  );
}