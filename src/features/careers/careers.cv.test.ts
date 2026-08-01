import { expect, mock, test } from "bun:test";

// The route modules reach `cloudflare:workers`; stub it so the REAL handlers can be invoked.
mock.module("cloudflare:workers", () => ({ env: {} }));

import { applicantCvKeyFrom, applicantCvUrlPath, hrCvPathFrom } from "./careers.cv";
import { isPrivateObjectKey } from "@/features/media/media.private";

// Applicant CVs were reachable through the PUBLIC media proxy at a permanent URL, cached
// `public, immutable` for a week, with a random key described as the access control. Randomness
// resists enumeration; it is not authorization, and that URL was stored in D1, sent to a
// Telegram channel and rendered as a plain anchor. These tests pin the new boundary.

const LEGACY = "https://cms.thgfulfill.com/api/v1/media/applicants%2Fabc123-cv.pdf";
const CURRENT = "https://cms.thgfulfill.com/api/v1/applicant-cv/applicants/abc123-cv.pdf";

// ── The private namespace ───────────────────────────────────────────────────────────────────

test("applicant keys are private; marketing keys are not", () => {
  expect(isPrivateObjectKey("applicants/abc-cv.pdf")).toBe(true);
  expect(isPrivateObjectKey("service-fulfill-gallery/x.jpg")).toBe(false);
  expect(isPrivateObjectKey("blog/cover.png")).toBe(false);
});

// ── Link derivation and backward compatibility ──────────────────────────────────────────────

test("a fresh upload yields an authenticated path, not a media-proxy path", () => {
  const path = applicantCvUrlPath("applicants/abc123-cv.pdf");
  expect(path).toBe("/api/v1/applicant-cv/applicants/abc123-cv.pdf");
  expect(path).not.toContain("/api/v1/media/");
});

test("a LEGACY public cv_url is rewritten to the authenticated path", () => {
  // Historical rows keep their stored value; what changes is that HR follows the new route.
  expect(hrCvPathFrom(LEGACY)).toBe("/api/v1/applicant-cv/applicants/abc123-cv.pdf");
  expect(applicantCvKeyFrom(LEGACY)).toBe("applicants/abc123-cv.pdf");
});

test("a current cv_url round-trips", () => {
  expect(hrCvPathFrom(CURRENT)).toBe("/api/v1/applicant-cv/applicants/abc123-cv.pdf");
});

test("a non-CV media URL is NOT turned into a CV link", () => {
  // A marketing image must not become an authenticated "CV" link.
  expect(hrCvPathFrom("https://cms.thgfulfill.com/api/v1/media/blog/cover.png")).toBeNull();
  expect(hrCvPathFrom("https://evil.test/applicants/x.pdf")).toBeNull();
  expect(hrCvPathFrom(null)).toBeNull();
  expect(hrCvPathFrom("")).toBeNull();
});

test("traversal and malformed encoding are rejected", () => {
  expect(hrCvPathFrom("/api/v1/media/applicants/../../secret")).toBeNull();
  expect(hrCvPathFrom("/api/v1/media/applicants/%E0%A4%A")).toBeNull();
});

// ── The public media proxy must not serve the namespace ─────────────────────────────────────

async function publicMedia(splat: string): Promise<Response> {
  const { Route } = (await import("@/routes/api/v1/(public)/media/$")) as {
    Route: {
      options: { server: { handlers: Record<string, (ctx: unknown) => Promise<Response>> } };
    };
  };
  return Route.options.server.handlers.GET({
    request: new Request("https://cms.thgfulfill.com/api/v1/media/x"),
    params: { _splat: splat },
  });
}

test("the public media proxy REFUSES the applicant namespace", async () => {
  const response = await publicMedia("applicants/abc123-cv.pdf");
  expect(response.status).toBe(404);
});

test("percent-encoded traversal into the namespace is also refused", async () => {
  // The deny runs on the DECODED key, so encoding the separator does not slip past it.
  const response = await publicMedia("applicants%2Fabc123-cv.pdf");
  expect(response.status).toBe(404);
});

