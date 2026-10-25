import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, RotateCcw, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, CardHeader } from "@/components/cms/ui";
import {
  listLandingVersionsFn,
  processLandingVersionFn,
  publishLandingVersionFn,
  rollbackLandingFn,
  type FindingSeverity,
  type LandingVersionView,
} from "@/features/campaigns/landing/landing.actions";

interface Props {
  campaignId: number;
  /** Called after publish / rollback so the editor reloads landing_path. */
  onPublished: () => void;
}

type Listing = Awaited<ReturnType<typeof listLandingVersionsFn>>;

const SEVERITY: Record<FindingSeverity, { label: string; className: string }> = {
  critical: { label: "Nghiêm trọng", className: "border-red-300 bg-red-50 text-red-700" },
  major: { label: "Quan trọng", className: "border-amber-300 bg-amber-50 text-amber-800" },
  minor: { label: "Nhỏ", className: "border-border bg-muted/40 text-muted-foreground" },
};

const STATUS_LABEL: Record<LandingVersionView["status"], string> = {
  processing: "Đang xử lý",
  ready: "Sẵn sàng",
  failed: "Lỗi",
};

const formatTime = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
const formatSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const errorText = (err: unknown) => (err instanceof Error ? err.message : "Thao tác thất bại");

function Counts({ v }: { v: LandingVersionView }) {
  const items: [FindingSeverity, number][] = [
    ["critical", v.critical_count],
    ["major", v.major_count],
    ["minor", v.minor_count],
  ];
  return (
    <span className="inline-flex gap-1">
      {items.map(([severity, n]) => (
        <span
          key={severity}
          className={`rounded border px-1.5 text-[11px] ${SEVERITY[severity].className}`}
          title={SEVERITY[severity].label}
        >
          {n}
        </span>
      ))}
    </span>
  );
}

