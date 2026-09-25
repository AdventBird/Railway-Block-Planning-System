// ---------------------------------------------------------------------------
// OPERATIONAL TOAST SYSTEM (§14) — Lightweight, non-intrusive feedback
// for control-room state changes (resource reassignments, plan upgrades,
// conflict detections, corridor alerts).
// ---------------------------------------------------------------------------
import { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from "lucide-react";

export type ToastTone = "ok" | "warn" | "crit" | "primary" | "neutral";

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  tone: ToastTone;
  timestamp: string;
  duration?: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

class ToastManager {
  private toasts: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();
  private counter = 0;

  subscribe(listener: ToastListener) {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    const copy = [...this.toasts];
    this.listeners.forEach((l) => l(copy));
  }

  show(title: string, message?: string, tone: ToastTone = "primary", duration = 3500) {
    const id = `toast-${Date.now()}-${++this.counter}`;
    const timestamp = new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const item: ToastItem = { id, title, message, tone, timestamp, duration };

    // Max 4 toasts simultaneously to prevent screen clutter
    this.toasts = [item, ...this.toasts.slice(0, 3)];
    this.notify();

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }
    return id;
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clear() {
    this.toasts = [];
    this.notify();
  }
}

export const toastManager = new ToastManager();

/** Standalone trigger helper */
export const toast = {
  info: (title: string, message?: string) => toastManager.show(title, message, "primary"),
  success: (title: string, message?: string) => toastManager.show(title, message, "ok"),
  warn: (title: string, message?: string) => toastManager.show(title, message, "warn"),
  crit: (title: string, message?: string) => toastManager.show(title, message, "crit"),
  dismiss: (id: string) => toastManager.dismiss(id),
};

const TONE_STYLES: Record<
  ToastTone,
  { border: string; bg: string; text: string; icon: typeof Info; iconColor: string }
> = {
  ok: {
    border: "border-[#16a34a]/30",
    bg: "bg-[#ffffff]/95",
    text: "text-[#166534]",
    icon: CheckCircle2,
    iconColor: "#16a34a",
  },
  warn: {
    border: "border-[#d97706]/35",
    bg: "bg-[#ffffff]/95",
    text: "text-[#92400e]",
    icon: AlertTriangle,
    iconColor: "#d97706",
  },
  crit: {
    border: "border-[#dc2626]/35",
    bg: "bg-[#ffffff]/95",
    text: "text-[#991b1b]",
    icon: AlertOctagon,
    iconColor: "#dc2626",
  },
  primary: {
    border: "border-[#2e3092]/30",
    bg: "bg-[#ffffff]/95",
    text: "text-[#2e3092]",
    icon: Info,
    iconColor: "#2e3092",
  },
  neutral: {
    border: "border-[#e3e6f0]",
    bg: "bg-[#ffffff]/95",
    text: "text-[#4d5468]",
    icon: Info,
    iconColor: "#878da1",
  },
};

/**
 * Toast Container rendered at the root or within active views.
 * Compact, control-room styled, accessible with ARIA live regions.
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toastManager.subscribe(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Operational Notifications"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full sm:w-auto"
    >
      {toasts.map((t) => {
        const toneMeta = TONE_STYLES[t.tone];
        const IconComponent = toneMeta.icon;

        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3 shadow-lg backdrop-blur-md transition-all duration-200 ease-out animate-in slide-in-from-bottom-2 ${toneMeta.border} ${toneMeta.bg}`}
          >
            <div className="shrink-0 pt-0.5">
              <IconComponent size={16} color={toneMeta.iconColor} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-bold leading-tight ${toneMeta.text}`}>
                  {t.title}
                </span>
                <span className="font-mono text-[9px] text-[#878da1]">
                  {t.timestamp}
                </span>
              </div>
              {t.message && (
                <p className="mt-0.5 text-[11px] leading-snug text-[#4d5468]">
                  {t.message}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => toastManager.dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded p-1 text-[#878da1] hover:bg-[#f1f3f9] hover:text-[#171a30] transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
