// ---------------------------------------------------------------------------
// PLANNING ASSISTANT (§12–13) — global top-right drawer, NOT a chat window.
// Structured request understanding → prepared scenario → RUN PLAN / SIMULATE.
// Advisory only: it never authorizes, never decides safety.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Button, Card, Collapse, PRIMARY } from "./ui";

export type AssistantScenario = "find" | "reserve" | null;

interface AssistantProps {
  open: boolean;
  scenario: AssistantScenario;
  onClose: () => void;
  onRunPlan: () => void;
  onSimulate: (simulationScenario: string | null) => void;
}

const EXAMPLE_FIND = "Find a block tomorrow between 1 and 5 AM and prioritize critical Engineering work. Combine S&T/TRD work if compatible.";
const EXAMPLE_RESERVE = "Reserve NDLS–GZB from 02:30–03:30 for a relief train and reorganize tonight's maintenance.";

const ADVISORY = "Advisory only — this assistant cannot authorize a block. Authorization happens in Human Approval.";

const FIND_REQUEST: [string, string][] = [
  ["Date", "Tomorrow · Tue 15 Sep"],
  ["Window", "01:00 – 05:00"],
  ["Priority", "Tier 0–2 first"],
  ["Departments", "Engineering + S&T + TRD"],
  ["Preference", "Merge compatible work"],
];

const RESERVE_REQUEST: [string, string][] = [
  ["Event", "Relief train — protected path"],
  ["Corridor", "NDLS–GZB (W1)"],
  ["Reserved", "02:30 – 03:30 · 60 min"],
  ["Effect", "W1 loses 60 min of usable capacity"],
  ["Next", "Re-plan tonight's maintenance around it"],
];

function Assistant({ open, scenario, onClose, onRunPlan, onSimulate }: AssistantProps) {
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState<AssistantScenario>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // Sync with the scenario requested from outside (Command Center item, etc.).
  useEffect(() => {
    if (open) {
      setActive(scenario);
      setStep(scenario ? 2 : 0);
      setAsked(scenario === "reserve" ? EXAMPLE_RESERVE : scenario === "find" ? EXAMPLE_FIND : null);
    }
  }, [open, scenario]);

  // Staged reveal — request card, then the prepared state.
  useEffect(() => {
    if (!active || step >= 2) return;
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 350 : 650);
    return () => clearTimeout(t);
  }, [active, step]);

  if (!open) return null;

  const prepare = (text: string) => {
    const isReserve = /reserv|relief|special train|protect/i.test(text);
    setActive(isReserve ? "reserve" : "find");
    setAsked(text);
    setStep(0);
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="drawer-overlay absolute inset-0 bg-[#171a30]/25" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className="drawer-panel thin-scroll absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-[#e3e6f0] bg-white shadow-[-24px_0_60px_rgba(23,26,48,0.25)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#eef0f6] px-4 py-3">
          <div>
            <div className="text-sm font-bold text-[#171a30]">Planning Assistant</div>
            <div className="mt-0.5 text-[10px] text-[#878da1]">Natural-language planning · simulated understanding</div>
          </div>
          <button
            onClick={onClose}
            autoFocus
            aria-label="Close assistant"
            className="focus-primary rounded-md border border-[#e3e6f0] p-1.5 text-[11px] font-bold text-[#878da1] transition-colors duration-200 hover:text-[#171a30]"
          >
            ✕
          </button>
        </header>

        <div className="thin-scroll flex-1 overflow-y-auto p-4">
          {/* Ask */}
          <div className="mb-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Describe what you need — e.g. reserve a path, find a block, combine compatible work…"
              className="focus-primary w-full rounded-lg border border-[#e3e6f0] bg-white px-3 py-2 text-[12px] text-[#171a30] placeholder:text-[#a2a7ba]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button onClick={() => prepare(draft.trim() || EXAMPLE_FIND)} disabled={draft.trim().length === 0}>
                Prepare request
              </Button>
              <button
                onClick={() => setDraft(EXAMPLE_FIND)}
                className="focus-primary rounded border border-[#e3e6f0] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#4d5468] hover:bg-[#f5f6fc]"
              >
                Try: find a block…
              </button>
              <button
                onClick={() => setDraft(EXAMPLE_RESERVE)}
                className="focus-primary rounded border border-[#e3e6f0] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#4d5468] hover:bg-[#f5f6fc]"
              >
                Try: reserve a path…
              </button>
            </div>
          </div>

          {/* Prepared scenario */}
          {active && asked && (
            <div className="space-y-3">
              <div className="rounded-lg border border-[#e3e6f0] bg-[#f5f6fc] px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">You asked</div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#171a30]">“{asked}”</p>
              </div>

              {step >= 1 && (
                <Card className="p-3">
                  <div className="mb-2">
                    <span className="rounded bg-[#2e3092] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
                      Request understood
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {(active === "reserve" ? RESERVE_REQUEST : FIND_REQUEST).map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3 border-b border-[#eef0f6] py-1 last:border-0">
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">{k}</span>
                        <span className="text-right text-[11px] font-semibold text-[#171a30]">{v}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {step >= 2 && (
                <>
                  <div className="text-[11px] font-bold text-[#16a34a]">✓ Planning scenario prepared.</div>

                  <Collapse title="View details — how this will run">
                    {active === "reserve" ? (
                      <p className="leading-relaxed">
                        The reserved path is inserted into W1 (NDLS–GZB 01:00–04:00). Every scheduled job is re-checked
                        against the protected movement: the Tier 1 rail weld is pulled ahead, the parallel lamp batch
                        moves with it, and any job that no longer fits is deferred with a plain-language reason. Nothing
                        is applied until you run the simulation and the officer approves the revised plan.
                      </p>
                    ) : (
                      <p className="leading-relaxed">
                        The queue is filtered to Tier 0–2 Engineering work first; S&T/TRD jobs join only where the
                        compatibility rulebook permits (method · isolation · resources — never proximity). The draft
                        block lands in the Planning Workspace for review.
                      </p>
                    )}
                  </Collapse>

                  <div className="grid grid-cols-2 gap-2">
                    {active === "reserve" ? (
                      <Button onClick={() => onSimulate("relief")}>Run simulation →</Button>
                    ) : (
                      <>
                        <Button onClick={onRunPlan}>Run plan →</Button>
                        <Button variant="secondary" onClick={() => onSimulate(null)}>
                          Simulate
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-start gap-2 border-t border-[#eef0f6] bg-[#f5f6fc] px-4 py-2.5 text-[10px] leading-relaxed text-[#878da1]">
          <Info size={12} className="mt-0.5 shrink-0" style={{ color: PRIMARY }} />
          {ADVISORY}
        </footer>
      </aside>
    </div>
  );
}

export default Assistant;