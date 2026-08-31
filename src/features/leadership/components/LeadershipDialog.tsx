import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { MediaPicker } from "@/features/media/components/MediaPicker";
import {
  createLeadershipFn,
  updateLeadershipFn,
  type LeadershipRow,
} from "@/features/leadership/leadership.actions";
import { toMediaUrl } from "@/features/partners/partners.media";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  row?: LeadershipRow | null;
}

export function LeadershipDialog({ open, onOpenChange, onSaved, row }: Props) {
  const create = useServerFn(createLeadershipFn);
  const update = useServerFn(updateLeadershipFn);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [quote, setQuote] = useState("");
  const [position, setPosition] = useState(99);
  const [status, setStatus] = useState<"draft" | "live">("draft");
  const [avatarIds, setAvatarIds] = useState<number[]>([]);
  const [avatarPreviews, setAvatarPreviews] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setRole(row?.role ?? "");
    setQuote(row?.quote ?? "");
    setPosition(row?.position ?? 99);
    setStatus(row?.status ?? "draft");
    setAvatarIds(row?.avatars.map((avatar) => avatar.media_id) ?? []);
    setAvatarPreviews(
      row?.avatars
        .map((avatar) => toMediaUrl(avatar.r2_key, ""))
        .filter((url): url is string => Boolean(url)) ?? [],
    );
    setPending(false);
  }, [open, row]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const payload = {
        position,
        name: name.trim(),
        role: role.trim() || null,
        quote: quote.trim() || null,
        status,
        avatar_media_ids: avatarIds,
      };
      if (row) await update({ data: { id: row.id, ...payload } });
      else await create({ data: payload });
      toast.success(row ? "Đã cập nhật Leadership" : "Đã thêm Leadership");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xl space-y-4 rounded-xl border border-border bg-surface p-5 shadow-elevated"
      >
        <h2 className="text-lg font-semibold">{row ? "Sửa Leadership" : "Thêm Leadership"}</h2>

        <label className="block">
          <span className="text-sm font-medium">Tên người hoặc đội nhóm</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Chức danh / vai trò</span>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={160}
            placeholder="Founder, Technology Team…"
            className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Câu phát biểu</span>
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            maxLength={1000}
            rows={4}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Avatar (bắt buộc, 1 hoặc nhiều ảnh)</span>
            <span className="text-xs text-muted-foreground">Tối đa 8</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {avatarPreviews.map((src) => (
              <img
                key={src}
                src={src}
                alt=""
                className="h-12 w-12 rounded-full border border-border object-cover"
              />
            ))}
            {avatarPreviews.length === 0 &&
              avatarIds.map((id) => (
                <div
                  key={id}
                  className="grid h-12 w-12 place-items-center rounded-full border border-dashed border-border text-[10px] text-muted-foreground"
                >
                  #{id}
                </div>
              ))}
            <MediaPicker
              mode="multi"
              value={avatarIds}
              onChange={(ids, rows) => {
                setAvatarIds(ids.slice(0, 8));
                setAvatarPreviews(
                  rows
                    .slice(0, 8)
                    .map((media) => media.url ?? media.thumb_url ?? "")
                    .filter(Boolean),
                );
              }}
              title="Chọn avatar Leadership"
              trigger={
                <button
                  type="button"
                  className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted"
                >
                  Chọn ảnh
                </button>
              }
            />
            {avatarIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAvatarIds([]);
                  setAvatarPreviews([]);
                }}
                className="text-sm text-muted-foreground hover:text-red-600"
              >
                Bỏ tất cả
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="text-sm font-medium">Vị trí</span>
            <input
              type="number"
              min={0}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value) || 0)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
            />
          </label>
          <label>
            <span className="text-sm font-medium">Trạng thái</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "live")}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="draft">Nháp — chưa hiển thị</option>
              <option value="live">Hiển thị trên landing</option>
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
