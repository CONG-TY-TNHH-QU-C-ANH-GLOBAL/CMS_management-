import { afterEach, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

let sql: Database;
let afterRead: ((query: string, row: unknown) => void) | null = null;
let failWrite = "";
let statementQueries: string[] = [];
let modelCalls = 0;

const db = {
  prepare(query: string) {
    statementQueries.push(query);
    const bound = (args: unknown[]) => ({
      bind: (...values: unknown[]) => bound(values),
      execute() {
        if (failWrite && query.includes(failWrite)) throw new Error("SIMULATED_STORAGE_FAILURE");
        const result = sql.query(query).run(...args as any[]);
        return { success: true, meta: { changes: result.changes } };
      },
      async first() {
        const row = sql.query(query).get(...args as any[]);
        afterRead?.(query, row);
        return row;
      },
      async all() { return { results: sql.query(query).all(...args as any[]) }; },
      async run() { return this.execute(); },
    });
    return bound([]);
  },
  async batch(statements: Array<{ execute(): unknown }>) {
    return sql.transaction(() => statements.map(statement => statement.execute()))();
  },
};

// Isolate module imports as well as HTTP: no Bun module mocks leak into provider tests.
const directory = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(directory, "../..");
const dependencyRequire = createRequire(import.meta.url);
const modules = new Map<string, { exports: unknown }>();
const boundaries: Record<string, unknown> = {
  "@/core/db/client": { getDb: () => db },
  "@/core/db/mutations": { auditLog: async () => {}, bumpCmsRev: async () => {} },
  "@/features/telegram": { dispatchEvent: async () => {} },
  "cloudflare:workers": { env: {} },
};
function load(absolute: string): unknown {
  if (modules.has(absolute)) return modules.get(absolute)!.exports;
  const module = { exports: {} };
  modules.set(absolute, module);
  const code = ts.transpileModule(readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scopedRequire = (id: string): unknown => {
    if (id in boundaries) return boundaries[id];
    if (id.startsWith("@/")) return load(resolve(sourceRoot, `${id.slice(2)}.ts`));
    if (id.startsWith(".")) return load(resolve(dirname(absolute), `${id}.ts`));
    return dependencyRequire(id);
  };
  runInNewContext(code, { module, exports: module.exports, require: scopedRequire, console, crypto,
    TextEncoder, URL, Response, AbortController, setTimeout, clearTimeout,
    fetch: () => { modelCalls++; throw new Error("Model call in save"); } }, { filename: absolute });
  return module.exports;
}
const blog = load(resolve(directory, "blog.service.ts")) as typeof import("./blog.service");
const events = load(resolve(directory, "../events/events.service.ts")) as typeof import("../events/events.service");
const { ingestAgentEvent } = load(resolve(directory, "../events/events.ingest.ts")) as typeof import("../events/events.ingest");
const translations = load(resolve(directory, "../translations/blog-post.translation.service.ts")) as typeof import("../translations/blog-post.translation.service");
const { computeSourceHash } = load(resolve(directory, "../translations/translations.hash.ts")) as typeof import("../translations/translations.hash");

beforeEach(() => {
  sql = new Database(":memory:");
  for (const migration of ["0001_init", "0024_blog_post_translations", "0029_translation_jobs", "0033_blog_body_md", "0043_partners_events", "0047_seed_thg_events", "0051_event_translations_and_og_image", "0054_marketing_hub_contract", "0060_article_focus_keyword"]) {
    sql.exec(readFileSync(new URL(`../../../db/migrations/${migration}.sql`, import.meta.url), "utf8"));
  }
  sql.exec("DELETE FROM event_translations; DELETE FROM events; DELETE FROM blog_post_translations; DELETE FROM blog_posts;");
  sql.exec("INSERT INTO users(id,email,name,role,status,password_hash) VALUES(9,'marketing-agent@thgfulfill.com','Agent','editor','disabled','test-only');");
  sql.exec("INSERT INTO media(id,r2_key,mime,bytes,status) VALUES(1,'https://cdn.example.test/one.webp','image/webp',1,'ready');");
  afterRead = null;
  failWrite = "";
  statementQueries = [];
  modelCalls = 0;
});
afterEach(() => { sql.close(); });

function seedEvent() {
  sql.exec("INSERT INTO events(id,slug,locale,title,event_date,status) VALUES(1,'event','vi','Source','2026-09-01','live'),(2,'event','en','Legacy','2026-09-01','live');");
  sql.exec("INSERT INTO event_translations(event_id,locale,title,status,source_hash) VALUES(1,'en','Reviewed translation','reviewed','hash');");
}
function seedBlog() {
  sql.exec("INSERT INTO blog_posts(id,slug,locale,title,body_md,status) VALUES(1,'article','vi','Source','# Original','live');");
  sql.exec("INSERT INTO blog_post_translations(id,blog_post_id,locale,title,body_md,status,source_hash) VALUES(1,1,'en','Translated','# Original EN','reviewed','hash');");
}

test("agent cannot overwrite an Event published after its draft read", async () => {
  sql.exec("INSERT INTO events(id,slug,locale,title,event_date,status) VALUES(1,'race','en','Draft','2026-09-01','draft');");
  afterRead = query => {
    if (!query.includes("WHERE slug = ? AND locale = ? LIMIT 1")) return;
    afterRead = null;
    sql.exec("UPDATE events SET title='Operator published',status='live' WHERE id=1");
  };
  await expect(ingestAgentEvent({ slug: "race", locale: "en", title: "Agent", event_date: "2026-09-01" })).rejects.toMatchObject({ statusCode: 409 });
  expect(sql.query("SELECT title,status FROM events WHERE id=1").get()).toEqual({ title: "Operator published", status: "live" });
});

test("admin can still update a live Event", async () => {
  seedEvent();
  const changed = await events.updateEvent(9, { id: 2, title: "Admin edit", status: "live" });
  expect(changed.title).toBe("Admin edit");
  expect(changed.status).toBe("live");
});

test("focus keyword survives Blog/Event create, reload, unrelated update and clearing without invalidating translations", async () => {
  seedBlog();
  seedEvent();
  const sourceHash = await computeSourceHash({ title: "Source", excerpt: "", category: "", seo_title: "", seo_description: "", body_md: "# Original" });
  sql.query("UPDATE blog_post_translations SET source_hash=? WHERE blog_post_id=1").run(sourceHash);
  await blog.upsertBlogPost(9, { slug: "article", locale: "vi", title: "Source", focus_keyword: "kho Mỹ" });
  expect((await blog.getBlogPost("article", "vi"))?.focus_keyword).toBe("kho Mỹ");
  expect(sql.query("SELECT status FROM blog_post_translations WHERE blog_post_id=1").get()).toEqual({ status: "reviewed" });
  await blog.upsertBlogPost(9, { slug: "new", locale: "en", title: "New", focus_keyword: "shipping" });
  await blog.upsertBlogPost(9, { slug: "new", locale: "en", title: "Changed" });
  expect((await blog.getBlogPost("new", "en"))?.focus_keyword).toBe("shipping");
  await blog.upsertBlogPost(9, { slug: "new", locale: "en", title: "Changed", focus_keyword: null });
  expect((await blog.getBlogPost("new", "en"))?.focus_keyword).toBeNull();
  await events.updateEvent(9, { id: 1, focus_keyword: "webinar" });
  expect((await events.getEvent("event", "vi"))?.focus_keyword).toBe("webinar");
  expect(sql.query("SELECT status FROM event_translations WHERE event_id=1").get()).toEqual({ status: "reviewed" });
  expect(await events.getLiveEvent("event", "vi")).not.toHaveProperty("focus_keyword");
  const created = await events.createEvent(9, { slug: "new", locale: "en", title: "New", event_date: "2026-10-20", focus_keyword: "shipping" });
  await events.updateEvent(9, { id: created.id, title: "Updated" });
  expect((await events.getEvent("new", "en"))?.focus_keyword).toBe("shipping");
  await events.updateEvent(9, { id: created.id, focus_keyword: null });
  expect((await events.getEvent("new", "en"))?.focus_keyword).toBeNull();
  expect(() => sql.exec("UPDATE events SET focus_keyword=printf('%201s','x')")).toThrow();
});

test("Event list and detail choose the same reviewed translation over legacy", async () => {
  seedEvent();
  const list = await events.listLiveEventsForPublic("en");
  const detail = await events.getLiveEventForPublic("event", "en");
  expect(list).toHaveLength(1);
  expect(list[0].title).toBe("Reviewed translation");
  expect(list[0].id).toBe(detail!.id);
  expect(list[0].title).toBe(detail!.title);
});

test("failed gallery replacement preserves the complete old Event gallery", async () => {
  seedEvent();
  sql.exec("INSERT INTO event_photos(event_id,media_id,position,caption) VALUES(1,1,0,'Original');");
  failWrite = "INSERT INTO event_photos";
  await expect(events.replaceEventPhotos(9, 1, [{ media_id: 1, caption: "New" }])).rejects.toThrow("SIMULATED_STORAGE_FAILURE");
  expect(sql.query("SELECT media_id,position,caption FROM event_photos WHERE event_id=1").all()).toEqual([{ media_id: 1, position: 0, caption: "Original" }]);
});

test("failed slide replacement preserves the complete old Blog gallery", async () => {
  seedBlog();
  sql.exec("INSERT INTO blog_slides(post_id,media_id,position,alt_text) VALUES(1,1,1,'Original');");
  failWrite = "INSERT INTO blog_slides";
  await expect(blog.replaceBlogSlides(9, { slug: "article", locale: "vi", slides: [{ url: "https://cdn.example.test/one.webp", alt_text: "New" }] })).rejects.toThrow("SIMULATED_STORAGE_FAILURE");
  expect(sql.query("SELECT media_id,position,alt_text FROM blog_slides WHERE post_id=1").all()).toEqual([{ media_id: 1, position: 1, alt_text: "Original" }]);
});

test("translation body edits stay on the reviewed-source entity and require approval", async () => {
  seedBlog();
  await translations.editBlogPostTranslation(9, { id: 1, title: "Changed", body_md: "# Changed EN", excerpt: null, category: null, seo_title: null, seo_description: null });
  expect(sql.query("SELECT title,body_md,status FROM blog_post_translations WHERE id=1").get()).toEqual({ title: "Changed", body_md: "# Changed EN", status: "draft" });
  await translations.approveBlogPostTranslation(9, 1);
  const visible = await blog.getBlogPostForPublic("article", "en");
  expect(visible!.title).toBe("Changed");
  expect(visible!.body_md).toBe("# Changed EN");
  expect(sql.query("SELECT COUNT(*) n FROM blog_posts WHERE locale='en'").get()).toEqual({ n: 0 });
});

test("body-only source changes invalidate reviewed translations", async () => {
  seedBlog();
  const fields = { title: "Source", excerpt: "", category: "", seo_title: "", seo_description: "", body_md: "# Original" };
  const oldHash = await computeSourceHash({ title: "Source", excerpt: "", category: "", seo_title: "", seo_description: "" });
  // Old hashes contain metadata only; both new and legacy rows must go stale.
  sql.query("UPDATE blog_post_translations SET source_hash=? WHERE id=1").run(oldHash);
  await translations.onBlogPostSourceChanged(1, { ...fields, body_md: "# Changed" });
  expect(sql.query("SELECT status,stale_reason FROM blog_post_translations WHERE id=1").get()).toEqual({ status: "stale", stale_reason: "source_changed" });
});

test("unchanged source body retains review and body edits through upsert invalidate it", async () => {
  seedBlog();
  const fields = { title: "Source", excerpt: "", category: "", seo_title: "", seo_description: "", body_md: "# Original" };
  sql.query("UPDATE blog_post_translations SET source_hash=? WHERE id=1").run(await computeSourceHash(fields));
  await translations.onBlogPostSourceChanged(1, fields);
  expect(sql.query("SELECT status FROM blog_post_translations WHERE id=1").get()).toEqual({ status: "reviewed" });
  await blog.upsertBlogPost(9, { slug: "article", locale: "vi", title: "Source", body_md: "# Changed" });
  expect(sql.query("SELECT status FROM blog_post_translations WHERE id=1").get()).toEqual({ status: "stale" });
});

test("source saves persist missing-locale work without a model call or duplicate active job", async () => {
  seedBlog();
  await blog.upsertBlogPost(9, { slug: "article", locale: "vi", title: "Source", body_md: "# Queue" });
  await blog.upsertBlogPost(9, { slug: "article", locale: "vi", title: "Source", body_md: "# Queue again" });
  expect(modelCalls).toBe(0);
  expect(sql.query("SELECT entity_type,entity_ref,status,target_locales FROM translation_jobs").all()).toEqual([{ entity_type: "blog_post", entity_ref: "1", status: "pending", target_locales: '["zh"]' }]);
  expect(sql.query("SELECT target_locale,status FROM translation_job_chunks").all()).toEqual([{ target_locale: "zh", status: "pending" }]);
});

test("public Blog summary reads keep detail bodies out of the list SQL", async () => {
  seedBlog();
  const rows = await blog.listBlogPostsForPublic({ locale: "en", status: "live", summaryOnly: true });
  expect(rows[0].title).toBe("Translated");
  expect(rows[0].body_md).toBeNull();
  expect(statementQueries.some(query => query.includes("SELECT COUNT(*) FROM blog_slides"))).toBe(false);
  const detail = await blog.getBlogPostForPublic("article", "en");
  expect(detail!.body_md).toBe("# Original EN");
});

test("locale availability matches actual detail eligibility using one scalar query", async () => {
  seedBlog(); seedEvent();
  statementQueries = [];
  expect(await blog.availableBlogLocales("article")).toEqual(["vi", "en"]);
  expect(await events.availableEventLocales("event")).toEqual(["en", "vi"]);
  expect(statementQueries).toHaveLength(2);
  sql.exec("UPDATE blog_post_translations SET status='stale'; UPDATE event_translations SET status='stale';");
  expect(await blog.availableBlogLocales("article")).toEqual(["vi"]);
  // The own EN event remains live when the VI translation is stale.
  expect(await events.availableEventLocales("event")).toEqual(["en", "vi"]);
});

test("blog save attributes the latest publisher without changing the author", async () => {
  seedBlog();
  sql.exec("UPDATE blog_posts SET author_id=1 WHERE id=1");
  await blog.upsertBlogPost(9, { slug: "article", locale: "vi", title: "Source", status: "live" });
  expect(sql.query("SELECT author_id,updated_by FROM blog_posts WHERE id=1").get()).toEqual({ author_id: 1, updated_by: 9 });
});
