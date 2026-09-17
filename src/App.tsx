// ---------------------------------------------------------------------------
// APP SHELL — 5 views, hash-routed (#/command · #/network · #/workspace ·
// #/simulation · #/approval). Planning Assistant is a global top-right drawer.
// Officer identity arrives from the portal login via localStorage.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { CalendarClock, FlaskConical, LayoutDashboard, LogOut, MessagesSquare, Network as NetworkIcon, ShieldCheck } from "lucide-react";
import NetworkDiagram from "./components/NetworkDiagram";
import CommandCenter from "./components/CommandCenter";
import Workspace from "./components/Workspace";
import Simulation from "./components/Simulation";
import ApprovalHistory, { type PlanStatus } from "./components/ApprovalHistory";
import Assistant, { type AssistantScenario } from "./components/PlanningAssistant";
import { seedDecisions, type DecisionEntry } from "./data/planData";
import { PLAN_VERSION } from "./data/opsData";
import { CRIT, OK, PRIMARY, WARN, type ViewId } from "./components/ui";

const NAV: { group: string; items: { id: ViewId; label: string; icon: React.ReactNode }[] }[] = [
  {
    group: "Operations",
    items: [
      { id: "command", label: "Command Center", icon: <LayoutDashboard size={15} /> },
      { id: "network", label: "Network", icon: <NetworkIcon size={15} /> },
    ],
  },
  {
    group: "Planning",
    items: [
      { id: "workspace", label: "Planning Workspace", icon: <CalendarClock size={15} /> },
      { id: "simulation", label: "Simulation", icon: <FlaskConical size={15} /> },
    ],
  },
  {
    group: "Governance",
    items: [{ id: "approval", label: "Approval & History", icon: <ShieldCheck size={15} /> }],
  },
];

const STATUS_TONE: Record<PlanStatus, string> = {
  "Pending approval": WARN,
  Approved: OK,
  Modified: PRIMARY,
  Rejected: CRIT,
  Locked: "#878da1",
};

const VALID_VIEWS: ViewId[] = ["command", "network", "workspace", "simulation", "approval"];

