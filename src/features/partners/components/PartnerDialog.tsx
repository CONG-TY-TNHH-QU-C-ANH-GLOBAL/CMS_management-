import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { MediaPicker } from "@/features/media/components/MediaPicker";
import {
  createPartnerFn,
  updatePartnerFn,
  type PartnerRow,
} from "@/features/partners/partners.actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  row?: PartnerRow | null;
}

export function PartnerDialog({ open, onOpenChange, onSaved, row }: Props) {
  const create = useServerFn(createPartnerFn);
  const update = useServerFn(updatePartnerFn);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [tier, setTier] = useState("");
  const [position, setPosition] = useState(99);
  const [logoId, setLogoId] = useState<number | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "live">("draft");
  const [pending, setPending] = useState(false);

  // Re-sync on open / row change — the dialog stays mounted across open/close,
  // so without this a reopened dialog shows abandoned edits.
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setUrl(row?.url ?? "");
    setTier(row?.tier ?? "");
    setPosition(row?.position ?? 99);
    setLogoId(row?.logo_media_id ?? null);
    setLogoPreview(null);
    setStatus(row?.status ?? "draft");
    setPending(false);
  }, [open, row]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const payload = {
        position,
        name: name.trim(),
        url: url.trim() || null,
        tier: tier.trim() || null,
        logo_media_id: logoId,
        status,
      };
      if (row) {
        await update({ data: { id: row.id, ...payload } });
      } else {
        await create({ data: payload });
      }
      toast.success(row ? "Đã cập nhật đối tác" : "Đã thêm đối tác");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg rounded-xl bg-surface border border-border shadow-elevated p-5 space-y-4"
      >
        <h2 className="text-lg font-semibold">{row ? "Sửa đối tác" : "Thêm đối tác"}</h2>

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900">
          Logo đối tác là tuyên bố công khai về quan hệ hợp tác. Chỉ chuyển sang
          <strong> Hiển thị</strong> khi quan hệ đã được xác nhận.
        </div>

        <label className="block">
          <span className="text-sm font-medium">Tên đối tác</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            className="mt-1 w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Website</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            placeholder="https://…"
            maxLength={500}
            className="mt-1 w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Nhóm</span>
            <input
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              placeholder="Sàn TMĐT, Vận hành…"
              maxLength={60}
              className="mt-1 w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Vị trí</span>
            <input
              value={position}
              onChange={(e) => setPosition(Number(e.target.value) || 0)}
              type="number"
              min={0}
              className="mt-1 w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
            />
          </label>
        </div>

        <div>
          <span className="text-sm font-medium">Logo</span>
          <div className="mt-1 flex items-center gap-3">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt=""
                className="w-12 h-12 object-contain rounded border border-border bg-white"
              />
            ) : (
              <div className="w-12 h-12 grid place-items-center rounded border border-dashed border-border text-[10px] text-muted-foreground">
                {logoId ? `#${logoId}` : "trống"}
              </div>
            )}
            <MediaPicker
              mode="single"
              value={logoId ? [logoId] : []}
              onChange={(ids, rows) => {
                setLogoId(ids[0] ?? null);
                setLogoPreview(rows[0]?.url ?? rows[0]?.thumb_url ?? null);
              }}
              title="Chọn logo đối tác"
              trigger={
                <button
                  type="button"
                  className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-muted"
                >
                  Chọn ảnh
                </button>
              }
            />
            {logoId && (
              <button
                type="button"
                onClick={() => {
                  setLogoId(null);
                  setLogoPreview(null);
                }}
                className="text-sm text-muted-foreground hover:text-red-600"
              >
                Bỏ logo
              </button>
            )}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Trạng thái</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "live")}
            className="mt-1 w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
          >
            <option value="draft">Nháp — không hiện trên web</option>
            <option value="live">Hiển thị trên trang chủ</option>
          </select>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-muted"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={pending}
            className="h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
