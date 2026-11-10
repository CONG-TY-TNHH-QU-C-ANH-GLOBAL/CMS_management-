// Server-only bodies for the campaign server functions. campaigns.actions.ts
// imports this module lazily inside each handler, so nothing here (D1, auth,
// KV) reaches the browser bundle. Keeping the bodies here also means the
// role check + cache bump is written once instead of per handler.
//
// Role split matches events: viewer reads, editor writes, admin deletes.

import { bumpCmsRev } from "@/core/db/mutations";
import { requireSession } from "@/features/auth";
import { getMedia } from "@/features/media";
import { toMediaUrl } from "@/features/partners/partners.media";

import * as translations from "../translations/campaign.translation.service";
import { parseMenuItems } from "./campaigns.pure";
import * as service from "./campaigns.service";

type Role = "viewer" | "editor" | "admin";

/** Require a role, run the mutation, then make the public edge cache and the
 *  landing prerender stale (bumpCmsRev). */
async function mutate<T>(role: Role, run: (actorId: number) => Promise<T>): Promise<T> {
  const me = await requireSession(role);
  const result = await run(me.id);
  await bumpCmsRev();
  return result;
}

async function adminMediaUrl(id: number | null): Promise<string | null> {
  if (!id) return null;
  const media = await getMedia(id);
  // Relative on purpose: the admin is served by this same Worker.
  return media ? toMediaUrl(media.r2_key, "") : null;
}

export async function listCampaigns() {
  await requireSession("viewer");
  return { campaigns: await service.listCampaigns() };
}

export async function getCampaignDetail(slug: string) {
  await requireSession("viewer");
  const campaign = await service.getCampaign(slug);
  if (!campaign) {
    return { campaign: null, cover_url: null, og_image_url: null, menu_image_urls: {} };
  }
  const cardImageIds = parseMenuItems(campaign.menu_items_json)
    .map((item) => item.card?.image_media_id ?? null)
    .filter((id): id is number => id !== null);
  const [cover_url, og_image_url, cardUrls] = await Promise.all([
    adminMediaUrl(campaign.cover_media_id),
    adminMediaUrl(campaign.og_image_id),
    Promise.all(cardImageIds.map(async (id) => [id, await adminMediaUrl(id)] as const)),
  ]);
  // media id → admin-relative URL, for the card image previews in the editor.
  const menu_image_urls: Record<number, string> = {};
  for (const [id, url] of cardUrls) if (url) menu_image_urls[id] = url;
  return { campaign, cover_url, og_image_url, menu_image_urls };
}

export const createCampaign = (data: service.CampaignInput) =>
  mutate("editor", async (actorId) => ({
    campaign: await service.createCampaign(actorId, data),
  }));

export const updateCampaign = (data: service.UpdateCampaignInput) =>
  mutate("editor", async (actorId) => ({
    campaign: await service.updateCampaign(actorId, data),
  }));

export const deleteCampaign = (id: number) =>
  mutate("admin", async (actorId) => {
    await service.deleteCampaign(actorId, id);
    return { ok: true as const };
  });

// ── Translation review (TranslationReviewDialog RPCs) ───────────────────────

export async function listCampaignTranslations(campaignId: number) {
  await requireSession("viewer");
  return translations.listCampaignTranslationsForId(campaignId);
}

export const approveCampaignTranslation = (id: number) =>
  mutate("editor", (actorId) => translations.approveCampaignTranslation(actorId, id));

export const editCampaignTranslation = (data: translations.CampaignTranslationEditInput) =>
  mutate("editor", (actorId) => translations.editCampaignTranslation(actorId, data));

export const deleteCampaignTranslation = (id: number) =>
  mutate("editor", async (actorId) => {
    await translations.deleteCampaignTranslation(actorId, id);
    return { ok: true as const };
  });
