// ---------------------------------------------------------------------------
// Shared detail drawers — progressive disclosure: click a compact card
// anywhere → right-side drawer opens → close → back to the clean view.
// ---------------------------------------------------------------------------
import { Check, X } from "lucide-react";
import { Drawer, Collapse, KV, Chip, TierChip, DeptChip, SourceChip, ReasonChip, CompatChip, REASON_META, PRIMARY, OK, CRIT, WARN, NEUTRAL } from "./ui";
import type { ReactNode } from "react";
import { jobById, jobOps, type Job, type CompatGroup } from "../data/jobsData";
import { blockWindows, corridorLabel, existingBlocks, trains, type Alert } from "../data/opsData";
import { recommendedPlan, conflictNext, weekDetail, type ConflictEntry } from "../data/planData";
import type { AffectedTrain, DeferredJob } from "../api/planner";

/* ------------------------------ window ref -------------------------------- */

export interface WinRef {
  id: string;
  label: string;
  corridorId: string;
  start: string;
  end: string;
  minutes: number;
  kind: "proposed" | "existing";
  note?: string;
  blockId?: string;
  status?: string;
  work?: string;
}

/* ------------------------------- job drawer ------------------------------- */

export function JobDrawer({ job, onClose }: { job: Job; onClose: () => void }) {
  const ops = jobOps[job.id];
  const sched = recommendedPlan.assignments.find((a) => a.jobId === job.id);
  const def = recommendedPlan.deferred.find((d) => d.jobId === job.id);
  const overdue = job.deadline.startsWith("Overdue") || job.deadline.startsWith("Immediate");
  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <span>
          <span className="font-mono text-[#878da1]">{job.id}</span> · {job.title}
        </span>
      }
      subtitle={`${job.source} feed · ${corridorLabel(job.corridorId)}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <DeptChip dept={job.dept} />
        <SourceChip source={job.source} />
        <TierChip tier={job.tier} />
        {job.needsPowerIsolation && (
          <span className="rounded border border-[#2e3092]/40 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-[#2e3092]">
            PWR ISO
          </span>
        )}
        {sched && <Chip label="Scheduled tonight" color={OK} bg="#f0fdf4" />}
        {def && <ReasonChip code={def.code} />}
      </div>
      <div className="mb-3 rounded-lg border border-[#e3e6f0] bg-[#f5f6fc] px-3 py-2.5">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">Why this tier</div>
        <p className="mt-1 leading-relaxed text-[#171a30]">{job.tierReason}</p>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-[#e3e6f0] px-2 py-1.5 text-center">
          <div className="font-mono text-sm font-extrabold text-[#171a30]">{job.minutes}m</div>
          <div className="text-[9px] uppercase tracking-wider text-[#878da1]">duration</div>
        </div>
        <div className="rounded-lg border border-[#e3e6f0] px-2 py-1.5 text-center">
          <div className={`font-mono text-[11px] font-extrabold leading-5 ${overdue ? "text-[#dc2626]" : "text-[#171a30]"}`}>
            {ops?.due ?? "—"}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-[#878da1]">due</div>
        </div>
        <div className="rounded-lg border border-[#e3e6f0] px-2 py-1.5 text-center">
          <div className="font-mono text-[11px] font-extrabold leading-5 text-[#171a30]">
            {sched ? `${sched.start}–${sched.end}` : def ? "deferred" : "open"}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-[#878da1]">window</div>
        </div>
      </div>
      {def && (
        <div className="mb-3 rounded-lg border border-[#d97706]/30 bg-[#fffbeb] px-3 py-2 text-[11px] leading-relaxed text-[#92400e]">
          <span className="font-bold">Deferral: </span>
          {def.reason}
        </div>
      )}
      <div className="space-y-2">
        <Collapse title="Asset & block requirements">
          <KV k="Asset" v={job.asset} />
          <KV k="Corridor" v={corridorLabel(job.corridorId)} />
          <KV k="Isolation" v={job.needsPowerIsolation ? "TRD power isolation required" : "Standard traffic block"} />
        </Collapse>
        <Collapse title="Resources">
          <ul className="space-y-1">
            {job.resources.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-[#a2a7ba]">·</span>
                {r}
              </li>
            ))}
          </ul>
        </Collapse>
        {ops && <Collapse title="History">{ops.history}</Collapse>}
        {ops && <Collapse title="Risk / context">{ops.risk}</Collapse>}
      </div>
    </Drawer>
  );
}

/* ------------------------------ train drawer ------------------------------ */

export function TrainDrawer({ trainId, onClose }: { trainId: string; onClose: () => void }) {
  const train = trains.find((t) => t.id === trainId);
  if (!train) return null;
  const key = train.number.split("-")[0];
  const regulated = recommendedPlan.trainImpact.filter((t) => t.startsWith(key));
  const typeMeta =
    train.type === "special"
      ? { label: "Special / secure", color: CRIT, bg: "#fef2f2" }
      : train.type === "passenger"
        ? { label: "Passenger", color: OK, bg: "#f0fdf4" }
        : { label: "Freight", color: NEUTRAL, bg: "#f1f3f9" };
  return (
    <Drawer
      open
      onClose={onClose}
      title={`${train.number} · ${train.name}`}
      subtitle={`${corridorLabel(train.corridorId)} · ${train.start}–${train.end} IST`}
    >
      <div className="mb-3 flex gap-1.5">
        <Chip label={typeMeta.label} color={typeMeta.color} bg={typeMeta.bg} />
        <Chip label={train.type === "special" ? "SECURE" : "PATH OK"} color={PRIMARY} bg="#eef0fa" />
      </div>
      <div className="rounded-lg border border-[#e3e6f0] px-3 py-2">
        <KV k="Corridor" v={corridorLabel(train.corridorId)} />
        <KV k="Path" v={`${train.start} – ${train.end} IST`} />
        {train.note && <KV k="Note" v={train.note} />}
      </div>
      <div className="mt-3">
        <Collapse title="Plan impact">
          {regulated.length ? (
            <ul className="space-y-1">
              {regulated.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-[#a2a7ba]">·</span>
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <p>No regulation from the recommended plan.</p>
          )}
        </Collapse>
      </div>
    </Drawer>
  );
}

/* ------------------------------ alert drawer ------------------------------ */

export function AlertDrawer({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const sevMeta =
    alert.severity === "critical"
      ? { color: CRIT, bg: "#fef2f2" }
      : alert.severity === "warning"
        ? { color: WARN, bg: "#fffbeb" }
        : { color: PRIMARY, bg: "#eef0fa" };
  return (
    <Drawer
      open
      onClose={onClose}
      title={<span style={{ color: sevMeta.color }}>{alert.title}</span>}
      subtitle={`${alert.severity.toUpperCase()} · ${alert.time} IST${alert.section ? ` · ${alert.section}` : ""}`}
    >
      <p className="mb-3 leading-relaxed text-[#171a30]">{alert.text}</p>
      <div className="space-y-2">
        <div
          className={`rounded-lg border px-3 py-2 ${
            alert.severity === "critical" ? "border-[#fecaca] bg-[#fef2f2]" : "border-[#fde68a] bg-[#fffbeb]"
          }`}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: sevMeta.color }}>
            Operational consequence
          </div>
          <p className="mt-1 leading-relaxed text-[#4d5468]">{alert.consequence}</p>
        </div>
        <div className="rounded-lg border border-[#d9ddef] bg-[#f5f6fc] px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#2e3092]">Recommended action</div>
          <p className="mt-1 leading-relaxed text-[#171a30]">{alert.action}</p>
        </div>
        {alert.jobId && <JobTrigger jobId={alert.jobId} />}
      </div>
    </Drawer>
  );
}

/** Small inline note inside a drawer pointing at the related job. */
function JobTrigger({ jobId }: { jobId: string }) {
  const job = jobById(jobId);
  if (!job) return null;
  return (
    <div className="rounded-lg border border-[#e3e6f0] px-3 py-2 text-[11px] text-[#4d5468]">
      Related job: <span className="font-mono font-bold text-[#2e3092]">{job.id}</span> — {job.title}
    </div>
  );
}

/* ----------------------------- window drawer ------------------------------ */

export function WindowDrawer({
  win,
  onClose,
  actions,
}: {
  win: WinRef;
  onClose: () => void;
  actions?: ReactNode;
}) {
  const isProposed = win.kind === "proposed";
  const windowDef = blockWindows.find((w) => w.id === win.id);
  const blockDef = existingBlocks.find((b) => b.id === win.id);
  const jobsInWindow = recommendedPlan.assignments.filter((a) => a.windowId === win.id);
  return (
    <Drawer
      open
      onClose={onClose}
      title={isProposed ? `Maintenance window ${win.id}` : `Sanctioned block ${win.blockId}`}
      subtitle={`${corridorLabel(win.corridorId)} · ${win.start}–${win.end} · ${win.minutes} min`}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {isProposed ? (
          <Chip label="Proposed window" color={PRIMARY} bg="#eef0fa" />
        ) : (
          <Chip
            label={blockDef?.status === "approved" ? "Sanctioned" : "Pending sanction"}
            color={blockDef?.status === "approved" ? OK : WARN}
            bg={blockDef?.status === "approved" ? "#f0fdf4" : "#fffbeb"}
          />
        )}
        {jobsInWindow.length > 0 && (
          <Chip label={`${jobsInWindow.length} job${jobsInWindow.length > 1 ? "s" : ""}`} color={NEUTRAL} bg="#f1f3f9" />
        )}
      </div>

      <div className="mb-3 rounded-lg border border-[#e3e6f0] px-3 py-2">
        <KV k="Corridor" v={corridorLabel(win.corridorId)} />
        <KV k="Window" v={`${win.start} – ${win.end} IST`} />
        <KV k="Duration" v={`${win.minutes} min`} />
        {isProposed && windowDef && <KV k="Note" v={windowDef.note} />}
        {!isProposed && blockDef && <KV k="Work" v={blockDef.work} />}
      </div>

      {jobsInWindow.length > 0 ? (
        <Collapse title={`Jobs in this window (${jobsInWindow.length})`} defaultOpen>
          <div className="space-y-1.5">
            {jobsInWindow.map((a) => {
              const j = jobById(a.jobId);
              return (
                <div key={a.jobId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] text-[#171a30]">
                    <span className="font-mono font-bold text-[#2e3092]">{a.jobId}</span> · {j?.title}
                    {a.parallel ? " (parallel)" : ""}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-[#878da1]">
                    {a.start}–{a.end}
                  </span>
                </div>
              );
            })}
          </div>
        </Collapse>
      ) : (
        <div className="mb-2 rounded-lg border border-[#e3e6f0] bg-[#f5f6fc] px-3 py-2 text-[11px] text-[#4d5468]">
          {isProposed
            ? "No maintenance planned in this window yet."
            : "No recommended-plan work rides inside this sanctioned block."}
        </div>
      )}

      <div className="mt-2 space-y-2">
        <Collapse title="Train impact">
          {recommendedPlan.trainImpact.length === 0 ? (
            <p>No movements affected.</p>
          ) : (
            <ul className="space-y-1">
              {recommendedPlan.trainImpact.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-[#a2a7ba]">·</span>
                  {t}
                </li>
              ))}
            </ul>
          )}
        </Collapse>
        <Collapse title="Why selected">
          {isProposed
            ? `${win.note ?? "Traffic gap between premier paths"} — compatible work is consolidated into one possession without splitting safety-critical jobs.`
            : "Already sanctioned by the control office — recommended work rides inside it where compatible."}
        </Collapse>
        <Collapse title={`Deferred work (${recommendedPlan.deferred.length})`}>
          <div className="space-y-1.5">
            {recommendedPlan.deferred.map((d) => (
              <div key={d.jobId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] text-[#171a30]">
                  {d.jobId} · {jobById(d.jobId)?.title}
                </span>
                <ReasonChip code={d.code} />
              </div>
            ))}
          </div>
        </Collapse>
      </div>

      {actions && <div className="mt-4">{actions}</div>}
    </Drawer>
  );
}

/* ---------------------------- compatibility drawer ------------------------ */

const COMPAT_CHECKS: Record<CompatGroup["status"], { ok: boolean; text: string }[]> = {
  Compatible: [
    { ok: true, text: "Isolation compatible — standard traffic block only" },
    { ok: true, text: "No resource conflict" },
    { ok: true, text: "Dependencies satisfied" },
    { ok: true, text: "Parallel execution permitted" },
  ],
  Conditional: [
    { ok: false, text: "Isolation conflict — TRD feed must be certified before S&T powered testing" },
    { ok: true, text: "No resource conflict once the certification is in hand" },
    { ok: true, text: "Dependencies satisfied in strict sequence" },
    { ok: false, text: "Parallel execution NOT permitted — sequential only" },
  ],
  Incompatible: [
    { ok: false, text: "Isolation conflict — work methods are mutually unsafe" },
    { ok: false, text: "No safe line-side access for a second party" },
    { ok: true, text: "Dependencies clear — but the method itself forbids combining" },
    { ok: false, text: "Joint execution not permitted" },
  ],
};

export function CompatDrawer({ group, onClose }: { group: CompatGroup; onClose: () => void }) {
  const depts = [...new Set(group.jobIds.map((id) => jobById(id)?.dept ?? ""))];
  return (
    <Drawer
      open
      onClose={onClose}
      title={`Compatibility check · ${group.id}`}
      subtitle={`${corridorLabel(group.corridorId)} · ${group.jobIds.length} jobs`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <CompatChip status={group.status} />
        {depts.map((d) => (
          <DeptChip key={d} dept={d} />
        ))}
      </div>

      <div className="mb-3 rounded-lg border border-[#e3e6f0] px-3 py-2">
        {group.jobIds.map((id) => {
          const j = jobById(id);
          return (
            <div key={id} className="flex items-center justify-between gap-2 py-0.5">
              <span className="min-w-0 truncate text-[11px] text-[#171a30]">
                <span className="font-mono font-bold text-[#2e3092]">{id}</span> · {j?.dept} — {j?.title}
              </span>
              {j && <TierChip tier={j.tier} compact />}
            </div>
          );
        })}
      </div>

      <div className="mb-3 space-y-1.5">
        {COMPAT_CHECKS[group.status].map((c) => (
          <div
            key={c.text}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
              c.ok ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]" : "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
            }`}
          >
            {c.ok ? <Check size={13} className="mt-0.5 shrink-0" /> : <X size={13} className="mt-0.5 shrink-0" />}
            {c.text}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-[#e3e6f0] px-3 py-2">
        <KV k="Possession" v={group.possession} />
        <KV k="Execution" v={group.execution} />
        <KV k="Setup" v={group.setupHandover} />
        <KV k="Resources" v={group.resources} />
      </div>

      <div className="mt-3 rounded-lg border border-[#d9ddef] bg-[#f5f6fc] px-3 py-2.5">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[#2e3092]">Why</div>
        <p className="mt-1 leading-relaxed text-[#171a30]">{group.rationale}</p>
      </div>
    </Drawer>
  );
}

