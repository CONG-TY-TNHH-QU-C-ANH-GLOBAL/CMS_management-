// Tiny chip showing a translation row's current state. Used both inline
// in the FAQ admin list (next to each VI row) and inside the review modal.

import { AlertTriangle, Check, FileQuestion, XCircle } from "lucide-react";

import type { FaqTranslationRow } from "@/features/translations/translations.actions";

type Status = FaqTranslationRow["status"];

interface Props {
  /** null = no translation row exists yet for this locale. */
  row: FaqTranslationRow | null;
  /** Compact = single chip; Full = chip + secondary info (stale_reason / "reviewed by …"). */
  variant?: "compact" | "full";
}

const TINT: Record<Status | "none", string> = {
  draft: "bg-blue-100 text-blue-900 border-blue-300",
  reviewed: "bg-emerald-100 text-emerald-900 border-emerald-300",
  stale: "bg-amber-100 text-amber-900 border-amber-300",
  failed: "bg-red-100 text-red-900 border-red-300",
  none: "bg-slate-100 text-slate-600 border-slate-300",
};

const LABEL: Record<Status | "none", string> = {
  draft: "AI · draft",
  reviewed: "Reviewed",
  stale: "Stale",
  failed: "Failed",
  none: "—",
};

function ICON({ status }: { status: Status | "none" }) {
  const cls = "w-3 h-3";
  switch (status) {
    case "draft":
      return <FileQuestion className={cls} />;
    case "reviewed":
      return <Check className={cls} />;
    case "stale":
      return <AlertTriangle className={cls} />;
    case "failed":
      return <XCircle className={cls} />;
    case "none":
      return null;
  }
}

const STALE_REASON_LABEL: Record<string, string> = {
  source_changed: "Source edited",
  prompt_changed: "Prompt updated",
  model_changed: "Model upgraded",
  manual_mark: "Marked stale",
};

export function TranslationStatusBadge({ row, variant = "compact" }: Props) {
  const status: Status | "none" = row?.status ?? "none";
  const tint = TINT[status];
  const label = LABEL[status];

  if (variant === "compact") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${tint}`}
        title={
          row?.stale_reason
            ? `Stale: ${STALE_REASON_LABEL[row.stale_reason] ?? row.stale_reason}`
            : label
        }
      >
        <ICON status={status} />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <div className={`inline-flex flex-col gap-0.5 px-2 py-1 rounded text-xs border ${tint}`}>
      <span className="inline-flex items-center gap-1 font-semibold">
        <ICON status={status} />
        {label}
      </span>
      {row?.stale_reason ? (
        <span className="text-[11px] opacity-80">
          {STALE_REASON_LABEL[row.stale_reason] ?? row.stale_reason}
        </span>
      ) : null}
      {row?.reviewed_at ? (
        <span className="text-[11px] opacity-70">
          Approved {new Date(row.reviewed_at * 1000).toLocaleString()}
        </span>
      ) : null}
    </div>
  );
}
