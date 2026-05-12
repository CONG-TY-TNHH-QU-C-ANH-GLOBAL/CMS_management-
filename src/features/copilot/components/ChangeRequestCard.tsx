import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, Sparkles, X } from "lucide-react";

import type { ChangeRequestRow } from "@/features/copilot/copilot.actions";

interface Preview {
  before: unknown;
  after: unknown;
  summary: string;
}

interface Props {
  request: ChangeRequestRow;
  onApprove: () => Promise<void> | void;
  onReject: () => Promise<void> | void;
}

function parsePreview(json: string | null): Preview | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "(trống)";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

const STATUS_TONE: Record<ChangeRequestRow["status"], { label: string; cls: string; icon: React.ReactNode }> = {
  pending: {
    label: "Chờ duyệt",
    cls: "bg-amber-50 border-amber-200 text-amber-800",
    icon: <Sparkles className="w-3 h-3" />,
  },
  approved: {
    label: "Đã duyệt",
    cls: "bg-blue-50 border-blue-200 text-blue-800",
    icon: <Check className="w-3 h-3" />,
  },
  executed: {
    label: "Đã áp dụng",
    cls: "bg-emerald-50 border-emerald-200 text-emerald-800",
    icon: <Check className="w-3 h-3" />,
  },
  rejected: {
    label: "Đã từ chối",
    cls: "bg-muted border-border text-muted-foreground",
    icon: <X className="w-3 h-3" />,
  },
  failed: {
    label: "Lỗi",
    cls: "bg-red-50 border-red-200 text-red-800",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
};

export function ChangeRequestCard({ request, onApprove, onReject }: Props) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const preview = parsePreview(request.preview_json);
  const tone = STATUS_TONE[request.status];

  async function handle(fn: () => Promise<void> | void) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ml-8 border border-border rounded-xl bg-surface overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-muted/50 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${tone.cls}`}>
            {tone.icon} {tone.label}
          </span>
          <span className="text-xs font-medium truncate" title={preview?.summary}>
            {preview?.summary ?? request.mutation_name}
          </span>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-muted-foreground hover:text-foreground p-1"
          aria-label={expanded ? "Thu gọn" : "Mở rộng"}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && preview && (
        <div className="p-3 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <div className="font-semibold text-muted-foreground mb-1">Trước</div>
            <pre className="bg-background border border-border rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-40 font-mono leading-snug">
              {formatValue(preview.before)}
            </pre>
          </div>
          <div>
            <div className="font-semibold text-emerald-700 mb-1">Sau</div>
            <pre className="bg-emerald-50 border border-emerald-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-40 font-mono leading-snug">
              {formatValue(preview.after)}
            </pre>
          </div>
        </div>
      )}

      {request.status === "failed" && request.error_message && (
        <div className="px-3 py-2 text-[11px] bg-red-50 border-t border-red-200 text-red-700">
          {request.error_message}
        </div>
      )}

      {request.status === "pending" && (
        <div className="flex gap-2 px-3 py-2 border-t border-border bg-surface-muted/30">
          <button
            onClick={() => handle(onReject)}
            disabled={busy}
            className="flex-1 h-8 text-xs font-medium rounded-md border border-border bg-background hover:bg-surface-muted disabled:opacity-50"
          >
            Từ chối
          </button>
          <button
            onClick={() => handle(onApprove)}
            disabled={busy}
            className="flex-1 h-8 text-xs font-semibold rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Approve
          </button>
        </div>
      )}
    </div>
  );
}