function VersionDetail({ v }: { v: LandingVersionView }) {
  const format = v.report.format;
  return (
    <div className="space-y-4 border-t border-border p-5">
      {v.report.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700">
          {v.report.error}
        </div>
      )}
      {format && (
        <div className="text-xs">
          <div className="font-medium">
            Định dạng:{" "}
            {format.mode === "ai" ? "AI đã chỉnh theo header chuẩn" : "chỉ chuẩn hóa bằng code"}
          </div>
          {format.note && <div className="mt-1 text-amber-700">{format.note}</div>}
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {format.applied.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mt-1 text-muted-foreground">
            index.html: {formatSize(format.diff.bytesBefore)} → {formatSize(format.diff.bytesAfter)}
          </div>
        </div>
      )}
      {v.report.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          {v.report.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <div>
        <div className="mb-2 text-xs font-medium">
          Lỗi cần IT xem ({v.findings.length}) — đã gửi báo cáo qua Telegram
        </div>
        {v.findings.length === 0 && v.status === "ready" && (
          <div className="text-xs text-muted-foreground">Không phát hiện lỗi.</div>
        )}
        <ul className="space-y-2">
          {v.findings.map((f, i) => (
            <li
              key={`${f.category}-${i}`}
              className={`rounded-md border p-3 text-xs ${SEVERITY[f.severity].className}`}
            >
              <div className="font-medium">
                {SEVERITY[f.severity].label} · {f.category}
                {f.source === "ai" ? " · AI" : ""}
              </div>
              <div className="mt-0.5">{f.message}</div>
              {f.evidence && (
                <div className="mt-1 break-words font-mono text-[11px] opacity-80">
                  {f.evidence}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function LandingCard({ campaignId, onPublished }: Props) {
  const list = useServerFn(listLandingVersionsFn);
  const process = useServerFn(processLandingVersionFn);
  const publish = useServerFn(publishLandingVersionFn);
  const rollback = useServerFn(rollbackLandingFn);

  const [data, setData] = useState<Listing | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<LandingVersionView | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const next = await list({ data: { campaign_id: campaignId } });
    setData(next);
    setSelected((current) => current ?? next.versions[0]?.id ?? null);
  }, [list, campaignId]);

  useEffect(() => {
    refresh().catch((err) => toast.error(errorText(err)));
  }, [refresh]);

  async function runProcess(versionId: string) {
    setBusy("Đang chuẩn hóa định dạng và kiểm tra nội dung bằng AI… (có thể mất 1–2 phút)");
    try {
      await process({ data: { version_id: versionId } });
      toast.success("Đã xử lý xong — báo cáo đã gửi team IT");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function onFile(file: File) {
    setBusy("Đang tải lên và kiểm tra tệp .zip…");
    const form = new FormData();
    form.append("file", file);
    form.append("campaign_id", String(campaignId));
    try {
      const res = await fetch("/api/v1/landing-uploads", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        version?: { id: string };
      };
      if (!res.ok || !body.version)
        throw new Error(body.error ?? `Tải lên thất bại (${res.status})`);
      setSelected(body.version.id);
      await refresh();
      await runProcess(body.version.id);
    } catch (err) {
      toast.error(errorText(err));
      setBusy(null);
    }
  }

  async function doPublish(v: LandingVersionView, confirmCritical: boolean) {
    try {
      await publish({ data: { version_id: v.id, confirm_critical: confirmCritical } });
      toast.success("Đã xuất bản landing — menu và banner trang chủ trỏ tới trang mới");
      await refresh();
      onPublished();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  function onPublish(v: LandingVersionView) {
    if (v.critical_count > 0) setConfirming(v);
    else void doPublish(v, false);
  }

  async function onRollback() {
    if (!confirm("Quay lại phiên bản đã xuất bản trước đó?")) return;
    try {
      await rollback({ data: { campaign_id: campaignId } });
      toast.success("Đã quay lại phiên bản trước");
      await refresh();
      onPublished();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const versions = data?.versions ?? [];
  const current = versions.find((v) => v.id === selected) ?? null;

  return (
    <Card>
      <CardHeader
        title="Landing page"
        hint="Tải lên .zip (index.html + thư mục assets/). AI chỉnh header theo thanh điều hướng của website và báo lỗi nội dung cho team IT."
        action={
          <div className="flex items-center gap-2">
            {data?.live_url && (
              <button
                type="button"
                onClick={onRollback}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
              >
                <RotateCcw className="h-3 w-3" /> Quay lại bản trước
              </button>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background disabled:opacity-50"
            >
              <Upload className="h-3 w-3" /> Tải landing (.zip)
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void onFile(file);
              }}
            />
          </div>
        }
      />
      <div className="space-y-3 p-5 text-sm">
        {data?.live_url ? (
          <div className="text-xs">
            Đang xuất bản:{" "}
            <a
              href={data.live_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-blue-700 hover:underline"
            >
              {data.live_url} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Chưa xuất bản landing tải lên nào.</div>
        )}
        {busy && (
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {busy}
          </div>
        )}
        {versions.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {versions.map((v) => (
              <li
                key={v.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs ${
                  v.id === selected ? "bg-muted/50" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelected(v.id)}
                  className="font-mono hover:underline"
                >
                  {v.id.slice(0, 8)}
                </button>
                <span>{formatTime(v.created_at)}</span>
                <span className="text-muted-foreground">{v.uploader ?? "—"}</span>
                <span className="text-muted-foreground">
                  {v.file_count} tệp · {formatSize(v.total_bytes)}
                </span>
                <span>{STATUS_LABEL[v.status]}</span>
                {v.status === "ready" && <Counts v={v} />}
                {v.is_live && (
                  <span className="rounded bg-emerald-100 px-1.5 text-emerald-800">
                    Đang xuất bản
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <a
                    href={v.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                  >
                    Xem trước <ExternalLink className="h-3 w-3" />
                  </a>
                  {v.status === "processing" && busy === null && (
                    <button
                      type="button"
                      onClick={() => void runProcess(v.id)}
                      className="underline"
                    >
                      Chạy lại kiểm tra
                    </button>
                  )}
                  {v.status === "ready" && !v.is_live && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => onPublish(v)}
                      className="rounded-md bg-emerald-600 px-2 py-1 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Xuất bản
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {current && <VersionDetail v={current} />}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Vẫn xuất bản?"
        description={`Phiên bản này có ${confirming?.critical_count ?? 0} lỗi nghiêm trọng (xem danh sách bên dưới). Team IT đã nhận báo cáo. Xuất bản ngay thì khách sẽ thấy các lỗi này.`}
        confirmLabel="Vẫn xuất bản"
        destructive
        onConfirm={async () => {
          if (confirming) await doPublish(confirming, true);
        }}
      />
    </Card>
  );
}
