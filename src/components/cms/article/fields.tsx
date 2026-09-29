/**
 * Form primitives shared by the article editors (Event, Blog). One place for
 * the input look and the label/hint/counter row, so the two editors cannot
 * drift apart again the way the hand-rolled forms did.
 */

export const inputClass =
  "mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
export const areaClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
export const buttonClass =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted";

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  /** Character counter. `ideal` is the length search engines show in full —
   *  past it the counter turns amber (a warning, not a limit). */
  count?: { length: number; max: number; ideal?: number };
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, required, hint, count, className = "", children }: FieldProps) {
  const over = count ? count.length > count.max : false;
  const long = count?.ideal !== undefined && count.length > count.ideal;
  return (
    <label className={`block ${className}`}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </span>
        {count && (
          <span
            className={`text-[11px] tabular-nums ${over ? "text-red-600" : long ? "text-amber-600" : "text-muted-foreground"}`}
          >
            {count.length}/{count.ideal ?? count.max}
          </span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
