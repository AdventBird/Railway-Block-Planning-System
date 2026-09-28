import { ArrowRight, Clock } from "lucide-react";
import type { SimulationComputationResult } from "../../data/simulationData";

interface BeforeEventAfterProps {
  result: SimulationComputationResult;
}

export default function BeforeEventAfter({ result }: BeforeEventAfterProps) {
  const { before, event, after } = result;

  return (
    <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-11">
      {/* 1. BEFORE CARD */}
      <div className="rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-xs lg:col-span-3">
        <div className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-[#878da1]">
          BEFORE (Current {before.planVersion})
        </div>
        <div className="mt-2 text-base font-black text-[#171a30]">
          {before.blockLabel}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[#626982]">
          <Clock size={13} className="text-[#878da1]" />
          <span className="font-mono font-medium text-[#171a30]">{before.timeRange}</span>
          <span>({before.duration})</span>
        </div>
        <div className="mt-1 text-xs font-semibold text-[#16a34a]">
          {before.jobsCount} jobs scheduled
        </div>
      </div>

      {/* ARROW 1 */}
      <div className="hidden justify-center text-[#a2a7ba] lg:flex lg:col-span-1">
        <ArrowRight size={20} />
      </div>

      {/* 2. EVENT CARD (Warm Highlighted Container) */}
      <div className="rounded-2xl border border-[#f59e0b]/40 bg-[#fffbeb] p-5 shadow-xs lg:col-span-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-[#b45309]">
            EVENT (Simulated change)
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-base font-black text-[#92400e]">
          <span>{event.typeTitle}</span>
        </div>
        <div className="mt-2 text-xs font-bold text-[#b45309]">
          {event.corridor} · <span className="font-mono">{event.track}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-[#92400e]">
          <span className="font-mono font-bold">{event.timeRange}</span>
          <span>({event.duration})</span>
        </div>
      </div>

      {/* ARROW 2 */}
      <div className="hidden justify-center text-[#a2a7ba] lg:flex lg:col-span-1">
        <ArrowRight size={20} />
      </div>

      {/* 3. AFTER CARD */}
      <div className="rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-xs lg:col-span-3">
        <div className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-[#2e3092]">
          AFTER ({after.planVersion})
        </div>
        <div className="mt-2 text-base font-black text-[#171a30]">
          {after.blockLabel}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[#626982]">
          <Clock size={13} className="text-[#878da1]" />
          <span className="font-mono font-medium text-[#171a30]">{after.timeRange}</span>
          <span>({after.duration})</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs font-semibold">
          <span className="text-[#16a34a]">{after.scheduledCount} jobs scheduled</span>
          {after.deferredCount > 0 && (
            <span className="text-[#dc2626]">· {after.deferredCount} job deferred</span>
          )}
        </div>
      </div>
    </div>
  );
}
