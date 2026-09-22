import { createFileRoute } from "@tanstack/react-router";
import { corsOptions } from "@/core/middlewares/cors";
import { readHubPreview } from "@/features/marketing-hub/marketing-hub.service";

export const Route = createFileRoute("/api/v1/(public)/blog-previews/$token")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: ({ request, params }) => readHubPreview(request, params.token),
    },
  },
});
