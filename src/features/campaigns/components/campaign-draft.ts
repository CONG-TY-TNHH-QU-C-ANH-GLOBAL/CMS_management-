// Editor state for one campaign: row → draft, draft → save payload, and the
// field specs the editor renders. Pure, so it is shared by the component and
// unit tests without a DOM.

import type { CampaignRow, CampaignStatus } from "@/features/campaigns/campaigns.actions";
import { effectiveFlag, parseMenuItems, vnToday } from "@/features/campaigns/campaigns.pure";

import type { MenuItemDraft } from "./MenuItemsEditor";

export interface CampaignDraft {
  title: string;
  summary: string;
  body_md: string;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
  position: number;
  landing_path: string;
  cta_label: string;
  nav_featured: boolean;
  nav_label: string;
  nav_badge: string;
  home_featured: boolean;
  menu_items: MenuItemDraft[];
  seo_title: string;
  seo_description: string;
  cover_media_id: number | null;
  og_image_id: number | null;
}

export type TextKey =
  | "title"
  | "summary"
  | "landing_path"
  | "cta_label"
  | "nav_label"
  | "nav_badge"
  | "seo_title"
  | "seo_description";

export interface TextSpec {
  key: TextKey;
  label: string;
  max: number;
  /** Search-engine display length; past it the counter turns amber. */
  ideal?: number;
  hint?: string;
  placeholder?: string;
  /** Textarea rows; omitted means a single-line input. */
  rows?: number;
  mono?: boolean;
  required?: boolean;
}

export const CONTENT_FIELDS: readonly TextSpec[] = [
  { key: "title", label: "Tiêu đề", max: 200, required: true },
  {
    key: "summary",
    label: "Tóm tắt",
    max: 500,
    rows: 3,
    hint: "Hiện trên thẻ Chương trình ở trang chủ và trang danh sách.",
  },
];

export const LINK_FIELDS: readonly TextSpec[] = [
  {
    key: "landing_path",
    label: "Trang đích",
    max: 500,
    mono: true,
    placeholder: "/christmas",
    hint: "Đường dẫn nội bộ không kèm ngôn ngữ (/christmas) hoặc https://… Bỏ trống thì dùng trang chi tiết.",
  },
  { key: "cta_label", label: "Chữ trên nút CTA", max: 80, placeholder: "Khám phá bộ sưu tập" },
];

export const NAV_FIELDS: readonly TextSpec[] = [
  { key: "nav_label", label: "Tên trên menu", max: 40, placeholder: "Christmas" },
  {
    key: "nav_badge",
    label: "Nhãn nhỏ (badge)",
    max: 16,
    placeholder: "NEW",
    hint: "Ví dụ NEW, HOT. Bỏ trống để ẩn.",
  },
];

export const SEO_FIELDS: readonly TextSpec[] = [
  { key: "seo_title", label: "SEO title", max: 200, ideal: 60, hint: "Bỏ trống thì dùng tiêu đề." },
  {
    key: "seo_description",
    label: "SEO description",
    max: 300,
    ideal: 160,
    rows: 2,
    hint: "Bỏ trống thì dùng tóm tắt.",
  },
];

const TEXT_KEYS: readonly TextKey[] = [
  ...CONTENT_FIELDS,
  ...LINK_FIELDS,
  ...NAV_FIELDS,
  ...SEO_FIELDS,
].map((spec) => spec.key);

export function draftFromRow(row: CampaignRow): CampaignDraft {
  const text = Object.fromEntries(TEXT_KEYS.map((key) => [key, row[key] ?? ""])) as Record<
    TextKey,
    string
  >;
  return {
    ...text,
    body_md: row.body_md ?? "",
    start_date: row.start_date ?? "",
    end_date: row.end_date ?? "",
    status: row.status,
    position: row.position,
    nav_featured: row.nav_featured === 1,
    home_featured: row.home_featured === 1,
    menu_items: parseMenuItems(row.menu_items_json).map((item) => ({
      ...item,
      subtitle: item.subtitle ?? "",
    })),
    cover_media_id: row.cover_media_id,
    og_image_id: row.og_image_id,
  };
}

/** "" is how a cleared input reads; the column wants NULL for "not set". */
const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

export function draftProblem(draft: CampaignDraft): string | null {
  if (!draft.title.trim()) return "Tiêu đề bắt buộc.";
  if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
    return "Ngày kết thúc phải sau ngày bắt đầu.";
  }
  return null;
}

export function draftToPayload(id: number, draft: CampaignDraft) {
  const text = Object.fromEntries(TEXT_KEYS.map((key) => [key, orNull(draft[key])])) as Record<
    TextKey,
    string | null
  >;
  return {
    ...text,
    id,
    title: draft.title.trim(),
    body_md: orNull(draft.body_md),
    start_date: orNull(draft.start_date),
    end_date: orNull(draft.end_date),
    status: draft.status,
    position: draft.position,
    nav_featured: draft.nav_featured,
    home_featured: draft.home_featured,
    cover_media_id: draft.cover_media_id,
    og_image_id: draft.og_image_id,
    menu_items: draft.menu_items.map((item) => ({
      icon: item.icon.trim(),
      title: item.title.trim(),
      subtitle: orNull(item.subtitle),
      href: item.href.trim(),
    })),
  };
}

/** Why an operator toggle is on but the website does not show it. */
export function flagNote(on: boolean, draft: CampaignDraft): string | null {
  if (!on || effectiveFlag(1, draft.status, orNull(draft.end_date), vnToday())) return null;
  return draft.status === "live"
    ? "Đã qua ngày kết thúc — website không còn hiển thị."
    : "Chương trình chưa xuất bản — website chưa hiển thị.";
}
