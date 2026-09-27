// ---------------------------------------------------------------------------
// UI primitives — light, calm, operational. Primary #2E3092.
// Red = critical only · amber = warning only · green = success/clear only.
// Departments have NO dedicated colors (neutral chips).
// ---------------------------------------------------------------------------
import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/* --------------------------------- nav ----------------------------------- */

export type ViewId = "command" | "network" | "workspace" | "simulation" | "approval";

/* ----------------------------- color tokens ------------------------------- */

export const PRIMARY = "#2e3092";
export const PRIMARY_SOFT = "#eef0fa";
export const INK = "#171a30";
export const CRIT = "#dc2626";
export const CRIT_BG = "#fef2f2";
export const WARN = "#d97706";
export const WARN_BG = "#fffbeb";
export const OK = "#16a34a";
export const OK_BG = "#f0fdf4";
export const NEUTRAL = "#4d5468";
export const NEUTRAL_BG = "#f1f3f9";

export const TIER_META: Record<number, { label: string; short: string; color: string; bg: string }> = {
  0: { label: "Mandatory / Safety", short: "T0", color: CRIT, bg: CRIT_BG },
  1: { label: "Critical + Imminent", short: "T1", color: CRIT, bg: CRIT_BG },
  2: { label: "Critical / Overdue", short: "T2", color: WARN, bg: WARN_BG },
  3: { label: "High Priority", short: "T3", color: PRIMARY, bg: PRIMARY_SOFT },
  4: { label: "Routine / Deferrable", short: "T4", color: NEUTRAL, bg: NEUTRAL_BG },
};

export const REASON_META: Record<string, { label: string; color: string; bg: string }> = {
  INSUFFICIENT_WINDOW: { label: "Insufficient window", color: WARN, bg: WARN_BG },
  TRAIN_CONFLICT: { label: "Train conflict", color: CRIT, bg: CRIT_BG },
  RESOURCE_CONFLICT: { label: "Resource conflict", color: PRIMARY, bg: PRIMARY_SOFT },
  ISOLATION_CONFLICT: { label: "Isolation conflict", color: WARN, bg: WARN_BG },
  INCOMPATIBLE_WORK: { label: "Incompatible maintenance", color: CRIT, bg: CRIT_BG },
  LOWER_PRIORITY: { label: "Higher-priority work", color: NEUTRAL, bg: NEUTRAL_BG },
  NO_FEASIBLE_WINDOW: { label: "No feasible window", color: WARN, bg: WARN_BG },
  PROTECTED_MOVEMENT_CONFLICT: { label: "Protected movement", color: CRIT, bg: CRIT_BG },
  BLOCK_CAPACITY: { label: "Block capacity", color: WARN, bg: WARN_BG },
  SECTION_RESTRICTION: { label: "Section restriction", color: WARN, bg: WARN_BG },
  LOCKED_ASSIGNMENT_CONFLICT: { label: "Locked assignment", color: PRIMARY, bg: PRIMARY_SOFT },
};

const COMPAT_META: Record<string, { color: string; bg: string }> = {
  Compatible: { color: OK, bg: OK_BG },
  Conditional: { color: WARN, bg: WARN_BG },
  Incompatible: { color: CRIT, bg: CRIT_BG },
};

/* ------------------------------- primitives ------------------------------- */

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-150 ease-out focus-primary disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]";
  const styles: Record<string, string> = {
    primary: "bg-[#2e3092] text-white hover:bg-[#24266f] hover:shadow-sm active:bg-[#1f215e]",
    secondary: "border border-[#d9ddef] bg-white text-[#171a30] hover:bg-[#eef0fa] hover:border-[#c4c9e2] hover:shadow-xs",
    ghost: "text-[#2e3092] hover:bg-[#eef0fa]",
    danger: "border border-[#fecaca] bg-white text-[#dc2626] hover:bg-[#fef2f2] hover:border-[#fca5a5]",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  // Flat by design: sections are surfaces, not floating objects. Elevation is
  // reserved for overlays (drawers/tooltips) so hierarchy comes from content.
  return <div className={`rounded-lg border border-[#e3e6f0] bg-white ${className}`}>{children}</div>;
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#171a30]/80 bg-[#171a30] px-2 py-1 text-[10px] font-medium leading-tight text-white shadow-md animate-in fade-in zoom-in-95 duration-100"
        >
          {content}
          <div className="absolute top-full left-1/2 -mt-1 -translate-x-1/2 border-4 border-transparent border-t-[#171a30]" />
        </div>
      )}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="section-title text-[#171a30]">{title}</h2>
        {subtitle && <p className="mt-1 text-xs leading-snug text-[#878da1]">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Chip({
  label,
  color,
  bg,
  pulse,
}: {
  label: string;
  color: string;
  bg: string;
  pulse?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ color, background: bg, border: `1px solid ${color}33` }}
    >
      {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: color }} />}
      {label}
    </span>
  );
}

