// Server-only wiring for campaign landing uploads: real D1 / R2 / AI /
// Telegram behind LandingDeps, plus the role checks. Imported lazily by
// landing.actions.ts and the upload route, so none of it reaches the browser.
//
// Roles: viewer reads versions and findings; editor uploads, processes,
// publishes and rolls back.

import { env } from "cloudflare:workers";

import "@/core/db/env";
import { auditLog, bumpCmsRev } from "@/core/db/mutations";
import { requireSession } from "@/features/auth";
import { dispatchEvent } from "@/features/telegram";

import { vnToday } from "../campaigns.pure";
import auditPrompt from "./audit.prompt.md?raw";
import formatPrompt from "./format.prompt.md?raw";
import { createLandingAi } from "./landing.ai";
import { landingOriginOf } from "./landing.config";
import * as service from "./landing.service";

function newVersionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function landingDeps(): service.LandingDeps {
  // Never log this value.
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  return {
    db: env.DB,
    bucket: env.MEDIA,
    ai: apiKey ? createLandingAi({ apiKey, model: env.LANDING_AI_MODEL }) : null,
    prompts: { format: formatPrompt, audit: auditPrompt },
    auditLog,
    bumpCmsRev,
    dispatch: dispatchEvent,
    landingOrigin: landingOriginOf(env),
    adminOrigin: env.BASE_URL.replace(/\/+$/, ""),
    newVersionId,
    today: () => vnToday(),
  };
}

export async function uploadLanding(
  actorId: number,
  input: { campaignId: number; fileName: string; zip: Uint8Array },
) {
  return service.uploadLanding(landingDeps(), actorId, input);
}

export async function listLandingVersions(campaignId: number) {
  await requireSession("viewer");
  return service.listLandingVersions(landingDeps(), campaignId);
}

export async function processLandingVersion(versionId: string) {
  await requireSession("editor");
  const version = await service.processLanding(landingDeps(), versionId);
  return { id: version.id, status: version.status };
}

export async function publishLandingVersion(versionId: string, confirmCritical: boolean) {
  const me = await requireSession("editor");
  return service.publishLanding(landingDeps(), me.id, { versionId, confirmCritical });
}

export async function rollbackLanding(campaignId: number) {
  const me = await requireSession("editor");
  return service.rollbackLanding(landingDeps(), me.id, campaignId);
}
