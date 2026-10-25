// The landing host (lp.thgfulfill.com) — SECURITY BOUNDARY.
//
// Uploaded landing pages run arbitrary scripts, so they are served from their
// own origin, never from cms.thgfulfill.com or thgfulfill.com. On that origin
// the Worker answers ONLY:
//
//   GET|HEAD /<slug>/<path>              published version of a campaign
//   GET|HEAD /_preview/<version id>/<path>  any version, noindex (id = 128-bit token)
//   GET|HEAD /_thg/thg-lead.js           the shared consult form script
//   GET|HEAD /robots.txt
//
// Everything else — /admin, /api, /login, /_serverFn, any other method — is a
// 404 produced HERE, before TanStack Start is ever invoked (server.ts routes by
// host first), so no CMS route, server function or session code is reachable
// on the landing origin. Session cookies are host-only (no Domain attribute,
// see auth.session.ts), so the browser never sends them to this host either.

import {
  BASE_LANDING_HEADERS,
  cacheControlFor,
  contentTypeFor,
  type ServeMode,
} from "./landing.mime";

export const VERSION_ID = /^[a-f0-9]{32}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface LandingObject {
  body: BodyInit | null;
  etag: string | null;
  size: number;
}

export interface LandingHostDeps {
  /** Version id currently published for a campaign slug, or null. */
  resolveLive(slug: string): Promise<string | null>;
  /** Campaign slug of a version (preview), or null when the version does not exist. */
  resolvePreview(versionId: string): Promise<string | null>;
  /** Read an R2 object (HEAD reads metadata only). */
  getObject(key: string, headOnly: boolean): Promise<LandingObject | null>;
  /** Full body of /_thg/thg-lead.js, config included. */
  leadScript(): string;
}

export function landingObjectKey(slug: string, versionId: string, path: string): string {
  return `landings/${slug}/${versionId}/site/${path}`;
}

/** Canonical host for comparison: lowercase, no port, no single trailing dot (the fully
 *  qualified "lp.thgfulfill.com." is the same host and must take the same path). */
export function normalizeHost(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** True when the request targets the landing host — by URL or by Host header, so either one
 *  being the landing host puts the request on the restrictive path. */
export function isLandingHost(request: Request, landingHost: string): boolean {
  const wanted = normalizeHost(landingHost);
  if (!wanted) return false;
  let urlHost = "";
  try {
    urlHost = normalizeHost(new URL(request.url).hostname);
  } catch {
    /* unparseable URL → fall through to the header */
  }
  return urlHost === wanted || normalizeHost(request.headers.get("host")) === wanted;
}

/** Route by host: the landing host never reaches the CMS handler. */
export async function dispatchByHost(
  request: Request,
  landingHost: string | undefined,
  onLanding: (request: Request) => Promise<Response>,
  onCms: (request: Request) => Promise<Response>,
): Promise<Response> {
  if (landingHost && isLandingHost(request, landingHost)) return onLanding(request);
  return onCms(request);
}

function respond(status: number, body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { ...BASE_LANDING_HEADERS, ...headers },
  });
}

export const notFound = () =>
  respond(404, "Not found", {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=60",
  });

/** Decode and vet the file part of a URL; null when it is not a safe relative path. */
export function decodeFilePath(segments: string[]): string | null {
  const out: string[] = [];
  for (const [i, raw] of segments.entries()) {
    if (raw === "" && i === segments.length - 1) {
      out.push("index.html");
      continue;
    }
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return null;
    }
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    if (seg === "" || seg === "." || seg === ".." || /[\\/\u0000-\u001f]/.test(seg)) return null;
    out.push(seg);
  }
  return out.length === 0 ? "index.html" : out.join("/");
}

async function serveFile(
  request: Request,
  deps: LandingHostDeps,
  key: string,
  path: string,
  mode: ServeMode,
): Promise<Response> {
  const head = request.method === "HEAD";
  const object = await deps.getObject(key, head);
  if (!object) return notFound();
  const headers: Record<string, string> = {
    "Content-Type": contentTypeFor(path),
    "Cache-Control": cacheControlFor(path, mode),
    "Content-Length": String(object.size),
  };
  if (object.etag) headers.ETag = object.etag;
  if (mode === "preview") headers["X-Robots-Tag"] = "noindex, nofollow";
  if (object.etag && request.headers.get("if-none-match") === object.etag) {
    delete headers["Content-Length"];
    return respond(304, null, headers);
  }
  return respond(200, head ? null : object.body, headers);
}

const ROBOTS = "User-agent: *\nDisallow: /_preview/\nDisallow: /_thg/\n";

export async function handleLandingRequest(
  request: Request,
  deps: LandingHostDeps,
): Promise<Response> {
  const response = await route(request, deps);
  // HEAD never carries a body, 404s included.
  if (request.method === "HEAD" && response.body) {
    return new Response(null, { status: response.status, headers: response.headers });
  }
  return response;
}

async function route(request: Request, deps: LandingHostDeps): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return notFound();
  const url = new URL(request.url);
  const segments = url.pathname.split("/").slice(1);
  const [first, second] = segments;
  const head = request.method === "HEAD";

  if (url.pathname === "/robots.txt") {
    return respond(200, head ? null : ROBOTS, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  }
  if (url.pathname === "/_thg/thg-lead.js") {
    return respond(200, head ? null : deps.leadScript(), {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    });
  }
  if (first === "_preview") {
    if (!second || !VERSION_ID.test(second) || segments.length < 3) return notFound();
    const slug = await deps.resolvePreview(second);
    const path = decodeFilePath(segments.slice(2));
    if (!slug || !path) return notFound();
    return serveFile(request, deps, landingObjectKey(slug, second, path), path, "preview");
  }
  if (!first || !SLUG.test(first)) return notFound();
  // Only a slug with a published landing exists on this host; anything else is a plain 404.
  const versionId = await deps.resolveLive(first);
  if (!versionId) return notFound();
  if (segments.length === 1) {
    // Relative asset URLs in index.html need the trailing slash.
    return respond(301, null, {
      Location: `/${first}/${url.search}`,
      "Cache-Control": "public, max-age=3600",
    });
  }
  const path = decodeFilePath(segments.slice(1));
  if (!path) return notFound();
  return serveFile(request, deps, landingObjectKey(first, versionId, path), path, "live");
}
