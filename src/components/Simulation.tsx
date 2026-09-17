// ---------------------------------------------------------------------------
// SIMULATION (§14) — pick an event, configure, run, compare BEFORE → EVENT →
// AFTER. Nothing is saved until the officer sends a revised plan to Approval.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Collapse, ReasonChip, SectionHeader, CRIT, NEUTRAL, OK, PRIMARY, WARN } from "./ui";
import { jobById } from "../data/jobsData";
import { recommendedPlan, type DeferredJob } from "../data/planData";
import { occupiedUnion } from "../lib/plan";
import { UtilBar } from "./TimelineUtil";

/* --------------------------------- model ---------------------------------- */

interface SimWindow {
  id: string;
  label: string;
  minutes: number;
  reserved?: string;
}

interface SimJob {
  jobId: string;
  windowId: string;
  minutes: number;
  start?: string;
  end?: string;
  note?: string;
}

interface SimState {
  windows: SimWindow[];
  scheduled: SimJob[];
  deferred: (DeferredJob & { note?: string })[];
  impact: string[];
}

const mins = (a: string, b: string): number =>
  Math.round((new Date(`2000-01-01T${b}`).getTime() - new Date(`2000-01-01T${a}`).getTime()) / 60000);

const baseState = (): SimState => ({
  windows: [
    { id: "W1", label: "NDLS–GZB (UP)", minutes: 180 },
    { id: "W2", label: "TDL–CNB (DOWN)", minutes: 240 },
    { id: "W3", label: "PRYJ–DDU (UP)", minutes: 285 },
  ],
  scheduled: recommendedPlan.assignments
    .filter((a) => a.windowId !== "E3") // sanctioned block — not re-planned here
    .map((a) => ({ jobId: a.jobId, windowId: a.windowId, minutes: mins(a.start, a.end), start: a.start, end: a.end, note: a.note })),
  deferred: recommendedPlan.deferred.map((d) => ({ ...d })),
  impact: [...recommendedPlan.trainImpact],
});

const defer = (s: SimState, jobId: string, code: DeferredJob["code"], reason: string) => {
  s.scheduled = s.scheduled.filter((j) => j.jobId !== jobId);
  s.deferred = [...s.deferred.filter((d) => d.jobId !== jobId), { jobId, code, reason }];
};

export interface Scenario {
  id: string;
  label: string;
  detail: string;
  event: [string, string][];
  changes: string[];
  apply: (s: SimState) => void;
}

/* ------------------------------- scenarios -------------------------------- */

