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
  return <div className={`hover-lift rounded-xl border border-[#e3e6f0] bg-white transition-all duration-200 ease-out ${className}`}>{children}</div>;
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
        <h2 className="text-base font-bold tracking-wide text-[#171a30]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-[#878da1]">{subtitle}</p>}
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
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-transform duration-150 hover:scale-[1.02]"
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
        className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-extrabold transition-transform duration-150 hover:scale-[1.04]"
        style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}44` }}
        title={m.label}
      >
        {m.short}
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider transition-transform duration-150 hover:scale-[1.02]"
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

/** KPI — one number, one label, one short context line. Nothing more. */
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
  return (
    <Card className="px-4 py-3">
      <div className="font-mono text-2xl font-extrabold leading-none" style={{ color: tone }}>
        {value}
      </div>
      <div className="mt-1.5 truncate text-[10px] font-bold uppercase tracking-[0.14em] text-[#878da1]">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-[#4d5468]">{context}</div>
    </Card>
  );
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