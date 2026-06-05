import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  createGlossaryTermFn,
  findGlossaryDuplicatesFn,
  updateGlossaryTermFn,
  type GlossaryCategory,
  type GlossaryRow,
} from "@/features/translations/glossary.actions";

const CATEGORIES: { id: GlossaryCategory; label: string }[] = [
  { id: "brand", label: "Brand" },
  { id: "warehouse", label: "Warehouse" },
  { id: "shipping", label: "Shipping" },
  { id: "ecommerce", label: "eCommerce" },
  { id: "payments", label: "Payments" },
  { id: "marketing", label: "Marketing" },
  { id: "general", label: "General" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Pass row to edit; omit for create. */
  row?: GlossaryRow | null;
}

interface DuplicateWarning {
  candidate: GlossaryRow;
  direction: "existing-contains-new" | "new-contains-existing";
}

export function GlossaryDialog({ open, onOpenChange, onSaved, row }: Props) {
  const create = useServerFn(createGlossaryTermFn);
  const update = useServerFn(updateGlossaryTermFn);
  const findDups = useServerFn(findGlossaryDuplicatesFn);
  const [termVi, setTermVi] = useState(row?.term_vi ?? "");
  const [termEn, setTermEn] = useState(row?.term_en ?? "");
  const [termZh, setTermZh] = useState(row?.term_zh ?? "");
  const [category, setCategory] = useState<GlossaryCategory>(row?.category ?? "general");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [priority, setPriority] = useState(row?.priority ?? 0);
  const [warnings, setWarnings] = useState<DuplicateWarning[]>([]);
  const [pending, setPending] = useState(false);

  // Re-sync on open / row change — the dialog instance is kept mounted across
  // open/close, so without this a reopened dialog shows abandoned edits.
  useEffect(() => {
    if (!open) return;
    setTermVi(row?.term_vi ?? "");
    setTermEn(row?.term_en ?? "");
    setTermZh(row?.term_zh ?? "");
    setCategory(row?.category ?? "general");
    setNotes(row?.notes ?? "");
    setPriority(row?.priority ?? 0);
    setWarnings([]);
    setPending(false);
  }, [open, row]);

  // Duplicate check — debounced on term_vi changes. Warns but never blocks.
  useEffect(() => {
    if (!termVi.trim() || termVi.length < 2) {
      setWarnings([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await findDups({ data: { term_vi: termVi, ignoreId: row?.id } });
        setWarnings(res.warnings);
      } catch {
        // Network blip — silent; warning is advisory anyway
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [termVi, row?.id, findDups]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      if (row) {
        await update({
          data: {
            id: row.id,
            term_vi: termVi.trim(),
            term_en: termEn.trim(),
            term_zh: termZh.trim(),
            category,
            notes: notes.trim() || null,
            priority,
          },
        });
      } else {
        await create({
          data: {
            term_vi: termVi.trim(),
            term_en: termEn.trim(),
            term_zh: termZh.trim(),
            category,
            notes: notes.trim() || null,
            priority,
          },
        });
      }
      toast.success(row ? "Đã cập nhật term" : "Đã thêm term");
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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm px-4"
      onClick={() => !pending && onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {row ? "Sửa glossary term" : "Thêm glossary term"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Term sẽ được inject vào mỗi prompt AI translate. Sort by length DESC tự động.
          </p>
        </div>
        <form onSubmit={onSubmit} className="px-5 py-4 space-y-3.5">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Term (VI) <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={termVi}
                onChange={(e) => setTermVi(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Kho Trung Quốc"
                disabled={pending}
                maxLength={200}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                EN <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={termEn}
                onChange={(e) => setTermEn(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="China warehouse"
                disabled={pending}
                maxLength={200}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                ZH <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={termZh}
                onChange={(e) => setTermZh(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="中国仓库"
                disabled={pending}
                maxLength={200}
              />
            </div>
          </div>

          {warnings.length > 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" /> Trùng/chồng lấn với term sẵn có
              </div>
              {warnings.slice(0, 3).map((w) => (
                <div key={w.candidate.id} className="text-amber-900/90">
                  • <span className="font-medium">"{w.candidate.term_vi}"</span> (
                  {w.candidate.category}) —{" "}
                  {w.direction === "existing-contains-new"
                    ? "đã chứa term bạn nhập. Nên cập nhật term cũ thay vì tạo mới."
                    : "là tập con của term bạn nhập. Hãy chắc đây là khái niệm khác."}
                </div>
              ))}
              {warnings.length > 3 ? (
                <div className="text-amber-900/70">… và {warnings.length - 3} term khác.</div>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as GlossaryCategory)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={pending}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Priority (0–100)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={pending}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Notes (optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="VD: only for warehouse section"
              disabled={pending}
              maxLength={500}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="h-9 px-3 rounded-md border border-border bg-background text-sm hover:bg-surface-muted"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Đang lưu…" : row ? "Cập nhật" : "Thêm term"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
