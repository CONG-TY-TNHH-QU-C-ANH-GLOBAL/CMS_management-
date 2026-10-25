// Real bindings for the landing host (see landing.host.ts for the boundary).
// Imported lazily by src/server.ts only for requests on the landing host.

import leadScriptSource from "./thg-lead.js?raw";

import { leadScriptConfig, type LandingEnv } from "./landing.config";
import type { LandingHostDeps } from "./landing.host";

type HostEnv = LandingEnv & { DB: D1Database; MEDIA: R2Bucket };

export function landingHostDeps(env: HostEnv): LandingHostDeps {
  return {
    async resolveLive(slug) {
      const row = await env.DB.prepare(
        `SELECT landing_version_id AS id FROM campaigns
          WHERE slug = ? AND locale = 'vi' AND landing_version_id IS NOT NULL LIMIT 1`,
      )
        .bind(slug)
        .first<{ id: string }>();
      return row?.id ?? null;
    },
    async resolvePreview(versionId) {
      const row = await env.DB.prepare(
        `SELECT slug FROM campaign_landing_versions WHERE id = ? AND status != 'failed' LIMIT 1`,
      )
        .bind(versionId)
        .first<{ slug: string }>();
      return row?.slug ?? null;
    },
    async getObject(key, headOnly) {
      const object = headOnly ? await env.MEDIA.head(key) : await env.MEDIA.get(key);
      if (!object) return null;
      return {
        body: "body" in object ? (object.body as ReadableStream) : null,
        etag: object.httpEtag ?? null,
        size: object.size,
      };
    },
    leadScript: () => leadScriptConfig(env) + leadScriptSource,
  };
}