const SCENARIOS: Scenario[] = [
  {
    id: "relief",
    label: "Relief / special train",
    detail: "Protected movement consumes part of a corridor window — the plan re-organizes around it.",
    event: [
      ["Event", "Relief train (protected path)"],
      ["Corridor", "NDLS–GZB (W1)"],
      ["Reserved", "02:30–03:30 · 60 min"],
      ["Rule", "Maintenance clears the protected path — no overlap permitted"],
    ],
    changes: [
      "W1 loses 60 minutes of usable capacity to the protected movement",
      "J-02 rail weld (T1) pulled ahead to 01:00–02:30 — still completes before the movement",
      "J-09 lamp batch rides the same protection, now 01:00–02:00",
      "J-13 trolley patrol (T4) no longer fits — deferred, next opportunity 16 Sep",
    ],
    apply: (s) => {
      const w1 = s.windows.find((w) => w.id === "W1");
      if (!w1) return;
      w1.reserved = "02:30–03:30 — relief train path";
      const j2 = s.scheduled.find((j) => j.jobId === "J-02");
      if (j2) {
        j2.start = "01:00";
        j2.end = "02:30";
        j2.note = "moved ahead of the protected path";
      }
      const j9 = s.scheduled.find((j) => j.jobId === "J-09");
      if (j9) {
        j9.start = "01:00";
        j9.end = "02:00";
        j9.note = "rides the weld protection, moved ahead";
      }
      defer(s, "J-07", "INSUFFICIENT_WINDOW", "W3 consumed by the Tier 0 emergency; balance axle-counter work moves to 16 Sep.");
      s.impact.push("Tier 0 emergency path cleared before CONCOR-2210.");
    },
  },
  {
    id: "reduce",
    label: "Reduce block window",
    detail: "Traffic pressure forces W2 (TDL–CNB DOWN) down to 180 min.",
    event: [
      ["Event", "Window reduction"],
      ["Corridor", "TDL–CNB (W2)"],
      ["Change", "240 → 180 min"],
      ["Rule", "Scheduled work must fit or defer"],
    ],
    changes: [
      "W2 shrinks 240 → 180 min under freight pressure",
      "J-04 ballast cleaning completes only 2 of 3 passes",
      "Balance pass (60 min) moves to 16 Sep — geometry TSR stays one more night",
    ],
    apply: (s) => {
      const w2 = s.windows.find((w) => w.id === "W2");
      if (!w2 || w2.minutes <= 180) return;
      w2.minutes = 180;
      w2.label = "TDL–CNB (DOWN) — reduced window";
      const j4 = s.scheduled.find((j) => j.jobId === "J-04");
      if (j4) {
        j4.end = "04:30";
        j4.minutes = 180;
        j4.note = "partial — 2 of 3 passes";
      }
      defer(s, "J-04", "INSUFFICIENT_WINDOW", "Balance pass-3 (60 min) does not fit the reduced window.");
      s.impact.push("BCNA-47012 freight released without hold (shorter W2).");
    },
  },
  {
    id: "remove",
    label: "Remove block window",
    detail: "MGS junction track-circuit failure withdraws W3 (PRYJ–DDU UP).",
    event: [
      ["Event", "Window withdrawal"],
      ["Corridor", "PRYJ–DDU (W3)"],
      ["Cause", "MGS junction track-circuit failure"],
      ["Rule", "No safe possession without interlocking"],
    ],
    changes: [
      "W3 withdrawn — junction interlocking unavailable",
      "J-05 (Tier 2) and J-07 (Tier 3) both defer",
      "Utilization drops on remaining windows — deferred volume rises",
    ],
    apply: (s) => {
      s.windows = s.windows.filter((w) => w.id !== "W3");
      s.scheduled = s.scheduled.filter((j) => {
        if (j.windowId !== "W3") return true;
        defer(s, j.jobId, "INSUFFICIENT_WINDOW", "W3 withdrawn after MGS junction track-circuit failure; re-planned 16 Sep.");
        return false;
      });
      s.impact.push("CONCOR-2210 path protected without regulation.");
    },
  },
  {
    id: "priority",
    label: "Change priority",
    detail: "Pivot overheating reports raise J-10 lubrication Tier 4 → Tier 2.",
    event: [
      ["Event", "Priority escalation"],
      ["Job", "J-10 OHE mast pivot lubrication"],
      ["Change", "Tier 4 → Tier 2"],
      ["Rule", "Higher tier displaces lower tier inside the same protection"],
    ],
    changes: [
      "J-10 (now Tier 2) displaces J-09 (Tier 4) inside W1's protection",
      "Lamp batch defers — Tier rule applied mechanically, no exceptions",
      "W1 utilization rises; no extra possession needed",
    ],
    apply: (s) => {
      const w1 = s.windows.find((w) => w.id === "W1");
      if (!w1) {
        defer(s, "J-10", "INSUFFICIENT_WINDOW", "W1 unavailable — raised-priority job cannot find a slot tonight.");
        return;
      }
      s.scheduled = s.scheduled.filter((j) => j.jobId !== "J-09");
      defer(s, "J-09", "LOWER_PRIORITY", "Raised-priority J-10 takes the parallel slot in W1.");
      s.scheduled.push({ jobId: "J-10", windowId: "W1", minutes: 90, start: "02:00", end: "03:00", note: "parallel — raised to Tier 2" });
    },
  },
  {
    id: "restriction",
    label: "Operational restriction",
    detail: "Freight night curfew extended by 1 hour on the CNB end.",
    event: [
      ["Event", "Curfew extension"],
      ["Corridor", "TDL–CNB (W2)"],
      ["Change", "Start delayed 01:30 → 02:30"],
      ["Rule", "Machine entry only after the curfew lifts"],
    ],
    changes: [
      "W2 start delayed 01:30 → 02:30 under the extended curfew",
      "J-04 ballast cleaning completes 2 of 3 passes only",
      "Machine entry re-timed — no other window affected",
    ],
    apply: (s) => {
      const w2 = s.windows.find((w) => w.id === "W2");
      if (!w2) return;
      if (w2.minutes > 180) {
        w2.minutes = 180;
        w2.label = "TDL–CNB (DOWN) — curfew-delayed start";
        const j4 = s.scheduled.find((j) => j.jobId === "J-04");
        if (j4) {
          j4.start = "02:30";
          j4.end = "05:30";
          j4.minutes = 180;
          j4.note = "partial — 2 of 3 passes";
        }
        defer(s, "J-04", "INSUFFICIENT_WINDOW", "Extended freight curfew delays machine entry by one hour.");
      }
    },
  },
];

