import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { listMarqueeImages } from "@/features/content";

export const Route = createFileRoute("/api/v1/(public)/marquee-images/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const images = await listMarqueeImages();
        const sorted = images
          .sort((a, b) => a.position - b.position)
          .map((m) => ({
            id: m.id,
            position: m.position,
            src: m.src,
            alt_text: m.alt_text,
          }));
        return corsJson(request, { images: sorted });
      },
    },
  },
});
