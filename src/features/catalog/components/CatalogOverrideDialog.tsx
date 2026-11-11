import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  upsertCatalogOverrideFn,
  type CatalogOverrideRow,
} from "@/features/catalog/catalog.actions";
import { parseProductId } from "@/features/catalog/catalog.productId";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  row?: CatalogOverrideRow | null;
}

const inputCls = "mt-1 w-full h-9 px-3 rounded-lg border border-border bg-background text-sm";

export function CatalogOverrideDialog({ open, onOpenChange, onSaved, row }: Props) {
  const upsert = useServerFn(upsertCatalogOverrideFn);
  const [product, setProduct] = useState("");
  const [label, setLabel] = useState("");
  const [templateUrl, setTemplateUrl] = useState("");
  const [includesShipping, setIncludesShipping] = useState(false);
  const [pending, setPending] = useState(false);

  // Re-sync on open / row change — the dialog stays mounted across open/close.
  useEffect(() => {
    if (!open) return;
    setProduct(row?.product_id ?? "");
    setLabel(row?.label ?? "");
    setTemplateUrl(row?.template_url ?? "");
    setIncludesShipping(row?.price_includes_shipping === 1);
    setPending(false);
  }, [open, row]);

  const productId = parseProductId(product);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await upsert({
        data: {
          product,
          label: label.trim() || null,
          template_url: templateUrl.trim() || null,
          price_includes_shipping: includesShipping,
        },
      });
      toast.success(row ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm");
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
        <h2 className="text-lg font-semibold">{row ? "Sửa sản phẩm" : "Thêm sản phẩm"}</h2>

        <label className="block">
          <span className="text-sm font-medium">Sản phẩm</span>
          <input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            required
            disabled={!!row}
            placeholder="Dán link catalog, vd: https://thgroupfulfill.com/vi/catalog?productId=…"
            maxLength={500}
            className={`${inputCls} disabled:opacity-60`}
          />
          <span
            className={`mt-1 block text-[11px] ${product && !productId ? "text-red-600" : "text-muted-foreground"}`}
          >
            {product && !productId
              ? "Không nhận ra sản phẩm — link phải có productId=…"
              : productId
                ? `ID: ${productId}`
                : "Mở sản phẩm trên website, bấm Share Product rồi dán link vào đây."}
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Tên (để dễ tìm trong danh sách)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="vd: Notebook Set (made in USA)"
            maxLength={200}
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Link template design</span>
          <input
            value={templateUrl}
            onChange={(e) => setTemplateUrl(e.target.value)}
            type="url"
            placeholder="https://drive.google.com/…"
            maxLength={1000}
            className={inputCls}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Hiện nút “Download Template” trên trang sản phẩm. Nhớ mở quyền xem link cho mọi người.
          </span>
        </label>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includesShipping}
            onChange={(e) => setIncludesShipping(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium">Giá bán đã gồm phí vận chuyển</span>
            <span className="block text-[11px] text-muted-foreground">
              Website ghi “Selling price (including shipping cost)” thay vì “not including”.
            </span>
          </span>
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
            disabled={pending || !productId}
            className="h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
