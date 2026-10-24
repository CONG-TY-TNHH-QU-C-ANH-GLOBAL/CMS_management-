// Public response schemas for /api/v1/campaigns. The shape is the frozen
// CMS ↔ landing contract (runs/xmas-campaigns-20261024/contract.md);
// src/openapi/contract-bindings.ts asserts the route configs register THESE
// objects.

import { z } from "zod";

const localeSchema = z.enum(["en", "vi", "zh"]);

const menuItemSchema = z.object({
  /** Short string, normally one emoji. */
  icon: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  /** Internal path without the language prefix, or an absolute https URL. */
  href: z.string(),
});

const campaignBase = {
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  cover_url: z.string().nullable(),
  og_image_url: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  position: z.number().int(),
  /** Null → the landing links to /campaigns/:slug. */
  landing_path: z.string().nullable(),
  cta_label: z.string().nullable(),
  /** EFFECTIVE flag: toggle on, live, and today (Asia/Ho_Chi_Minh) <= end_date. */
  nav_featured: z.boolean(),
  nav_label: z.string().nullable(),
  nav_badge: z.string().nullable(),
  /** EFFECTIVE flag, same rule as nav_featured. */
  home_featured: z.boolean(),
  menu_items: z.array(menuItemSchema),
  updated_at: z.number().int(),
};

export const campaignSchema = z.object(campaignBase);

export const campaignDetailSchema = z.object({
  ...campaignBase,
  body_md: z.string().nullable(),
  seo_title: z.string().nullable(),
  seo_description: z.string().nullable(),
});

export const campaignsResponseSchema = z.object({
  locale: localeSchema,
  campaigns: z.array(campaignSchema),
});

export const campaignResponseSchema = z.object({
  campaign: campaignDetailSchema,
  available_locales: z.array(localeSchema),
});

export type PublicCampaign = z.infer<typeof campaignSchema>;
export type PublicCampaignDetail = z.infer<typeof campaignDetailSchema>;
