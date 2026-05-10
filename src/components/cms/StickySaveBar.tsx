import { Sparkles, X } from "lucide-react";

export function StickySaveBar({
  count,
  onSave,
  onDiscard,
  saving = false,
}: {
  count: number;
  onSave: () => void;
  onDiscard: () => void;
  saving?: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-4 z-30 mt-6">
      <div className="mx-auto max-w-2xl flex items-center gap-3 rounded-xl border border-primary/30 bg-foreground text-background shadow-elevated px-4 py-3">
        <div className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-brand text-white">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 text-sm">
          <div className="font-semibold">Bạn có {count} thay đổi chưa lưu</div>
          <div className="text-[11px] opacity-70">Sau khi lưu sẽ tạo bản nháp chờ duyệt — nội dung public chưa thay đổi.</div>
        </div>
        <button
          onClick={onDiscard}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm hover:bg-white/10 transition"
        >
          <X className="w-3.5 h-3.5" /> Bỏ
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1 h-8 px-4 rounded-md bg-white text-foreground text-sm font-semibold hover:bg-white/90 transition disabled:opacity-60"
        >
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </div>
    </div>
  );
}
