import { uploadMediaFile } from "@/features/media/media.upload-client";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, ExternalLink, FileUp, Link2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import {
  activateMonthlySourcingYearFn,
  createMonthlySourcingYearFn,
  getMonthlySourcingAdminFn,
  updateMonthlySourcingMonthFn,
  type MonthlySourcingAdminMonth,
  type MonthlySourcingAdminYear,
  type MonthlySourcingStatus,
} from "@/features/monthly-sourcing/monthly-sourcing.actions";
import { monthlySourcingSlug } from "@/features/monthly-sourcing/monthly-sourcing.pure";
import { MONTHLY_SOURCING_MEDIA_TAG } from "@/features/monthly-sourcing/monthly-sourcing.validation";

export const Route = createFileRoute("/admin/content/monthly-sourcing/")({
  head: () => ({ meta: [{ title: "Top sản phẩm & nguồn hàng — TH Group Content OS" }] }),
  loader: () => getMonthlySourcingAdminFn(),
  component: MonthlySourcingPage,
});

const STATUS_LABEL: Record<MonthlySourcingStatus, string> = {
  draft: "Nháp",
  live: "Xuất bản",
  archived: "Lưu trữ",
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Thao tác thất bại";
}

function NewYearForm({ onCreated }: Readonly<{ onCreated: (id: number) => void }>) {
  const create = useServerFn(createMonthlySourcingYearFn);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await create({ data: { year: Number(year) } });
      toast.success(`Đã tạo 12 tháng cho năm ${result.year}`);
      onCreated(result.id);
    } catch (error) {
      toast.error(message(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex items-center gap-2" onSubmit={onSubmit}>
      <input
        aria-label="Năm nguồn hàng mới"
        type="number"
        min={2020}
        max={2100}
        value={year}
        onChange={(event) => setYear(event.target.value)}
        className="h-9 w-25 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-medium text-background shadow-soft hover:opacity-90 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarDays className="h-4 w-4" />
        )}
        Tạo năm
      </button>
    </form>
  );
}