export function TierChip({ tier, compact }: { tier: number; compact?: boolean }) {
  const m = TIER_META[tier];
  if (compact)
    return (
      <span
        className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-extrabold"
        style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}44` }}
        title={m.label}
      >
        {m.short}
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}44` }}
    >
      <span className="rounded-sm px-1 font-mono" style={{ background: m.color, color: "#ffffff" }}>
        {m.short}
      </span>
      {m.label}
    </span>
  );
}

export function DeptChip({ dept }: { dept: string }) {
  return <Chip label={dept} color={NEUTRAL} bg={NEUTRAL_BG} />;
}

export function SourceChip({ source }: { source: string }) {
  return (
    <span className="rounded border border-[#e3e6f0] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-[#878da1]">
      {source}
    </span>
  );
}

export function ReasonChip({ code }: { code: string }) {
  const m = REASON_META[code] ?? { label: code, color: NEUTRAL, bg: NEUTRAL_BG };
  return <Chip label={m.label} color={m.color} bg={m.bg} />;
}

export function CompatChip({ status }: { status: string }) {
  const m = COMPAT_META[status] ?? COMPAT_META.Conditional;
  return <Chip label={status} color={m.color} bg={m.bg} />;
}

export function Dot({ tone, pulse }: { tone: string; pulse?: boolean }) {
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${pulse ? "animate-pulse" : ""}`}
      style={{ background: tone }}
    />
  );
}

/**
 * MetricCard — THE metric tile. Three hierarchy levels per the information
 * hierarchy spec: primary (32px, decision-critical), standard (24px,
 * decision support), context (17px, quiet). Flat, never floating.
 */
export function MetricCard({
  label,
  value,
  context,
  tone = INK,
  level = "standard",
  badge,
  className = "",
}: {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  tone?: string;
  level?: "primary" | "standard" | "context";
  badge?: ReactNode;
  className?: string;
}) {
  const valueCls =
    level === "primary" ? "metric-xl" : level === "standard" ? "metric-lg" : "value-lg";
  const border = level === "primary" ? `2px solid ${tone}55` : "1px solid #e3e6f0";
  return (
    <div
      className={`rounded-lg bg-white px-4 py-3 ${className}`}
      style={{ border }}
      title={typeof context === "string" ? context : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`${valueCls} min-w-0 font-mono`} style={{ color: tone }}>
          {value}
        </div>
        {badge}
      </div>
      <div className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#878da1]">
        {label}
      </div>
      {context && (
        <div className="mt-0.5 truncate text-[11px] leading-snug text-[#4d5468]">{context}</div>
      )}
    </div>
  );
}

/** KPI — one number, one label, one short context line (legacy alias). */
export function Kpi({
  value,
  label,
  context,
  tone = "#171a30",
}: {
  value: string;
  label: string;
  context: string;
  tone?: string;
}) {
  return <MetricCard level="standard" label={label} value={value} context={context} tone={tone} />;
}

/** Key → value row used inside drawers. */
export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">{k}</span>
      <span className="text-right text-[11px] leading-relaxed text-[#171a30]">{v}</span>
    </div>
  );
}

/** Right-side detail drawer — the standard click → details → close pattern. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="drawer-overlay absolute inset-0 bg-[#171a30]/25" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className="drawer-panel thin-scroll absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-[#e3e6f0] bg-white shadow-[-24px_0_60px_rgba(23,26,48,0.25)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#eef0f6] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-[#171a30]">{title}</div>
            {subtitle && <div className="mt-0.5 truncate font-mono text-[10px] text-[#878da1]">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            autoFocus
            aria-label="Close details"
            className="focus-primary shrink-0 rounded-md border border-[#e3e6f0] p-1.5 text-[#878da1] transition-colors duration-200 hover:border-[#d9ddef] hover:text-[#171a30]"
          >
            <X size={14} />
          </button>
        </header>
        <div className="thin-scroll flex-1 overflow-y-auto p-4 text-[#171a30]">{children}</div>
        {footer && <div className="border-t border-[#eef0f6] bg-white p-3">{footer}</div>}
      </aside>
    </div>
  );
}

/** Collapsible — secondary information stays hidden until asked for. */
export function Collapse({
  title,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-[#e3e6f0] bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="focus-primary flex w-full items-center gap-2 px-3 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
      >
        <span className="text-[#878da1]">{open ? "▾" : "▸"}</span>
        <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-[#4d5468]">{title}</span>
        <span className="w-3 text-center text-[11px] font-bold text-[#a2a7ba]">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-[#eef0f6] px-3 py-2.5 text-[11px] leading-relaxed text-[#4d5468]">
          {children}
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
   INFORMATION-HIERARCHY COMPONENTS (three levels · one visual language)
   =========================================================================== */

/** L3 — context/audit metadata: ids, versions, backend provenance, timestamps. */
export function MetaText({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`meta-mono inline-block ${className}`}>{children}</span>;
}

/** Page header — one per screen: 25px title, muted subtitle, meta line, right slot. */
export function PageHeader({
  title,
  subtitle,
  meta,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title text-[#171a30]">{title}</h1>
        {subtitle && <div className="mt-1 text-[13px] leading-snug text-[#4d5468]">{subtitle}</div>}
        {meta && <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">{meta}</div>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/** Semantic state badge — ONLY for states requiring interpretation. */
export function StatusBadge({
  label,
  tone = NEUTRAL,
  pulse = false,
}: {
  label: string;
  tone?: string;
  pulse?: boolean;
}) {
  return <Chip label={label} color={tone} bg={`${tone}14`} pulse={pulse} />;
}

/** Label → value row (Level 2 support information in panels). */
export function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#eef0f6] py-2 last:border-0">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#878da1]">
        {label}
      </span>
      <span
        className="text-right text-[13px] font-semibold leading-snug text-[#171a30]"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * SectionBlock — supporting section surface (NOT a card): flat white panel
 * with a consistent title row. For secondary/Level-2 content grouping.
 */
export function SectionBlock({
  title,
  right,
  description,
  children,
  className = "",
}: {
  title: string;
  right?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-[#e3e6f0] bg-white ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef0f6] px-4 py-3">
        <div className="min-w-0">
          <h2 className="section-title text-[#171a30]">{title}</h2>
          {description && (
            <div className="mt-0.5 text-[11px] leading-snug text-[#878da1]">{description}</div>
          )}
        </div>
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/**
 * DecisionCard — THE recommendation/action surface. Visually distinct from
 * SectionBlock: primary-tinted header, stronger border. Use only for what the
 * system recommends or what the officer must decide.
 */
export function DecisionCard({
  title,
  accent = PRIMARY,
  badge,
  children,
  className = "",
}: {
  title: string;
  accent?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border bg-white ${className}`}
      style={{ borderColor: `${accent}55` }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
        style={{ borderBottom: `1px dashed ${accent}44`, background: `${accent}08` }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: accent }} />
          <h2 className="section-title" style={{ color: accent }}>
            {title}
          </h2>
        </div>
        {badge}
      </header>
      <div className="h-full px-4 py-3">{children}</div>
    </section>
  );
}

