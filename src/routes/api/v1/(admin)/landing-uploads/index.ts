import { createFileRoute } from "@tanstack/react-router";

import { withRequiredSession } from "@/features/auth/auth.guard";
import { FormFieldTypeError, requiredFileField } from "@/features/media/media.form";

// Admin multipart upload for a campaign landing page (.zip: index.html + assets/).
// Same-origin from the campaign editor, no CORS. withRequiredSession("editor") runs the
// session + CSRF check before the body; the brand is what the public-surface gate reads.
//
// This only validates and stores the version. The editor then calls
// processLandingVersionFn (AI format + audit + Telegram) so a slow AI call never holds the
// upload request.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const Route = createFileRoute("/api/v1/(admin)/landing-uploads/")({
  server: {
    handlers: {
      POST: withRequiredSession("editor", async ({ request }: { request: Request }, me) => {
        const { BundleError, LANDING_LIMITS } =
          await import("@/features/campaigns/landing/landing.bundle");
        const { uploadLanding } = await import("@/features/campaigns/landing/landing.server");

        const declared = Number(request.headers.get("content-length") ?? "0");
        if (declared > LANDING_LIMITS.zipBytes + 64 * 1024) {
          return json(413, { error: "Tệp .zip vượt quá 25 MB." });
        }

        const form = await request.formData();
        let file: File;
        let campaignId: number;
        try {
          file = requiredFileField(form, "file");
          const rawId = form.get("campaign_id");
          campaignId = typeof rawId === "string" ? Number(rawId) : Number.NaN;
        } catch (error) {
          if (!(error instanceof FormFieldTypeError)) throw error;
          return json(400, { error: error.message });
        }
        if (!Number.isInteger(campaignId) || campaignId <= 0) {
          return json(400, { error: "Thiếu campaign_id." });
        }
        if (!file.name.toLowerCase().endsWith(".zip")) {
          return json(400, { error: "Chỉ nhận tệp .zip (index.html + thư mục assets/)." });
        }
        if (file.size > LANDING_LIMITS.zipBytes) {
          return json(413, { error: "Tệp .zip vượt quá 25 MB." });
        }

        try {
          const version = await uploadLanding(me.id, {
            campaignId,
            fileName: file.name,
            zip: new Uint8Array(await file.arrayBuffer()),
          });
          return json(201, { version: { id: version.id, status: version.status } });
        } catch (error) {
          if (error instanceof BundleError) return json(400, { error: error.message });
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404) return json(404, { error: (error as Error).message });
          throw error;
        }
      }),
    },
  },
});
