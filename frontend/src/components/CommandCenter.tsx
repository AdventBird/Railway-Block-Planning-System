// ---------------------------------------------------------------------------
// COMMAND CENTER — Executive Observe & Decision Screen
// Structure:
//   1. Header: Page title, subtitle, subtle corridor metadata, Workspace CTA
//   2. Section 1: CURRENT PLAN — Hero decision/status card
//   3. Section 2: ATTENTION REQUIRED — Concise, actionable operational alerts
//   4. Section 3: UPCOMING PLAN — 3 future planned block cards with deep links
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock,
  FileText,
  Info,
} from "lucide-react";
import type { ViewId } from "./ui";
import { AlertDrawer } from "./drawers";
import { blockWindows, type Alert } from "../data/opsData";
import { recommendedPlan } from "../data/planData";
import { planStats } from "../lib/plan";
import { getPlannerResult } from "../api/planner";
import type { PlannerResult } from "../api/types";

interface CommandCenterProps {
  onNavigate: (v: ViewId) => void;
  approvalPending: boolean;
  onOpenAssistant: (scenario: "find" | "reserve") => void;
  onSelectWindow?: (windowId: string) => void;
}

interface UpcomingBlockCard {
  id: string;
  date: string;
  day: string;
  windowId: string;
  section: string;
  track: string;
  timeRange: string;
  duration: string;
  jobsText: string;
  impactText: string;
  status: "PENDING APPROVAL" | "AT RISK" | "APPROVED";
  buttonText: string;
}

const UPCOMING_BLOCKS: UpcomingBlockCard[] = [
  {
    id: "W1",
    date: "17 SEP 2026",
    day: "Thu",
    windowId: "W1",
    section: "NDLS – GZB",
    track: "UP TRACK",
    timeRange: "01:00 – 04:00",
    duration: "3 h",
    jobsText: "3 jobs",
    impactText: "25 min expected impact",
    status: "PENDING APPROVAL",
    buttonText: "Review in Planning Workspace",
  },
  {
    id: "W2",
    date: "18 SEP 2026",
    day: "Fri",
    windowId: "W2",
    section: "TDL – CNB",
    track: "DOWN TRACK",
    timeRange: "01:30 – 05:30",
    duration: "4 h",
    jobsText: "2 jobs · 1 critical",
    impactText: "18 min expected impact",
    status: "AT RISK",
    buttonText: "View details",
  },
  {
    id: "W3",
    date: "19 SEP 2026",
    day: "Sat",
    windowId: "W3",
    section: "PRYJ – DDU",
    track: "UP TRACK",
    timeRange: "02:00 – 05:00",
    duration: "3 h",
    jobsText: "4 jobs",
    impactText: "8 min expected impact",
    status: "APPROVED",
    buttonText: "View details",
  },
];

