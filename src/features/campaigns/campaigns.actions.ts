// Server functions for the Campaign admin module (/admin/content/campaigns).
//
// Validation lives here; the bodies live in campaigns.server.ts, imported
// lazily inside each handler so D1 never reaches the browser bundle (same
// reason events.actions.ts imports its service inside the handler).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isValidCampaignHref } from "./campaigns.pure";

export type { CampaignRow, CampaignStatus } from "./campaigns.service";
export type { CampaignTranslationRow } from "../translations/campaign.translation.service";

const ID = z.number().int().positive();
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải theo định dạng YYYY-MM-DD.");
const SLUG = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang.");
const HREF = z
  .string()
  .trim()
  .max(500)
  .refine(
    isValidCampaignHref,
    "Link phải là đường dẫn nội bộ bắt đầu bằng / (không kèm /vi, /en) hoặc https://…",
  );

/** Optional text that stores NULL rather than "" when cleared. */
const text = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (typeof value === "string" && value.trim() === "" ? null : value));

const menuItem = z.object({
  icon: z.string().trim().max(16),
  title: z.string().trim().min(1, "Mục menu cần tiêu đề.").max(120),
  subtitle: text(200),
  href: HREF,
});

const flag = z
  .boolean()
  .optional()
  .transform((value) => (value === undefined ? undefined : value ? 1 : 0));

const campaignFields = z.object({
  title: z.string().trim().min(1).max(200),
  summary: text(500),
  body_md: text(60_000),
  cover_media_id: ID.nullable().optional(),
  og_image_id: ID.nullable().optional(),
  start_date: ISO_DATE.nullable().optional(),
  end_date: ISO_DATE.nullable().optional(),
  status: z.enum(["draft", "live", "archived"]).optional(),
  position: z.number().int().min(0).max(10_000).optional(),
  landing_path: HREF.nullable().optional(),
  cta_label: text(80),
  nav_featured: flag,
  nav_label: text(40),
  nav_badge: text(16),
  home_featured: flag,
  menu_items: z.array(menuItem).max(24).optional(),
  seo_title: text(200),
  seo_description: text(300),
});

/** menu_items (array) → menu_items_json (column); the rest passes through. */
function toColumns<T extends { menu_items?: unknown[] }>(data: T) {
  const { menu_items, ...rest } = data;
  return menu_items === undefined ? rest : { ...rest, menu_items_json: JSON.stringify(menu_items) };
}

const campaignCreate = campaignFields.extend({ slug: SLUG });
const campaignUpdate = campaignFields.partial().extend({ id: ID });

export const listCampaignsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./campaigns.server")).listCampaigns(),
);

export const getCampaignDetailFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: SLUG }).parse(data))
  .handler(async ({ data }) => (await import("./campaigns.server")).getCampaignDetail(data.slug));

export const createCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => toColumns(campaignCreate.parse(data)))
  .handler(async ({ data }) => (await import("./campaigns.server")).createCampaign(data));

export const updateCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => toColumns(campaignUpdate.parse(data)))
  .handler(async ({ data }) => (await import("./campaigns.server")).updateCampaign(data));

export const deleteCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: ID }).parse(data))
  .handler(async ({ data }) => (await import("./campaigns.server")).deleteCampaign(data.id));

// ── Translation review RPCs ────────────────────────────────────────────────

const byId = (data: unknown) => z.object({ id: ID }).parse(data);
const prose = z.string().max(60_000).nullable();

export const listCampaignTranslationsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ campaign_id: ID }).parse(data))
  .handler(async ({ data }) =>
    (await import("./campaigns.server")).listCampaignTranslations(data.campaign_id),
  );

export const approveCampaignTranslationFn = createServerFn({ method: "POST" })
  .inputValidator(byId)
  .handler(async ({ data }) =>
    (await import("./campaigns.server")).approveCampaignTranslation(data.id),
  );

export const editCampaignTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: ID,
        title: z.string().trim().min(1).max(2000),
        summary: prose,
        body_md: prose,
        cta_label: prose,
        nav_label: prose,
        menu_items_json: prose,
        seo_title: prose,
        seo_description: prose,
      })
      .parse(data),
  )
  .handler(async ({ data }) => (await import("./campaigns.server")).editCampaignTranslation(data));

export const deleteCampaignTranslationFn = createServerFn({ method: "POST" })
  .inputValidator(byId)
  .handler(async ({ data }) =>
    (await import("./campaigns.server")).deleteCampaignTranslation(data.id),
  );
