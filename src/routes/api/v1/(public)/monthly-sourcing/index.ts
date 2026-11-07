import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { getActiveLiveMonthlySourcing } from "@/features/monthly-sourcing";

/** One active year for the main-site dropdown.  Individual PDF pages use the
 * LP host resolver directly, so old live years stay reachable without being
 * included in the current navbar. */
export const Route = createFileRoute("/api/v1/(public)/monthly-sourcing/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => corsJson(request, await getActiveLiveMonthlySourcing()),
    },
  },
});
