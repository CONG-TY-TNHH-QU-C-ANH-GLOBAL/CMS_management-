// Phase A2 — bulk async translate. Enqueues translation jobs for every VI entity
// of `entityType` with a missing/non-reviewed en/zh locale (reviewed locales are
// skipped), then drives the queue pass-by-pass from the browser with a progress
// readout. The 1-min Cron is the backstop if the tab closes. Drafts land in
// <entity>_translations and still require operator Approve (review gate intact).

import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  enqueueBulkTranslateFn,
  getBulkTranslateStatusFn,
  pumpTranslationJobsFn,
} from "@/features/translations/translations.actions";

interface Props {
  /** ENTITY_TYPE value (faq | careers_job | …). */
  entityType: string;
  /** Override the idle label. */
  label?: string;
  /** Called once the batch finishes (reload the list so status pills refresh). */
  onDone?: () => void;
}

export function BulkTranslateButton({ entityType, label, onDone }: Props) {
  const enqueue = useServerFn(enqueueBulkTranslateFn);
  const pump = useServerFn(pumpTranslationJobsFn);
  const getStatus = useServerFn(getBulkTranslateStatusFn);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function run() {
    setRunning(true);
    setProgress(null);
    try {
      const res = await enqueue({ data: { entity_type: entityType } });
      const jobIds = res.jobIds ?? [];
      if (jobIds.length === 0) {
        toast.message("Tất cả mục đã được dịch/duyệt — không có gì để dịch.");
        return;
      }
      toast.message(`Đã xếp hàng ${res.entitiesQueued} mục. Đang dịch nền…`);

      let { status } = await getStatus({ data: { jobIds } });
      setProgress({ done: status.done, total: status.total });

      let safety = 2000;
      while (status.pending > 0 && safety-- > 0) {
        try {
          await pump();
        } catch {
          // a pump can time out on a slow batch — chunks persist; cron continues
          await new Promise((r) => setTimeout(r, 3000));
        }
        ({ status } = await getStatus({ data: { jobIds } }));
        setProgress({ done: status.done, total: status.total });
      }

      if (status.failed > 0) {
        toast.warning(`Xong: ${status.done} bản ok, ${status.failed} lỗi (Cron sẽ tự thử lại).`);
      } else {
        toast.success(`Đã dịch ${status.done} bản (draft). Mở từng mục để duyệt (Approve).`);
      }
      onDone?.();
    } catch (err) {
      toast.error(`Bulk dịch lỗi: ${err instanceof Error ? err.message : "lỗi"}`);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return (
    <button
      onClick={run}
      disabled={running}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-blue-300 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Tạo bản dịch EN + ZH (draft) cho mọi mục còn thiếu — chạy nền, vẫn cần Approve sau"
    >
      <Sparkles className="w-3.5 h-3.5" />
      {running
        ? progress
          ? `Đang dịch… ${progress.done}/${progress.total}`
          : "Đang xếp hàng…"
        : (label ?? "Dịch tất cả mục thiếu (EN+ZH)")}
    </button>
  );
}
