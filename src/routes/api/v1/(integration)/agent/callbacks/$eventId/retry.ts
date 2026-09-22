import { createFileRoute } from "@tanstack/react-router";
import { handleHubRequest } from "@/features/marketing-hub/marketing-hub.http";

export const Route = createFileRoute("/api/v1/(integration)/agent/callbacks/$eventId/retry")({
  server: {
    handlers: { POST: ({ request, params }) => handleHubRequest(request, "retry", params.eventId) },
  },
});