/* ----------------------------- conflict drawer ----------------------------- */

export function ConflictDrawer({ entry, onClose }: { entry: ConflictEntry; onClose: () => void }) {
  const jobId = entry.subject.match(/^([A-Z]-\d+)/)?.[1];
  const next = jobId ? conflictNext[jobId] : undefined;
  return (
    <Drawer open onClose={onClose} title={entry.subject} subtitle="Why this happened">
      <div className="mb-3">
        <ReasonChip code={entry.code} />
      </div>
      <div className="space-y-2">
        <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#dc2626]">What</div>
          <p className="mt-1 leading-relaxed text-[#171a30]">{entry.what}</p>
        </div>
        <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#d97706]">What it means</div>
          <p className="mt-1 leading-relaxed text-[#171a30]">{entry.means}</p>
        </div>
        <div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#16a34a]">Next opportunity</div>
          <p className="mt-1 leading-relaxed text-[#171a30]">{next ?? entry.remedy}</p>
        </div>
      </div>
    </Drawer>
  );
}

/* --------------------------- deferral reason drawer ------------------------ */
// Feature 23 — "Why wasn't this scheduled?".
// Every reason code, explanation and next-opportunity string is rendered
// EXACTLY as the API layer returned it; only the constraint LABELS are looked
// up from the shared REASON_META map. No reason text is written in React.

