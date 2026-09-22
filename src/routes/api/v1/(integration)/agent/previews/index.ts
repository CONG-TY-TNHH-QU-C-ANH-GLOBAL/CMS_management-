import { createFileRoute } from "@tanstack/react-router";
import { handleHubRequest } from "@/features/marketing-hub/marketing-hub.http";

export const Route = createFileRoute("/api/v1/(integration)/agent/previews/")({
  server: { handlers: { POST: ({ request }) => handleHubRequest(request, "preview") } },
});
