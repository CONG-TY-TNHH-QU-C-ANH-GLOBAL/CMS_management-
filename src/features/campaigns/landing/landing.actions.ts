// Server functions for the campaign "Landing page" card. Bodies live in
// landing.server.ts (imported lazily, so D1/R2/AI never reach the browser).
// The .zip itself goes through the multipart route /api/v1/landing-uploads.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { LandingVersionView } from "./landing.service";
export type { LandingFinding, FindingSeverity } from "./landing.types";

const CAMPAIGN_ID = z.number().int().positive();
const VERSION_ID = z.string().regex(/^[a-f0-9]{32}$/, "Mã phiên bản không hợp lệ.");

export const listLandingVersionsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ campaign_id: CAMPAIGN_ID }).parse(data))
  .handler(async ({ data }) =>
    (await import("./landing.server")).listLandingVersions(data.campaign_id),
  );

export const processLandingVersionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ version_id: VERSION_ID }).parse(data))
  .handler(async ({ data }) =>
    (await import("./landing.server")).processLandingVersion(data.version_id),
  );

export const publishLandingVersionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ version_id: VERSION_ID, confirm_critical: z.boolean().default(false) }).parse(data),
  )
  .handler(async ({ data }) =>
    (await import("./landing.server")).publishLandingVersion(
      data.version_id,
      data.confirm_critical,
    ),
  );

export const rollbackLandingFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ campaign_id: CAMPAIGN_ID }).parse(data))
  .handler(async ({ data }) =>
    (await import("./landing.server")).rollbackLanding(data.campaign_id),
  );