export function ReasonDrawer({
  deferral,
  jobTitle,
  attemptedWindow,
  affectedTrains,
  windowNote,
  source,
  onClose,
}: {
  deferral: DeferredJob;
  /** Job title from the planner payload (optional). */
  jobTitle?: string;
  /** Window the job was aimed at — hidden when unknown. */
  attemptedWindow?: string | null;
  /** Corridor movements relevant to this deferral — hidden when empty. */
  affectedTrains?: AffectedTrain[];
  /** Window note from getWindowDetails() (optional). */
  windowNote?: string;
  /** Where the payload came from — a small hint, never an error. */
  source?: string;
  onClose: () => void;
}) {
  const codes = deferral.reasonCodes?.length ? deferral.reasonCodes : [deferral.code];
  const labels = codes.map((code) => REASON_META[code]?.label ?? code);
  const explanations = deferral.explanations;
  const explanationRows: [string, string][] = explanations
    ? ([
        ["What happened", explanations.what],
        ["What it means", explanations.means],
        ["Recommended remedy", explanations.remedy],
      ].filter(([, text]) => Boolean(text && text.trim())) as [string, string][])
    : [];
  const resources = deferral.resources ?? [];
  const trainList = affectedTrains ?? [];
  const hasContext = Boolean(attemptedWindow) || trainList.length > 0 || resources.length > 0;
  const corridor = deferral.corridorId ? corridorLabel(deferral.corridorId) : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <span className="truncate">
          <span className="font-mono text-[#878da1]">{deferral.jobId}</span>
          {jobTitle ? ` — ${jobTitle}` : ""}
        </span>
      }
      subtitle="Why this job was not scheduled"
      footer={
        <p className="text-[10px] leading-relaxed text-[#878da1]">
          Advisory only — deferrals are explained here, never authorized. Approval happens in Human
          Approval.
        </p>
      }
    >
      {/* ------------------------------- header ------------------------------ */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {deferral.department && <DeptChip dept={deferral.department} />}
        {deferral.tier !== undefined && <TierChip tier={deferral.tier} />}
        <Chip label="Not scheduled" color={WARN} bg="#fffbeb" />
        {corridor && <Chip label={corridor} color={NEUTRAL} bg="#f1f3f9" />}
      </div>

      <div className="mb-3 rounded-lg border border-[#e3e6f0] px-3 py-1">
        {deferral.minutes !== undefined && <KV k="Work duration" v={`${deferral.minutes} min`} />}
        {deferral.status && <KV k="Status" v={deferral.status} />}
        {source && <KV k="Plan source" v={source} />}
      </div>

      {/* -------------------------- binding constraints ---------------------- */}
      <div className="mb-3">
        <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#878da1]">
          Binding constraints
        </div>
        {codes.length ? (
          <div className="flex flex-wrap gap-1.5">
            {codes.map((code) => (
              <ReasonChip key={code} code={code} />
            ))}
          </div>
        ) : (
          <p className="text-[11px] italic text-[#878da1]">
            No constraint code was reported by the planner.
          </p>
        )}
        {labels.length > 0 && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#4d5468]">{labels.join(" · ")}</p>
        )}
      </div>

      {/* ------------------------ operational explanation -------------------- */}
      <div className="mb-3 space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#878da1]">
          Operational explanation
        </div>
        {deferral.reason ? (
          <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2">
            <p className="leading-relaxed text-[#171a30]">{deferral.reason}</p>
          </div>
        ) : null}
        {explanationRows.map(([label, text]) => (
          <div key={label} className="rounded-lg border border-[#e3e6f0] bg-[#f5f6fc] px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
              {label}
            </div>
            <p className="mt-1 leading-relaxed text-[#171a30]">{text}</p>
          </div>
        ))}
        {!deferral.reason && explanationRows.length === 0 && (
          <p className="text-[11px] italic text-[#878da1]">
            The planner returned no explanation for this deferral.
          </p>
        )}
      </div>

      {/* --------------------------- operational context --------------------- */}
      {hasContext && (
        <div className="mb-3">
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#878da1]">
            Operational context
          </div>
          <div className="rounded-lg border border-[#e3e6f0] px-3 py-1">
            {attemptedWindow && <KV k="Affected window" v={attemptedWindow} />}
            {windowNote && <KV k="Window note" v={windowNote} />}
          </div>
          {trainList.length > 0 && (
            <div className="mt-2">
              <Collapse
                title={`Affected train${trainList.length > 1 ? "s" : ""} (${trainList.length})`}
              >
                <ul className="space-y-1">
                  {trainList.map((train) => (
                    <li key={train.id} className="flex gap-2">
                      <span className="text-[#a2a7ba]">·</span>
                      <span className="min-w-0">
                        <span className="font-mono font-bold text-[#2e3092]">{train.number}</span>{" "}
                        {train.name}
                        <span className="ml-1 text-[#878da1]">
                          {train.start}–{train.end} · {train.type}
                        </span>
                        {train.note ? (
                          <span className="block text-[#878da1]">{train.note}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </Collapse>
            </div>
          )}
          {resources.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                Resource
              </span>
              {resources.map((resource) => (
                <span
                  key={resource}
                  className="rounded-full border border-[#e3e6f0] bg-[#f5f6fc] px-2 py-0.5 font-mono text-[10px] text-[#4d5468]"
                >
                  {resource}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------- next opportunity ---------------------- */}
      {deferral.nextFeasibleWindow && (
        <div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#16a34a]">
            Next opportunity
          </div>
          <p className="mt-1 leading-relaxed text-[#171a30]">{deferral.nextFeasibleWindow}</p>
        </div>
      )}
    </Drawer>
  );
}

/* ------------------------------- day drawer ------------------------------- */

export function DayDrawer({ date, day, onClose }: { date: string; day: string; onClose: () => void }) {
  const d = weekDetail[date];
  return (
    <Drawer open onClose={onClose} title={`${day} ${date}`} subtitle="Planning day detail">
      {!d ? (
        <p className="text-[11px] italic text-[#878da1]">No planned blocks — routine running only.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Chip label={`${d.blocks.length} blocks`} color={PRIMARY} bg="#eef0fa" />
            {d.critical > 0 && <Chip label={`${d.critical} critical`} color={CRIT} bg="#fef2f2" />}
            {d.alert && <Chip label={d.alert} color={WARN} bg="#fffbeb" />}
          </div>
          <div className="space-y-2">
            <Collapse title={`Blocks (${d.blocks.length})`} defaultOpen>
              <div className="space-y-1">
                {d.blocks.map((b) => (
                  <div key={b} className="flex gap-2">
                    <span className="text-[#a2a7ba]">·</span>
                    {b}
                  </div>
                ))}
              </div>
            </Collapse>
            <Collapse title={`Maintenance jobs (${d.jobs.length})`}>
              <div className="space-y-1">
                {d.jobs.map((j) => (
                  <div key={j} className="flex gap-2">
                    <span className="text-[#a2a7ba]">·</span>
                    {j}
                  </div>
                ))}
              </div>
            </Collapse>
            <Collapse title={`Deferred (${d.deferred.length})`}>
              {d.deferred.length ? (
                <div className="space-y-1">
                  {d.deferred.map((j) => (
                    <div key={j} className="flex gap-2">
                      <span className="text-[#a2a7ba]">·</span>
                      {j}
                    </div>
                  ))}
                </div>
              ) : (
                <p>Nothing deferred.</p>
              )}
            </Collapse>
            <Collapse title={`Train impact (${d.impact.length})`}>
              <div className="space-y-1">
                {d.impact.map((i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-[#a2a7ba]">·</span>
                    {i}
                  </div>
                ))}
              </div>
            </Collapse>
            <Collapse title="Resources">
              <div className="space-y-1">
                {d.resources.map((r) => (
                  <div key={r} className="flex gap-2">
                    <span className="text-[#a2a7ba]">·</span>
                    {r}
                  </div>
                ))}
              </div>
            </Collapse>
            <Collapse title="Daily notes">{d.notes}</Collapse>
          </div>
        </>
      )}
    </Drawer>
  );
}