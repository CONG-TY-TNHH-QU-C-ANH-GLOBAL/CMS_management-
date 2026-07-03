// Shared moderation-UI chrome for the community CMS pages (Q&A + Reviews). The
// two moderation queues share the same status model, filter tabs, status
// select, badges, meta row and empty state — extracted here so each page only
// holds its own per-item body (expert answer vs rating/evidence/summary).

import { BadgeCheck, Calendar, Inbox, Mail, Tag } from "lucide-react";
import type { ReactNode } from "react";

export type ModerationStatus = "pending" | "published" | "rejected";

export const MODERATION_STATUS_META: Record<ModerationStatus, { label: string; color: string }> = {
  pending: { label: "Chờ duyệt", color: "bg-amber-100 text-amber-800 border-amber-300" },
  published: { label: "Đã đăng", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  rejected: { label: "Từ chối", color: "bg-rose-100 text-rose-800 border-rose-300" },
};

export interface ModerationCounts {
  all: number;
  pending: number;
  published: number;
  rejected: number;
}

export function formatModerationTime(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return new Date(seconds * 1000).toLocaleString("vi-VN");
}

/** Tallies status counts for the filter tabs. */
export function tallyStatuses<T extends { status: ModerationStatus }>(rows: T[]): ModerationCounts {
  const c: ModerationCounts = { all: rows.length, pending: 0, published: 0, rejected: 0 };
  for (const r of rows) c[r.status]++;
  return c;
}

export function ModerationTabs({
  counts,
  filter,
  onFilter,
}: Readonly<{
  counts: ModerationCounts;
  filter: "all" | ModerationStatus;
  onFilter: (f: "all" | ModerationStatus) => void;
}>) {
  const tabs = [
    { key: "pending", label: `Chờ duyệt (${counts.pending})` },
    { key: "published", label: `Đã đăng (${counts.published})` },
    { key: "rejected", label: `Từ chối (${counts.rejected})` },
    { key: "all", label: `Tất cả (${counts.all})` },
  ] as const;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onFilter(t.key)}
          className={`h-9 px-3 rounded-lg text-sm font-medium transition ${
            filter === t.key
              ? "bg-foreground text-background"
              : "border border-border bg-surface text-foreground hover:bg-surface-muted"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ModerationStatusBadge({ status }: Readonly<{ status: ModerationStatus }>) {
  const meta = MODERATION_STATUS_META[status];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.color}`}>
      {meta.label}
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-sky-100 text-sky-800 border-sky-300">
      <BadgeCheck className="w-3 h-3" /> Verified
    </span>
  );
}

export function ModerationStatusSelect({
  value,
  disabled,
  onChange,
}: Readonly<{ value: ModerationStatus; disabled?: boolean; onChange: (status: ModerationStatus) => void }>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ModerationStatus)}
      disabled={disabled}
      className="h-8 px-2 text-xs rounded-md border border-border bg-background disabled:opacity-50"
    >
      {(Object.keys(MODERATION_STATUS_META) as ModerationStatus[]).map((s) => (
        <option key={s} value={s}>{MODERATION_STATUS_META[s].label}</option>
      ))}
    </select>
  );
}

/** Author/email/category/created-at row; page-specific extras go in children. */
export function ModerationMetaRow({
  name,
  email,
  categoryName,
  createdAt,
  children,
}: Readonly<{
  name: string;
  email: string;
  categoryName?: string | null;
  createdAt: number;
  children?: ReactNode;
}>) {
  return (
    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
      <span>{name}</span>
      <span className="inline-flex items-center gap-1">
        <Mail className="w-3 h-3" />
        <a href={`mailto:${email}`} className="hover:text-foreground">{email}</a>
      </span>
      {categoryName && (
        <span className="inline-flex items-center gap-1">
          <Tag className="w-3 h-3" />
          {categoryName}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <Calendar className="w-3 h-3" />
        {formatModerationTime(createdAt)}
      </span>
      {children}
    </div>
  );
}

export function ModerationEmpty({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <div className="p-12 text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-muted grid place-items-center mb-3">
        <Inbox className="w-5 h-5 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}
