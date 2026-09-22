import { createFileRoute } from "@tanstack/react-router";
import { handleHubRequest } from "@/features/marketing-hub/marketing-hub.http";

export const Route = createFileRoute("/api/v1/(integration)/agent/contents/$externalId")({
  server: {
    handlers: {
      GET: ({ request, params }) => handleHubRequest(request, "read", params.externalId),
    },
  },
});
