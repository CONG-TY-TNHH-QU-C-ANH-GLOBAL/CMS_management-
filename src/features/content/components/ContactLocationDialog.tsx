import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  createContactLocationFn,
  updateContactLocationFn,
  type ContactLocationRow,
  type Locale,
} from "@/features/content/content.actions";

type Kind = ContactLocationRow["kind"];

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "office", label: "Office" },
  { value: "warehouse", label: "Warehouse" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "website", label: "Website" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  locale: Locale;
  row?: ContactLocationRow | null;
}

export function ContactLocationDialog({ open, onOpenChange, onSaved, locale, row }: Props) {
  const create = useServerFn(createContactLocationFn);
  const update = useServerFn(updateContactLocationFn);
  const [kind, setKind] = useState<Kind>(row?.kind ?? "office");
  const [label, setLabel] = useState(row?.label ?? "");
  const [address, setAddress] = useState(row?.address ?? "");
  const [phone, setPhone] = useState(row?.phone ?? "");
  const [url, setUrl] = useState(row?.url ?? "");
  const [langClass, setLangClass] = useState(row?.lang_class ?? "");
  const [position, setPosition] = useState(row?.position ?? 99);
  const [pending, setPending] = useState(false);

  // Re-sync on open / row change — the dialog instance is kept mounted across
  // open/close, so without this a reopened dialog shows abandoned edits.
  useEffect(() => {
    if (!open) return;
    setKind(row?.kind ?? "office");
    setLabel(row?.label ?? "");
    setAddress(row?.address ?? "");
    setPhone(row?.phone ?? "");
    setUrl(row?.url ?? "");
    setLangClass(row?.lang_class ?? "");
    setPosition(row?.position ?? 99);
    setPending(false);
  }, [open, row]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const payload = {
        position,
        kind,
        label,
        address: address || null,
        phone: phone || null,
        url: url || null,
        lang_class: langClass || null,
      };
      if (row) {
        await update({ data: { id: row.id, ...payload } });
      } else {
        await create({ data: { locale, ...payload } });
      }
      toast.success(row ? "Đã cập nhật contact" : "Đã thêm contact");
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
        className="w-full max-w-xl rounded-xl border border-border bg-background shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {row ? "Sửa Contact Location" : "Thêm Contact Location"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ngôn ngữ: <span className="font-mono uppercase">{locale}</span>
          </p>
        </div>
        <form onSubmit={onSubmit} className="px-5 py-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Loại</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                disabled={pending}
                className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Vị trí</label>
              <input
                type="number"
                min={0}
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
                disabled={pending}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Nhãn (label)</label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={pending}
              maxLength={200}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="VD: VN Office, US PA Warehouse, Hotline, Email..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Địa chỉ (tùy chọn)</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={pending}
              maxLength={500}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="121/5 Đ. Kênh 19/5, Sơn Kỳ, Tân Phú, TP.HCM"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Điện thoại</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={pending}
                maxLength={100}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="+1 (570) 618-1169"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">URL (mailto/https)</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={pending}
                maxLength={500}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="mailto:info@thgfulfill.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Lang class (font-cn cho địa chỉ TQ — để trống nếu không cần)
            </label>
            <input
              type="text"
              value={langClass}
              onChange={(e) => setLangClass(e.target.value)}
              disabled={pending}
              maxLength={50}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="font-cn"
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
              {pending ? "Đang lưu..." : row ? "Cập nhật" : "Thêm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