function MonthRow({
  year,
  yearIsLive,
  row,
  onChanged,
}: Readonly<{
  year: number;
  yearIsLive: boolean;
  row: MonthlySourcingAdminMonth;
  onChanged: () => void;
}>) {
  const update = useServerFn(updateMonthlySourcingMonthFn);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(row.title);
  const [status, setStatus] = useState<MonthlySourcingStatus>(row.status);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setTitle(row.title);
    setStatus(row.status);
  }, [row.title, row.status]);

  async function save(data: {
    title?: string;
    pdf_media_id?: number | null;
    status?: MonthlySourcingStatus;
  }) {
    setPending(true);
    try {
      await update({ data: { id: row.id, ...data } });
      onChanged();
      return true;
    } catch (error) {
      toast.error(message(error));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Chỉ nhận tệp PDF.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setPending(true);
    try {
      const toastId = toast.loading(`Đang tải PDF tháng ${row.month}...`);
      let media;
      try {
        media = await uploadMediaFile(file, {
          tag: MONTHLY_SOURCING_MEDIA_TAG,
          title,
          alt_text: title,
          onProgress: (f, stats) => {
            const speed = stats ? ` · ${(stats.bytesPerSec / 1024 / 1024).toFixed(1)} MB/s · còn ~${Math.ceil(stats.etaSec)}s` : "";
            toast.loading(`Đang tải PDF tháng ${row.month}: ${Math.round(f * 100)}%${speed}`, { id: toastId });
          },
        });
      } finally {
        toast.dismiss(toastId);
      }
      if (!media?.id || media.mime !== "application/pdf") {
        throw new Error("Tệp tải lên không phải PDF hợp lệ.");
      }
      await update({ data: { id: row.id, pdf_media_id: media.id } });
      toast.success(`Đã gắn PDF cho tháng ${row.month}`);
      onChanged();
    } catch (error) {
      toast.error(message(error));
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const lpUrl = `https://lp.thgfulfill.com/${monthlySourcingSlug(year, row.month)}`;
  const publicPageIsLive =
    yearIsLive &&
    row.status === "live" &&
    row.pdf_mime === "application/pdf" &&
    row.pdf_media_status === "ready" &&
    row.pdf_monthly_pdf_verified === 1;

  return (
    <tr className="border-t border-border align-top">
      <td className="whitespace-nowrap px-4 py-3 font-medium">Tháng {row.month}</td>
      <td className="min-w-60 px-3 py-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            if (title.trim() && title !== row.title) void save({ title: title.trim() });
          }}
          disabled={pending}
          aria-label={`Tiêu đề tháng ${row.month}`}
          className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </td>
      <td className="min-w-56 px-3 py-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => void onUpload(event.target.files?.[0] ?? null)}
          disabled={pending}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-medium hover:bg-surface-muted disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileUp className="h-3.5 w-3.5" />
            )}
            {row.pdf_media_id ? "Thay PDF" : "Tải PDF"}
          </button>
          {row.pdf_url ? (
            <a
              href={row.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Mở PDF <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">Chưa có PDF</span>
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <select
          value={status}
          onChange={async (event) => {
            const next = event.target.value as MonthlySourcingStatus;
            setStatus(next);
            if (!(await save({ status: next }))) setStatus(row.status);
          }}
          disabled={pending}
          aria-label={`Trạng thái tháng ${row.month}`}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          {(Object.keys(STATUS_LABEL) as MonthlySourcingStatus[]).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABEL[value]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        {publicPageIsLive ? (
          <a
            href={lpUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Link2 className="h-3.5 w-3.5" /> Link trang
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">Xuất bản PDF để có link</span>
        )}
      </td>
    </tr>
  );
}

function MonthlySourcingPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const years = data.years as MonthlySourcingAdminYear[];
  const activate = useServerFn(activateMonthlySourcingYearFn);
  const [selectedId, setSelectedId] = useState<number | null>(years[0]?.id ?? null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    // A newly-created year is selected before router.invalidate() delivers its
    // refreshed loader data. Do not replace that pending id with the old first
    // row in the short gap, otherwise operators land back on the prior year.
    if (selectedId === null) setSelectedId(years[0]?.id ?? null);
  }, [years, selectedId]);

  const selected = years.find((year) => year.id === selectedId) ?? null;
  const refresh = () => void router.invalidate();

  async function activateYear() {
    if (!selected) return;
    setActivating(true);
    try {
      await activate({ data: { id: selected.id } });
      toast.success(`Đang hiển thị các tháng của năm ${selected.year} trên menu website`);
      refresh();
    } catch (error) {
      toast.error(message(error));
    } finally {
      setActivating(false);
    }
  }

  return (
    <>
      <CmsTopbar
        title="Top sản phẩm & nguồn hàng"
        subtitle="Quản lý theo năm; mỗi tháng chỉ cần tải PDF rồi xuất bản"
        action={
          <NewYearForm
            onCreated={(id) => {
              setSelectedId(id);
              refresh();
            }}
          />
        }
      />
      <PageContainer>
        {years.length === 0 ? (
          <Card className="p-8 text-center">
            <CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">Chưa có năm nào</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tạo năm đầu tiên để có sẵn 12 ô tải PDF.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {years.map((year) => (
                <button
                  key={year.id}
                  type="button"
                  onClick={() => setSelectedId(year.id)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    selected?.id === year.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-surface hover:bg-surface-muted"
                  }`}
                >
                  {year.year}
                  {year.nav_active === 1 ? " · Đang hiển thị" : ""}
                </button>
              ))}
            </div>

            {selected && (
              <Card className="overflow-hidden">
                <CardHeader
                  title={`${selected.title} ${selected.year}`}
                  hint={
                    selected.nav_active === 1
                      ? "Website đang hiển thị các tháng PDF đã xuất bản của năm này."
                      : "Năm này vẫn giữ link cũ nếu đã xuất bản, nhưng chưa hiển thị trong menu."
                  }
                  action={
                    selected.nav_active === 1 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" /> Đang hiển thị
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void activateYear()}
                        disabled={activating}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
                      >
                        {activating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Hiển thị năm {selected.year}
                      </button>
                    )
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-muted/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Tháng</th>
                        <th className="px-3 py-2.5 font-medium">Tiêu đề trang</th>
                        <th className="px-3 py-2.5 font-medium">Tài liệu</th>
                        <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                        <th className="px-4 py-2.5 font-medium">Landing page</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.months.map((month) => (
                        <MonthRow
                          key={month.id}
                          year={selected.year}
                          yearIsLive={selected.status === "live"}
                          row={month}
                          onChanged={refresh}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}
      </PageContainer>
    </>
  );
}