const viewFromHash = (): ViewId => {
  const h = window.location.hash.replace(/^#\/?/, "");
  return (VALID_VIEWS as string[]).includes(h) ? (h as ViewId) : "command";
};

export default function App() {
  const [view, setView] = useState<ViewId>(viewFromHash);
  const [decisions, setDecisions] = useState<DecisionEntry[]>(seedDecisions);
  const [planStatus, setPlanStatus] = useState<PlanStatus>("Pending approval");
  const [locked, setLocked] = useState(false);
  const [revisedNote, setRevisedNote] = useState<string | null>(null);
  const [officer, setOfficer] = useState("Dy. Chief Controller");
  const [clock, setClock] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantScenario, setAssistantScenario] = useState<AssistantScenario>(null);
  const [simScenario, setSimScenario] = useState<string | null>(null);
  const [focusWindow, setFocusWindow] = useState<string | null>(null);

  // Hash routing — refresh-proof, back-button friendly during the demo.
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) window.history.replaceState(null, "", "#/command");
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (v: ViewId) => {
    window.location.hash = `/${v}`;
    setView(v);
  };

  // Signed-in officer from the legacy portal (localStorage bridge)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rbc_current_user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u.name) setOfficer(String(u.name));
      }
    } catch {
      // keep default
    }
  }, []);

  // Live IST clock
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const handleAction = (action: "Approved" | "Modified" | "Rejected", reason: string) => {
    const version = action === "Modified" || revisedNote ? "v2026.09.15 · r4" : PLAN_VERSION;
    const ts = `${new Date().toLocaleDateString("en-GB")} · ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} IST`;
    const entry: DecisionEntry = {
      id: `D-${105 + decisions.length - seedDecisions.length}`,
      ts,
      version,
      recommendation: revisedNote
        ? `NDLS–BSB night plan (revised) — ${revisedNote}`
        : "NDLS–BSB night plan — 3 windows, 7 jobs",
      action,
      overrideReason: reason || undefined,
      officer,
    };
    setDecisions((prev) => [...prev, entry]);
    setPlanStatus(action);
    if (action === "Modified") setRevisedNote((n) => n ?? "Modified by officer");
  };

  const pending = planStatus === "Pending approval";
  const effectiveStatus: PlanStatus = locked ? "Locked" : planStatus;
  const tone = STATUS_TONE[effectiveStatus];

  const openAssistant = (scenario: AssistantScenario) => {
    setAssistantScenario(scenario);
    setAssistantOpen(true);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f7fb] text-[#171a30]">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[#e3e6f0] bg-white md:flex">
        <div className="flex items-center gap-2.5 border-b border-[#eef0f6] px-4 py-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2e3092]">
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
              <path d="M8 22L16 8L24 22" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 22H25" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="text-[11px] font-extrabold leading-tight tracking-wide text-[#171a30]">BLOCK PLANNING</div>
            <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#878da1]">
              Maintenance Coordination
            </div>
          </div>
        </div>

        <nav className="thin-scroll flex-1 overflow-y-auto px-2.5 py-3">
          {NAV.map((g) => (
            <div key={g.group} className="mb-3">
              <div className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#a2a7ba]">{g.group}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => navigate(it.id)}
                  className={`focus-primary mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors duration-200 ${
                    view === it.id ? "bg-[#2e3092] text-white" : "text-[#4d5468] hover:bg-[#f5f6fc] hover:text-[#171a30]"
                  }`}
                >
                  {it.icon}
                  <span className="flex-1">{it.label}</span>
                  {it.id === "approval" && pending && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d97706]" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-[#eef0f6] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-bold text-[#171a30]">{officer}</div>
              <div className="text-[9px] text-[#878da1]">Control Office · approving authority</div>
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem("rbc_current_user");
                } catch {}
                window.location.href = "../../index.html";
              }}
              title="Sign out to portal"
              className="focus-primary rounded p-1.5 text-[#878da1] transition-colors duration-200 hover:bg-[#fef2f2] hover:text-[#dc2626]"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex items-center justify-between gap-3 border-b border-[#e3e6f0] bg-white px-4 py-2.5 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden font-mono text-[10px] text-[#878da1] sm:block">{PLAN_VERSION}</span>
            <span
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
              style={{ color: tone, background: `${tone}18`, border: `1px solid ${tone}44` }}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${pending ? "animate-pulse" : ""}`} style={{ background: tone }} />
              {effectiveStatus}
            </span>
            <select
              value={view}
              onChange={(e) => navigate(e.target.value as ViewId)}
              className="focus-primary rounded-lg border border-[#e3e6f0] bg-white px-2 py-1 text-xs text-[#171a30] md:hidden"
            >
              {NAV.flatMap((g) => g.items).map((it) => (
                <option key={it.id} value={it.id}>
                  {it.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[10px] text-[#878da1] sm:block">{clock} IST</span>
            <button
              onClick={() => openAssistant(null)}
              className="focus-primary inline-flex items-center gap-1.5 rounded-lg bg-[#2e3092] px-3 py-1.5 text-[11px] font-bold text-white transition-colors duration-200 hover:bg-[#24266f]"
            >
              <MessagesSquare size={13} />
              Planning Assistant
            </button>
            <a
              href="../../index.html"
              className="focus-primary hidden items-center rounded-lg border border-[#e3e6f0] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#4d5468] transition-colors duration-200 hover:bg-[#f5f6fc] sm:inline-flex"
              title="Return to landing page"
            >
              Home
            </a>
          </div>
        </header>
        {/* Main view */}
        <main className="thin-scroll flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto max-w-[1400px]">
            {view === "command" && (
              <CommandCenter onNavigate={navigate} approvalPending={pending} onOpenAssistant={(s) => openAssistant(s)} />
            )}
            {view === "network" && (
              <div className="h-[calc(100vh-150px)] min-h-[520px] overflow-hidden rounded-2xl border border-[#e3e6f0] bg-white shadow-[0_10px_40px_-16px_rgba(23,26,48,0.25)]">
                <NetworkDiagram />
              </div>
            )}
            {view === "workspace" && (
              <Workspace key={focusWindow ?? "ws"} onNavigate={navigate} initialWindowId={focusWindow ?? undefined} />
            )}
            {view === "simulation" && (
              <Simulation
                initialScenario={simScenario}
                onSendToApproval={(note) => {
                  setRevisedNote(note);
                  setPlanStatus("Pending approval");
                  navigate("approval");
                }}
              />
            )}
            {view === "approval" && (
              <ApprovalHistory
                status={effectiveStatus}
                locked={locked}
                decisions={decisions}
                revisedNote={revisedNote}
                onAction={handleAction}
                onToggleLock={() => setLocked((l) => !l)}
              />
            )}
          </div>
        </main>
      </div>

      {/* Global Planning Assistant drawer */}
      <Assistant
        open={assistantOpen}
        scenario={assistantScenario}
        onClose={() => setAssistantOpen(false)}
        onRunPlan={() => {
          setAssistantOpen(false);
          setFocusWindow("W1");
          navigate("workspace");
        }}
        onSimulate={(s) => {
          setAssistantOpen(false);
          setSimScenario(s);
          navigate("simulation");
        }}
      />
    </div>
  );
}