test("the refusal is a 404, not a 403 — it must not confirm a key exists", async () => {
  // A 403 would be an enumeration oracle: it would distinguish "private and present" from
  // "absent", which is exactly the signal the random key withholds.
  const present = await publicMedia("applicants/abc123-cv.pdf");
  const absent = await publicMedia("applicants/definitely-not-a-real-key.pdf");
  expect(present.status).toBe(absent.status);
  expect(present.status).toBe(404);
});

// ── The authenticated retrieval route ───────────────────────────────────────────────────────

/** Invoke the HR route with a controllable session outcome. */
async function hrCv(
  splat: string,
  session: { ok: true } | { ok: false; status: number },
  object: { body: ReadableStream; contentType: string; size: number } | null = null,
): Promise<{ status: number; headers: Headers }> {
  mock.module("@/features/auth/auth.service", () => ({
    requireSession: async () => {
      if (!session.ok) {
        throw Object.assign(new Error("denied"), { statusCode: session.status });
      }
      return { id: 1, email: "hr@thg.test", role: "viewer" };
    },
  }));
  mock.module("@/features/media", () => ({ readMediaObject: async () => object }));

  const { Route } = (await import("@/routes/api/v1/(admin)/applicant-cv/$")) as {
    Route: {
      options: { server: { handlers: Record<string, (ctx: unknown) => Promise<Response>> } };
    };
  };
  try {
    const response = await Route.options.server.handlers.GET({ params: { _splat: splat } });
    return { status: response.status, headers: response.headers };
  } catch (error) {
    return { status: (error as { statusCode?: number }).statusCode ?? 500, headers: new Headers() };
  }
}

const streamOf = (text: string) => new Response(text).body as ReadableStream;

test("ANONYMOUS retrieval fails — possession of the key is not authorization", async () => {
  const result = await hrCv(
    "applicants/abc123-cv.pdf",
    { ok: false, status: 401 },
    {
      body: streamOf("PDF"),
      contentType: "application/pdf",
      size: 3,
    },
  );
  expect(result.status).toBe(401);
});

test("an authenticated but UNDER-PRIVILEGED session fails", async () => {
  const result = await hrCv(
    "applicants/abc123-cv.pdf",
    { ok: false, status: 403 },
    {
      body: streamOf("PDF"),
      contentType: "application/pdf",
      size: 3,
    },
  );
  expect(result.status).toBe(403);
});

test("an authorized session retrieves the CV with non-cacheable, non-rendering headers", async () => {
  const result = await hrCv(
    "applicants/abc123-cv.pdf",
    { ok: true },
    {
      body: streamOf("PDF"),
      contentType: "application/pdf",
      size: 3,
    },
  );

  expect(result.status).toBe(200);
  const cacheControl = result.headers.get("Cache-Control") ?? "";
  // Response caching must not be able to make a CV public again.
  expect(cacheControl).toContain("private");
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).not.toContain("public");
  // A mislabelled upload must download, not render in the CMS origin.
  expect(result.headers.get("Content-Disposition")).toBe("attachment");
  expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(result.headers.get("Referrer-Policy")).toBe("no-referrer");
});

test("an out-of-namespace key is refused even for an authorized session", async () => {
  // The route is "an HR user may read a CV", not "an HR user may read the bucket".
  const result = await hrCv(
    "blog/cover.png",
    { ok: true },
    {
      body: streamOf("PNG"),
      contentType: "image/png",
      size: 3,
    },
  );
  expect(result.status).toBe(404);
});

test("traversal is refused", async () => {
  const result = await hrCv(
    "applicants/../blog/cover.png",
    { ok: true },
    {
      body: streamOf("PNG"),
      contentType: "image/png",
      size: 3,
    },
  );
  expect(result.status).toBe(404);
});

test("a missing object and an invalid key are INDISTINGUISHABLE, and leak no storage detail", async () => {
  const missing = await hrCv("applicants/no-such-key.pdf", { ok: true }, null);
  const invalid = await hrCv("blog/cover.png", { ok: true }, null);
  expect(missing.status).toBe(404);
  expect(invalid.status).toBe(404);
  expect(missing.headers.get("Cache-Control")).toBe(invalid.headers.get("Cache-Control"));
});