/* ------------------------------ derived stats ------------------------------ */

interface SimStats {
  blocks: number;
  jobs: number;
  deferred: number;
  utilization: number;
  impact: number;
}

function simStats(s: SimState): SimStats {
  const totalMinutes = s.windows.reduce((a, w) => a + w.minutes, 0);
  const occupied = s.windows.reduce(
    (a, w) => a + occupiedUnion(s.scheduled.filter((j) => j.windowId === w.id).map((j) => ({ start: j.start ?? "00:00", end: j.end ?? "00:00" }))),
    0
  );
  return {
    blocks: s.windows.filter((w) => s.scheduled.some((j) => j.windowId === w.id)).length,
    jobs: s.scheduled.length,
    deferred: s.deferred.length,
    utilization: totalMinutes ? Math.round((occupied / totalMinutes) * 100) : 0,
    impact: s.impact.length,
  };
}

const utilTone = (u: number): string => (u >= 88 ? OK : u >= 75 ? WARN : CRIT);

function StatBlock({ label, stats, tone, highlight }: { label: string; stats: SimStats; tone: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? "border-[#2e3092]/50" : ""}`}>
      <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: tone }}>
        {label}
      </div>
      <UtilBar pct={stats.utilization} tone={utilTone(stats.utilization)} />
      <div className="mt-3 grid grid-cols-2 gap-y-2 text-[11px]">
        <span className="text-[#878da1]">Blocks</span>
        <span className="text-right font-mono font-bold text-[#171a30]">{stats.blocks}</span>
        <span className="text-[#878da1]">Jobs scheduled</span>
        <span className="text-right font-mono font-bold text-[#171a30]">{stats.jobs}</span>
        <span className="text-[#878da1]">Deferred</span>
        <span className="text-right font-mono font-bold text-[#171a30]">{stats.deferred}</span>
        <span className="text-[#878da1]">Operational impacts</span>
        <span className="text-right font-mono font-bold text-[#171a30]">{stats.impact}</span>
      </div>
    </Card>
  );
}

/* ------------------------------- component -------------------------------- */

interface SimulationProps {
  /** Scenario preloaded from elsewhere (e.g. the Planning Assistant). */
  initialScenario?: string | null;
  onSendToApproval: (note: string) => void;
}

function Simulation({ initialScenario, onSendToApproval }: SimulationProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialScenario ?? null);
  const [ran, setRan] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (initialScenario) {
      setSelectedId(initialScenario);
      setRan(true);
    }
  }, [initialScenario]);

  const base = useMemo(() => baseState(), []);
  const baseStats = useMemo(() => simStats(base), [base]);
  const scenario = SCENARIOS.find((s) => s.id === selectedId) ?? null;

  const after = useMemo(() => {
    if (!scenario) return null;
    const s = baseState();
    scenario.apply(s);
    return { state: s, stats: simStats(s) };
  }, [scenario]);

  return (
    <div>
      <SectionHeader
        title="Simulation"
        subtitle="Reserve / change a window, then compare BEFORE → EVENT → AFTER · nothing is saved until sent to approval"
      />

      {/* Scenario picker */}
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-3">
        {SCENARIOS.map((sc) => {
          const on = selectedId === sc.id;
          return (
            <button
              key={sc.id}
              onClick={() => {
                setSelectedId(sc.id);
                setRan(false);
                setSent(false);
              }}
              className={`focus-primary rounded-xl border p-3 text-left transition-colors duration-200 ${
                on ? "border-[#2e3092] bg-[#eef0fa]" : "border-[#e3e6f0] bg-white hover:border-[#c9cde8]"
              }`}
            >
              <div className="text-[11px] font-extrabold text-[#171a30]">
                {on ? "✓ " : "+ "}
                {sc.label}
              </div>
              <p className="mt-1 text-[10px] leading-snug text-[#878da1]">{sc.detail}</p>
            </button>
          );
        })}
      </div>

      {/* Configuration + run */}
      {scenario && !ran && (
        <Card className="mb-4 border-[#2e3092]/40 p-4">
          <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#2e3092]">
            Configure event — {scenario.label}
          </div>
          <div className="mb-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {scenario.event.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-b border-[#eef0f6] py-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">{k}</span>
                <span className="text-right text-[11px] font-semibold text-[#171a30]">{v}</span>
              </div>
            ))}
          </div>
          <Button onClick={() => setRan(true)}>Run simulation</Button>
        </Card>
      )}

      {/* Result — BEFORE → EVENT → AFTER */}
      {scenario && ran && after && (
        <>
          <div className="mb-4 grid gap-3 lg:grid-cols-3">
            <StatBlock label="Before" stats={baseStats} tone={NEUTRAL} />
            <Card className="border-[#d97706]/50 bg-[#fffbeb] p-4">
              <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#d97706]">Event</div>
              <div className="space-y-1.5">
                {scenario.event.map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[#b45309]">{k}</div>
                    <div className="text-[11px] font-semibold text-[#171a30]">{v}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-[#92400e]">
                Simulated event — the replan engine re-fits every job against the tier rulebook before anything is proposed.
              </p>
            </Card>
            <StatBlock label="After" stats={after.stats} tone={PRIMARY} highlight />
          </div>

          {/* Moved / deferred detail */}
          <Card className="mb-4 p-4">
            <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#878da1]">What changed?</h3>
            <ol className="space-y-1.5">
              {scenario.changes.map((c, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-[#4d5468]">
                  <span className="font-mono font-bold text-[#2e3092]">{i + 1}.</span>
                  {c}
                </li>
              ))}
            </ol>
            <div className="mt-3 space-y-1.5">
              {after.state.deferred
                .filter((d) => !base.deferred.some((b) => b.jobId === d.jobId))
                .map((d) => (
                  <div key={d.jobId} className="flex items-start justify-between gap-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2">
                    <div>
                      <span className="text-[11px] font-bold text-[#171a30]">
                        {d.jobId} · {jobById(d.jobId)?.title ?? "Emergency insertion"}
                      </span>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[#92400e]">{d.reason}</p>
                    </div>
                    <ReasonChip code={d.code} />
                  </div>
                ))}
            </div>
            <div className="mt-2">
              <Collapse title="View reasoning — full scenario notes">
                <div className="mb-2 text-[11px] font-bold text-[#171a30]">{scenario.label}</div>
                <ul className="space-y-1 text-[#4d5468]">
                  {scenario.changes.map((c) => (
                    <li key={c}>· {c}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] italic text-[#878da1]">{scenario.detail}</p>
              </Collapse>
            </div>
          </Card>

          {/* Send the revised plan onward — the officer still approves it */}
          <Card className="flex flex-wrap items-center justify-between gap-3 border-[#2e3092]/40 p-4">
            <div>
              <div className="text-xs font-bold text-[#171a30]">Revised plan ready</div>
              <div className="text-[11px] text-[#878da1]">
                After-state computed — {after.stats.jobs} jobs scheduled · {after.stats.deferred} deferred · {after.stats.utilization}% utilized.
                The officer authorizes in Human Approval.
              </div>
            </div>
            <Button
              disabled={sent}
              onClick={() => {
                setSent(true);
                onSendToApproval(`${scenario.label} applied — ${scenario.changes[0]}`);
              }}
            >
              {sent ? "Sent to approval ✓" : "Send revised plan to approval →"}
            </Button>
          </Card>
        </>
      )}

      {!scenario && (
        <Card className="p-8 text-center text-[11px] italic text-[#878da1]">
          Select an event above — the plan re-computes around it.
        </Card>
      )}
    </div>
  );
}

export default Simulation;