/**
 * DecisionSummary — "what am I approving" header block: headline, supporting
 * line, and a row of Level-1 metric numbers.
 */
export function DecisionSummary({
  headline,
  subline,
  metrics,
}: {
  headline: ReactNode;
  subline?: ReactNode;
  metrics: { label: string; value: ReactNode; tone?: string }[];
}) {
  return (
    <div>
      <div className="value-lg text-[#171a30]">{headline}</div>
      {subline && <div className="mt-0.5 text-[13px] text-[#4d5468]">{subline}</div>}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {metrics.map((m) => (
          <div key={m.label}>
            <div
              className="font-mono text-[26px] font-bold leading-none"
              style={{ color: m.tone ?? INK }}
            >
              {m.value}
            </div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
              {m.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** ActionBar — the row of actions for a decision moment. */
export function ActionBar({
  children,
  align = "end",
  className = "",
}: {
  children: ReactNode;
  align?: "start" | "end" | "between";
  className?: string;
}) {
  const justify =
    align === "start" ? "justify-start" : align === "between" ? "justify-between" : "justify-end";
  return <div className={`flex flex-wrap items-center gap-2 ${justify} ${className}`}>{children}</div>;
}

/**
 * DataTable — one table language everywhere: consistent header styling,
 * dividers, and horizontal scroll on narrow screens.
 */
export function DataTable({
  columns,
  children,
  className = "",
}: {
  columns: { key: string; label: string; className?: string }[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[#e3e6f0]">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#878da1] ${c.className ?? ""}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Row class for DataTable bodies — one divider language. */
export const DATA_ROW =
  "border-b border-[#eef0f6] last:border-0 transition-colors duration-150 hover:bg-[#f8f9fd]";

/** Quiet empty state — one pattern for "nothing here yet". */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[#d9ddef] bg-[#fbfcfe] px-4 py-6 text-center">
      <div className="text-[13px] font-semibold text-[#4d5468]">{title}</div>
      {hint && <div className="mt-1 text-xs text-[#878da1]">{hint}</div>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/** Toolbar — one bordered control row for search/filter/fit actions. */
export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border border-[#e3e6f0] bg-white px-3 py-2 ${className}`}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* WHY? — the global explain pattern. Always driven by real reason codes /     */
/* planner data; never fabricates an explanation.                              */
/* -------------------------------------------------------------------------- */

export interface WhyRow {
  label: string;
  value: ReactNode;
  tone?: string;
  /** Optional link-style action, e.g. "View affected train". */
  action?: { label: string; onClick: () => void };
}

export function WhyDrawer({
  open,
  question,
  primaryLabel,
  primaryValue,
  primaryTone = NEUTRAL,
  primaryExplanation,
  rows = [],
  footer,
  onClose,
}: {
  open: boolean;
  question: string;
  primaryLabel: string;
  primaryValue: string;
  primaryTone?: string;
  primaryExplanation?: ReactNode;
  rows?: WhyRow[];
  footer?: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Drawer
      open
      onClose={onClose}
      title={<span className="text-[13px] font-bold uppercase tracking-wider">{question}</span>}
      subtitle="Backend planner reason codes"
      footer={footer}
    >
      <div className="mb-4 rounded-lg px-3 py-3" style={{ background: `${primaryTone}10`, border: `1px solid ${primaryTone}44` }}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
          {primaryLabel}
        </div>
        <div className="mt-1 text-[15px] font-extrabold uppercase tracking-wide" style={{ color: primaryTone }}>
          {primaryValue}
        </div>
        {primaryExplanation && (
          <p className="mt-2 text-xs leading-relaxed text-[#4d5468]">{primaryExplanation}</p>
        )}
      </div>
      {rows.length > 0 && (
        <div className="rounded-lg border border-[#e3e6f0] px-3 py-1">
          {rows.map((r) => (
            <div key={r.label} className="border-b border-[#eef0f6] py-2 last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                  {r.label}
                </span>
                <span
                  className="text-right text-xs font-semibold leading-snug text-[#171a30]"
                  style={r.tone ? { color: r.tone } : undefined}
                >
                  {r.value}
                </span>
              </div>
              {r.action && (
                <button
                  type="button"
                  onClick={r.action.onClick}
                  className="focus-primary mt-1 text-[11px] font-bold text-[#2e3092] hover:underline"
                >
                  {r.action.label} →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}