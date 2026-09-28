import { ChevronRight, HelpCircle } from "lucide-react";
import type { AlternativeOption, WhatChangedItem } from "../../data/simulationData";

interface ThreeColumnAnalysisProps {
  whatChanged: WhatChangedItem[];
  why: {
    reasonCode: string;
    explanation: string;
    bullets: string[];
  };
  alternatives: AlternativeOption[];
  onSelectAlternative?: (option: AlternativeOption) => void;
}

export default function ThreeColumnAnalysis({
  whatChanged,
  why,
  alternatives,
  onSelectAlternative,
}: ThreeColumnAnalysisProps) {
  const getBadgeStyle = (tone: WhatChangedItem["badgeTone"]) => {
    switch (tone) {
      case "green":
        return "bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]";
      case "blue":
        return "bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]";
      case "amber":
        return "bg-[#fffbeb] text-[#b45309] border-[#fde68a]";
      case "red":
        return "bg-[#fef2f2] text-[#991b1b] border-[#fecaca]";
    }
  };

  const getOptionBadgeStyle = (tone: AlternativeOption["tone"]) => {
    switch (tone) {
      case "green":
        return "border-[#16a34a] text-[#16a34a] bg-[#f0fdf4]";
      case "blue":
        return "border-[#2563eb] text-[#2563eb] bg-[#eff6ff]";
      case "amber":
        return "border-[#d97706] text-[#d97706] bg-[#fffbeb]";
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* 1. WHAT CHANGED? (JOBS) */}
      <div className="flex flex-col rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#eef0f6] pb-3">
          <h3 className="text-sm font-black tracking-tight text-[#171a30]">
            What changed? (Jobs)
          </h3>
          <span className="rounded-full bg-[#f1f3f9] px-2 py-0.5 font-mono text-[10px] font-bold text-[#626982]">
            {whatChanged.length} items
          </span>
        </div>

        <div className="mt-3 divide-y divide-[#f1f3f9]">
          {whatChanged.map((item) => (
            <div
              key={item.jobId}
              className="group flex cursor-pointer items-center justify-between gap-3 py-3 transition-colors hover:bg-[#fafbfe] -mx-2 px-2 rounded-xl"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black text-[#171a30]">
                    {item.jobId}
                  </span>
                  <span className="truncate text-xs font-medium text-[#4d5468]">
                    {item.title}
                  </span>
                </div>
                {item.description && (
                  <div className="mt-0.5 truncate text-[11px] text-[#878da1]">
                    {item.description}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-0.5 font-mono text-[9px] font-extrabold uppercase tracking-wider ${getBadgeStyle(
                    item.badgeTone
                  )}`}
                >
                  {item.badgeText}
                </span>
                <ChevronRight
                  size={14}
                  className="text-[#a2a7ba] transition-transform group-hover:translate-x-0.5 group-hover:text-[#2e3092]"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. WHY DID THIS HAPPEN? */}
      <div className="flex flex-col rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#eef0f6] pb-3">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-black tracking-tight text-[#171a30]">
              Why did this happen?
            </h3>
            <HelpCircle size={14} className="text-[#878da1]" />
          </div>
          <span className="rounded bg-[#2e3092]/10 px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-wider text-[#2e3092]">
            {why.reasonCode}
          </span>
        </div>

        <div className="mt-3 flex-1 space-y-3 text-xs leading-relaxed text-[#4d5468]">
          <p className="font-medium text-[#171a30]">{why.explanation}</p>
          <div className="space-y-1.5 text-[11px] text-[#626982]">
            {why.bullets.map((bullet, idx) => (
              <div key={idx} className="leading-snug">
                {bullet}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. ALTERNATIVE OPTIONS */}
      <div className="flex flex-col rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#eef0f6] pb-3">
          <h3 className="text-sm font-black tracking-tight text-[#171a30]">
            Alternative options
          </h3>
          <span className="rounded-full bg-[#f1f3f9] px-2 py-0.5 font-mono text-[10px] font-bold text-[#626982]">
            {alternatives.length} options
          </span>
        </div>

        <div className="mt-3 space-y-2.5">
          {alternatives.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelectAlternative?.(opt)}
              className="group flex w-full items-center justify-between rounded-xl border border-[#e3e6f0] bg-[#fafbfe] p-3 text-left transition-all hover:border-[#2e3092]/40 hover:bg-white hover:shadow-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-black uppercase ${getOptionBadgeStyle(
                      opt.tone
                    )}`}
                  >
                    {opt.label}
                  </span>
                  <span className="truncate text-xs font-bold text-[#171a30] group-hover:text-[#2e3092] transition-colors">
                    {opt.title}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[#626982]">
                  {opt.subtitle}
                </div>
              </div>
              <ChevronRight
                size={14}
                className="shrink-0 text-[#a2a7ba] transition-transform group-hover:translate-x-0.5 group-hover:text-[#2e3092]"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
