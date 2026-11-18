// Upload the 5-tier USPS Ground Advantage label workbook, preview what changes,
// then publish all five rate cards together. Nothing is written until Publish.

import { useRouter } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
import { useRef, useState } from "react";

import { getPricingTableFn, saveUspsGaTiersFn } from "../pricing.actions";
import { USPS_GA_SLUGS, type UspsGaRow } from "../uspsGa.constants";
import { diffUspsGaTiers, type UspsGaTierDiff } from "../uspsGaDiff";
import { parseUspsGaWorkbook } from "../uspsGaWorkbook";
import { primaryBtn, RateCardDialogShell, secondaryBtn } from "./rateCardUi";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Prepared {
  fileName: string;
  tiers: UspsGaRow[][];
  versions: number[];
  diff: UspsGaTierDiff[];
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function UspsGaWorkbookDialog({ open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number[] | null>(null);

  function reset() {
    setPrepared(null);
    setError(null);
    setDone(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    reset();
    setBusy(true);
    try {
      const tiers = parseUspsGaWorkbook(await file.arrayBuffer());
      const published = await Promise.all(
        USPS_GA_SLUGS.map((slug) => getPricingTableFn({ data: { slug } })),
      );
      const current = published.map(({ table }, i) => {
        if (!table) throw new Error(`Chưa có bảng ${USPS_GA_SLUGS[i]} trong CMS`);
        return table;
      });
      setPrepared({
        fileName: file.name,
        tiers,
        versions: current.map((t) => t.version),
        diff: diffUspsGaTiers(
          current.map((t) => JSON.parse(t.data_json) as unknown[]),
          tiers,
        ),
      });
    } catch (err) {
      setError(`Không đọc được file: ${message(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!prepared) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveUspsGaTiersFn({
        data: {
          tiers: prepared.tiers,
          expectedVersions: prepared.versions,
          comment: `Upload ${prepared.fileName}`,
        },
      });
      setDone(result.newVersions);
      setPrepared(null);
      await router.invalidate();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const totalChanges = prepared?.diff.reduce((n, d) => n + d.changes.length, 0) ?? 0;

  return (
    <RateCardDialogShell
      open={open}
      onClose={close}
      title="Tải bảng giá USPS Ground Advantage (5 tier)"
      description='File .xlsx có 5 sheet "Tier 1" … "Tier 5", mỗi sheet 24 mức cân × Zone 1–9 (USD/label). Xem trước thay đổi rồi bấm Publish để cập nhật cả 5 bảng cùng lúc.'
      size="max-w-2xl"
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={close} disabled={busy}>
            {done ? "Đóng" : "Huỷ"}
          </button>
          {prepared ? (
            <button
              type="button"
              className={primaryBtn}
              onClick={publish}
              disabled={busy || totalChanges === 0}
            >
              {busy ? "Đang publish…" : `Publish cả 5 tier (${totalChanges} ô thay đổi)`}
            </button>
          ) : null}
        </>
      }
    >
      <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface/50 px-4 py-6 cursor-pointer hover:border-primary/40">
        <FileUp className="w-6 h-6 text-muted-foreground" />
        <span className="text-sm font-medium">
          {prepared ? prepared.fileName : "Chọn file Bang_gia_usps_ga_label.xlsx"}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </label>

      {error ? (
        <div className="mt-3 text-xs text-red-600 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      ) : null}

      {done ? (
        <div className="mt-3 text-xs text-emerald-700 border border-emerald-200 rounded-md px-3 py-2">
          Đã publish cả 5 tier (phiên bản mới: {done.map((v) => `v${v}`).join(", ")}). Website sẽ tự
          build lại trong vài phút.
        </div>
      ) : null}

      {prepared ? (
        <div className="mt-4 rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-surface text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left">Tier</th>
                <th className="px-3 py-1.5 text-left">Đang chạy</th>
                <th className="px-3 py-1.5 text-left">Ô thay đổi</th>
                <th className="px-3 py-1.5 text-left">Ví dụ</th>
              </tr>
            </thead>
            <tbody>
              {prepared.diff.map((d, i) => (
                <tr key={d.tier} className="border-t border-border">
                  <td className="px-3 py-1.5 font-medium">Tier {d.tier}</td>
                  <td className="px-3 py-1.5 tabular-nums">v{prepared.versions[i]}</td>
                  <td className="px-3 py-1.5 tabular-nums">{d.changes.length}</td>
                  <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                    {d.changes
                      .slice(0, 2)
                      .map((c) => `${c.oz} oz Z${c.zone}: ${c.from ?? "—"} → ${c.to}`)
                      .join(" · ") || "Không đổi"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </RateCardDialogShell>
  );
}
