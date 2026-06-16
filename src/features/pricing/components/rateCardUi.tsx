// Shared UI atoms for the Rate Card Builder: a dialog shell (matching the
// hand-rolled ConfirmDialog overlay pattern used elsewhere in the CMS) and
// number formatting helpers. Kept tiny and presentational only.

import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Format an integer VND amount with vi-VN grouping; passthrough non-numbers. */
export function formatVnd(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("vi-VN");
  const s = String(value ?? "");
  return s;
}

export function formatSigned(n: number | null): string {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("vi-VN")}`;
}

export function formatPct(n: number | null): string {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

interface DialogShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Tailwind max-width class. */
  size?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Centered modal shell. Click-outside + Esc close (caller guards pending). */
export function RateCardDialogShell({
  open,
  onClose,
  title,
  description,
  size = "max-w-lg",
  children,
  footer,
}: DialogShellProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm px-4 py-6 overflow-y-auto"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="presentation"
    >
      <div
        className={`w-full ${size} rounded-xl border border-border bg-background shadow-glow my-auto`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description ? (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-md p-1 -mr-1"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2 bg-surface/50 rounded-b-xl">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Small labeled numeric/text field used across the dialogs. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-foreground mb-1">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground mt-1">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";
export const selectClass =
  "w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export const primaryBtn =
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-soft";
export const secondaryBtn =
  "inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface text-sm font-medium hover:bg-surface-muted disabled:opacity-50";
export const toolbarBtn =
  "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed";
