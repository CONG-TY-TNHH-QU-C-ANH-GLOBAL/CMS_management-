// Edit dialog for one service_block row. Update-only — creating new blocks
// goes through migrations/seeds for now (per-page kinds and positions are
// curated, not operator-authored). Reorder also lives in seed/manual.
//
// Translatable fields: title, description, payload_json. Operator can also
// tweak position + icon (locale-agnostic). Saving fires
// onServiceBlockSourceChanged on the VI row, which auto-fires `source_changed`
// on dependent EN/ZH translations whose hash differs.

import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { updateServiceBlockFn } from "@/features/content/content.actions";
import type { ServiceBlockRow } from "@/features/content";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ServiceBlockRow | null;
  onSaved: () => void;
}

export function ServiceBlockDialog({ open, onOpenChange, row, onSaved }: Props) {
  const update = useServerFn(updateServiceBlockFn);

  const [position, setPosition] = useState(0);
  const [icon, setIcon] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [payload, setPayload] = useState("{}");
  const [pending, setPending] = useState(false);
  const [payloadError, setPayloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) return;
    setPosition(row.position);
    setIcon(row.icon ?? "");
    setTitle(row.title ?? "");
    setDescription(row.description ?? "");
    setPayload(row.payload_json || "{}");
    setPayloadError(null);
  }, [open, row]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !row) return null;

  function validatePayload(s: string): boolean {
    if (s.trim().length === 0) {
      setPayload("{}");
      setPayloadError(null);
      return true;
    }
    try {
      const parsed = JSON.parse(s);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setPayloadError("Payload phải là object JSON ({...})");
        return false;
      }
      setPayloadError(null);
      return true;
    } catch {
      setPayloadError("Payload không phải JSON hợp lệ");
      return false;
    }
  }

  async function onSave() {
    if (!validatePayload(payload)) return;
    if (!row) return;
    setPending(true);
    try {
      await update({
        data: {
          id: row.id,
          position,
          icon: icon.trim() || null,
          title: title.length > 0 ? title : null,
          description: description.length > 0 ? description : null,
          payload_json: payload.trim() || "{}",
        },
      });
      toast.success("Đã lưu service block");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/50 backdrop-blur-sm px-2 sm:px-4 py-2 sm:py-6 overflow-y-auto"
      onClick={() => !pending && onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-glow my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            Sửa service block · {row.page_slug}/{row.kind} #{row.position}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Locale: <span className="font-mono uppercase">{row.locale}</span>
            {row.locale === "vi"
              ? " (canonical — sửa sẽ auto-fire source_changed lên EN/ZH translations)"
              : " (legacy — VI là canonical sau migration 0020; xóa hoặc dịch lại qua AI)"}
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Position
              </label>
              <input
                type="number"
                value={position}
                onChange={(e) => setPosition(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Icon (emoji hoặc text)
              </label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="✅"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Title
            </label>
            <textarea
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Description
            </label>
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Payload (kind-specific JSON: tag / items / features / note / val …)
            </label>
            <textarea
              rows={6}
              value={payload}
              onChange={(e) => {
                setPayload(e.target.value);
                validatePayload(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
            {payloadError ? (
              <div className="text-[11px] text-red-600 mt-1">{payloadError}</div>
            ) : (
              <div className="text-[10px] text-muted-foreground mt-1">
                Phải là object JSON. Empty → {"{}"}.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-surface-muted/40 rounded-b-xl">
          <button
            onClick={() => !pending && onOpenChange(false)}
            disabled={pending}
            className="h-9 px-3 rounded-md border border-border bg-background hover:bg-surface-muted disabled:opacity-50 text-sm"
          >
            Hủy
          </button>
          <button
            onClick={onSave}
            disabled={pending || payloadError !== null}
            className="h-9 px-4 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50 text-sm font-medium"
          >
            {pending ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </div>
    </div>
  );
}