export default function CommandCenter({
  onNavigate,
  approvalPending,
  onOpenAssistant,
  onSelectWindow,
}: CommandCenterProps) {
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const [plannerResult, setPlannerResult] = useState<PlannerResult | null>(null);

  useEffect(() => {
    let active = true;
    getPlannerResult().then((res) => {
      if (active) setPlannerResult(res);
    });
    return () => {
      active = false;
    };
  }, []);

  const seedStats = planStats(
    blockWindows.map((w) => ({ id: w.id, minutes: w.minutes })),
    recommendedPlan.assignments
  );
  const liveMetrics = plannerResult?.source.status === "live" ? plannerResult.metrics : null;
  const stats = {
    blocks: liveMetrics?.blocks ?? seedStats.blocks,
    jobs: liveMetrics?.scheduled ?? seedStats.jobs,
  };

  const handleOpenWindow = (winId: string) => {
    if (onSelectWindow) {
      onSelectWindow(winId);
    } else {
      onNavigate("workspace");
    }
  };

  // Structured attention items matching the operational priorities
  const attentionItems = [
    {
      id: "ATTN-1",
      icon: <CircleAlert size={18} className="text-[#dc2626]" />,
      iconBg: "bg-[#fef2f2]",
      title: "Critical maintenance request",
      subtitle: "Tier 0 — OHE insulator failure at DDU–BSB",
      topMeta: "Reported 20:41 IST",
      bottomMeta: "DDU–BSB · KM 74/12",
      onClick: () => handleOpenWindow("W3"),
    },
    {
      id: "ATTN-2",
      icon: <AlertTriangle size={18} className="text-[#d97706]" />,
      iconBg: "bg-[#fffbeb]",
      title: "Block approval deadline",
      subtitle: "W1 · NDLS–GZB · approval closes in 6 h",
      topMeta: "Closes 21:05 IST",
      bottomMeta: "17 Sep 2026 · 01:00–04:00",
      onClick: () => onNavigate("approval"),
    },
    {
      id: "ATTN-3",
      icon: <Info size={18} className="text-[#2563eb]" />,
      iconBg: "bg-[#eff6ff]",
      title: "Planning change request",
      subtitle: "Relief train path requested — NDLS–GZB",
      topMeta: "Requested 02:30–03:30",
      bottomMeta: "Insert event in plan",
      onClick: () => onOpenAssistant("reserve"),
    },
  ];

  const displayedAttention = showAllActions ? attentionItems : attentionItems.slice(0, 3);

  const getStatusBadgeStyle = (status: UpcomingBlockCard["status"]) => {
    switch (status) {
      case "PENDING APPROVAL":
        return "bg-[#fffbeb] text-[#b45309] border-[#fde68a]";
      case "AT RISK":
        return "bg-[#fef2f2] text-[#991b1b] border-[#fecaca]";
      case "APPROVED":
        return "bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]";
    }
  };

  return (
    <div className="mx-auto max-w-[1340px] space-y-7 pb-10">
      {/* PAGE HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#171a30]">
            Command Center
          </h1>
          <p className="mt-0.5 text-xs text-[#626982]">
            Upcoming maintenance planning and key actions
          </p>
          <div className="mt-1 flex items-center gap-2 text-[10px] font-bold tracking-wider text-[#878da1]">
            <span>NDLS – BSB</span>
            <span>·</span>
            <span>DEMO DATA</span>
            <span>·</span>
            <span>SYNTHETIC FEEDS</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("workspace")}
          className="flex items-center gap-1.5 rounded-xl border border-[#2e3092]/30 bg-white px-4 py-2 text-xs font-bold text-[#2e3092] shadow-xs transition-colors hover:bg-[#2e3092]/5 hover:border-[#2e3092]"
        >
          <span>Open Planning Workspace</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* SECTION 1: CURRENT PLAN HERO CARD */}
      <section className="rounded-2xl border border-[#e3e6f0] bg-white p-6 shadow-xs">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Decision Status & Scope */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-[#878da1]">
                CURRENT PLAN
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider"
                style={{
                  color: approvalPending ? "#b45309" : "#166534",
                  background: approvalPending ? "#fffbeb" : "#f0fdf4",
                  border: `1px solid ${approvalPending ? "#fde68a" : "#bbf7d0"}`,
                }}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${approvalPending ? "animate-pulse" : ""}`}
                  style={{ background: approvalPending ? "#d97706" : "#16a34a" }}
                />
                {approvalPending ? "PENDING APPROVAL" : "APPROVED"}
              </span>
            </div>

            <div className="mt-2 text-3xl font-black tracking-tight text-[#171a30]">
              Current Plan
            </div>
            <div className="mt-1 text-xs font-medium text-[#626982]">
              17 Sep 2026 · Night maintenance plan (Revision 3)
            </div>

            <div className="mt-5 flex items-center gap-8">
              <div>
                <div className="font-mono text-2xl font-black text-[#171a30]">{stats.jobs}</div>
                <div className="text-[11px] font-semibold text-[#878da1]">Jobs</div>
              </div>
              <div className="h-8 w-px bg-[#eef0f6]" />
              <div>
                <div className="font-mono text-2xl font-black text-[#171a30]">{stats.blocks}</div>
                <div className="text-[11px] font-semibold text-[#878da1]">Blocks</div>
              </div>
            </div>
          </div>

          {/* Right Column: Guidance & Main Navigation Action */}
          <div className="flex flex-col items-start gap-4 rounded-xl border border-[#f1f3f9] bg-[#fafbfe] p-5 sm:flex-row sm:items-center lg:col-span-7">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#fde68a] bg-[#fffbeb] text-[#d97706]">
              <FileText size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-[#171a30]">
                {approvalPending ? "This plan is pending approval." : "This plan is approved."}
              </h3>
              <p className="mt-0.5 text-xs text-[#626982]">
                Review the planned blocks, jobs and impacts in the Planning Workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenWindow("W1")}
              className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-[#2e3092] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#232573] active:scale-[0.99]"
            >
              <span>Review Plan in Planning Workspace</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 2: ATTENTION REQUIRED */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-[#171a30]">
              ATTENTION REQUIRED
            </h2>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#dc2626] px-1.5 text-[10px] font-bold text-white">
              {attentionItems.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowAllActions((v) => !v)}
            className="flex items-center gap-1 text-xs font-bold text-[#2e3092] transition-colors hover:underline"
          >
            <span>{showAllActions ? "Show top 3" : "View all"}</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {attentionItems.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-[#e3e6f0] bg-white divide-y divide-[#eef0f6] shadow-xs">
            {displayedAttention.map((item) => (
              <div
                key={item.id}
                onClick={item.onClick}
                className="group flex cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[#f8f9fd]"
              >
                {/* Semantic Icon */}
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.iconBg}`}
                >
                  {item.icon}
                </div>

                {/* Left Description */}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-[#171a30] group-hover:text-[#2e3092] transition-colors">
                    {item.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#626982]">
                    {item.subtitle}
                  </div>
                </div>

                {/* Right Metadata */}
                <div className="text-right">
                  <div className="text-xs font-semibold text-[#171a30]">
                    {item.topMeta}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#878da1]">
                    {item.bottomMeta}
                  </div>
                </div>

                {/* Navigation Chevron */}
                <ChevronRight
                  size={16}
                  className="shrink-0 text-[#a2a7ba] transition-transform group-hover:translate-x-0.5 group-hover:text-[#2e3092]"
                />
              </div>
            ))}
          </div>
        ) : (
          /* Empty state */
          <div className="flex items-center gap-3 rounded-2xl border border-[#e3e6f0] bg-white p-5 text-[#16a34a] shadow-xs">
            <CheckCircle2 size={20} />
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#16a34a]">
                No Action Required
              </div>
              <div className="text-xs text-[#626982]">
                No unresolved approval or planning issues.
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: UPCOMING PLAN */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-[#171a30]">
            UPCOMING PLAN
          </h2>
          <button
            type="button"
            onClick={() => onNavigate("workspace")}
            className="flex items-center gap-1 text-xs font-bold text-[#2e3092] transition-colors hover:underline"
          >
            <span>View calendar</span>
            <ArrowRight size={12} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {UPCOMING_BLOCKS.map((card) => (
            <div
              key={card.id}
              className="flex flex-col justify-between rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-xs transition-shadow hover:shadow-sm"
            >
              <div>
                {/* Header: Date and Status Badge */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-mono text-xs font-bold uppercase text-[#171a30]">
                      {card.date}
                    </div>
                    <div className="text-[10px] text-[#878da1]">{card.day}</div>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 font-mono text-[9px] font-extrabold uppercase tracking-wider ${getStatusBadgeStyle(
                      card.status
                    )}`}
                  >
                    {card.status}
                  </span>
                </div>

                {/* Block ID & Section */}
                <div className="mt-4">
                  <div className="font-mono text-2xl font-black text-[#171a30]">
                    {card.windowId}
                  </div>
                  <div className="mt-0.5 text-xs font-bold text-[#4d5468]">
                    {card.section} · <span className="font-mono text-[#878da1]">{card.track}</span>
                  </div>
                </div>

                {/* Attributes: Time, Jobs, Delay Impact */}
                <div className="mt-4 space-y-2 text-xs text-[#626982]">
                  <div className="flex items-center gap-2">
                    <Clock size={13} className="text-[#878da1]" />
                    <span className="font-mono font-medium text-[#171a30]">
                      {card.timeRange} ({card.duration})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase size={13} className="text-[#878da1]" />
                    <span>{card.jobsText}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarChart3 size={13} className="text-[#878da1]" />
                    <span>{card.impactText}</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-5 pt-3">
                <button
                  type="button"
                  onClick={() => handleOpenWindow(card.windowId)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#e3e6f0] bg-[#fafbfe] py-2 text-xs font-bold text-[#2e3092] transition-colors hover:border-[#2e3092]/50 hover:bg-[#2e3092]/5 active:scale-[0.99]"
                >
                  <span>{card.buttonText}</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Progressive Alert Drawer if needed */}
      {selectedAlert && (
        <AlertDrawer alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
      )}
    </div>
  );
}