import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import type { BlogBotCampaignRow, BlogBotRunRow } from "./blog-bot.service";
import type { GeneratedArticle } from "./blog-bot.openai";

// The host's publish gate must veto high issues, malformed checks, unchecked
// content and source-less news. Execute the real modules, isolating only HTTP
// and storage/image boundaries in a VM per test (no global/module mock leaks).
const moduleDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(moduleDir, "../..");
const requireDependency = createRequire(import.meta.url);
const article = {
  title: "Fulfillment overview",
  slug: "fulfillment-overview",
  excerpt: "For sellers",
  body_md: "## Overview\nA brief introduction.",
  category: "Operations",
  seo_title: "Overview | TH Group",
  seo_description: "How fulfillment works",
  image_keywords: [],
} satisfies GeneratedArticle;
const campaign: BlogBotCampaignRow = {
  id: 1,
  name: "News",
  enabled: 1,
  run_time: "08:00",
  timezone: "Asia/Ho_Chi_Minh",
  locale: "vi",
  category: null,
  tone: null,
  topic_source: "seed_list",
  instruction_md: null,
  seed_topics_json: '["fulfillment"]',
  guidelines_md: null,
  article_type: "news",
  length: "short",
  depth: "professional",
  image_mode: "none",
  image_style: null,
  autopublish: 1,
  autoapprove_translations: 0,
  model: "gpt-4o-mini",
  max_per_day: 1,
  last_run_at: null,
  next_run_at: null,
  created_by: 1,
  created_at: 0,
  updated_at: 0,
};
const rss =
  '<rss><channel><item><title>New warehouse</title><link>https://article.example/story</link><pubDate>Tue, 13 Oct 2026 08:00:00 GMT</pubDate><source url="https://publisher.example">Publisher</source></item></channel></rss>';

function harness(
  options: {
    moderation?: unknown;
    judge?: {
      safe: boolean;
      score: number;
      summary: string;
      issues: { severity: string; message: string }[];
    };
    rss?: string;
    imageWarning?: string | null;
    generatedArticle?: GeneratedArticle;
  } = {},
) {
  type RequestBody = { input?: string; messages?: { content: string }[] };
  const requests: { url: string; body: RequestBody }[] = [];
  const posts: Record<string, unknown>[] = [];
  const runUpdates: Record<string, unknown>[] = [];
  const fetchStub = async (input: string, init?: RequestInit) => {
    if (input.includes("news.google.com")) return new Response(options.rss ?? rss);
    const body = JSON.parse(String(init?.body ?? "{}")) as RequestBody;
    requests.push({ url: input, body });
    if (input.endsWith("/moderations")) {
      return Response.json(options.moderation ?? { results: [{ flagged: false, categories: {} }] });
    }
    const isJudge = body.messages![0].content.includes("STRICT content-safety");
    const content = isJudge
      ? (options.judge ?? { safe: true, score: 90, summary: "Clear", issues: [] })
      : (options.generatedArticle ?? article);
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  };
  const stubs: Record<string, unknown> = {
    "@/features/blog-bot/blog-bot.service": {
      getRecentBlogTitles: async () => [],
      slugExists: async () => false,
      updateRun: async (_id: number, value: Record<string, unknown>) => {
        runUpdates.push(value);
      },
    },
    "@/features/blog-bot/blog-bot.images": {
      resolveImages: async () => ({
        costUsd: 0,
        warning: options.imageWarning ?? null,
        thumbnail: null,
        slides: [],
      }),
    },
    "@/features/blog": {
      upsertBlogPost: async (_actor: number, value: Record<string, unknown>) => {
        posts.push(value);
        return { id: 1 };
      },
    },
  };
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  function load(path: string): Record<string, unknown> {
    const absolute = resolve(path);
    if (modules.has(absolute)) return modules.get(absolute)!.exports;
    const mod = { exports: {} };
    modules.set(absolute, mod);
    const js = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const scopedRequire = (id: string) => {
      if (id in stubs) return stubs[id];
      if (id.startsWith("@/")) return load(resolve(srcDir, `${id.slice(2)}.ts`));
      if (id.startsWith(".")) return load(resolve(dirname(absolute), `${id}.ts`));
      return requireDependency(id);
    };
    runInNewContext(
      js,
      {
        require: scopedRequire,
        module: mod,
        exports: mod.exports,
        fetch: fetchStub,
        setTimeout,
        clearTimeout,
        AbortController,
        URL,
        console,
      },
      { filename: absolute },
    );
    return mod.exports;
  }
  return {
    requests,
    posts,
    runUpdates,
    verify: load(resolve(moduleDir, "blog-bot.verify.ts")) as typeof import("./blog-bot.verify"),
    news: load(resolve(moduleDir, "blog-bot.news.ts")) as typeof import("./blog-bot.news"),
    engine: () =>
      load(resolve(moduleDir, "blog-bot.engine.ts")) as typeof import("./blog-bot.engine"),
  };
}

async function process(h: ReturnType<typeof harness>, overrides: Partial<BlogBotCampaignRow> = {}) {
  const run = { id: 1, topic: "fulfillment", attempts: 0 } as BlogBotRunRow;
  return h
    .engine()
    .processRun({ OPENAI_API_KEY: "test-stub" }, { ...campaign, ...overrides }, run, 1);
}

describe("Blog verifier host safety", () => {
  test("checks every generated public text field and permits a fully checked clean article", async () => {
    const h = harness();
    expect(
      (await h.verify.verifyArticle({ OPENAI_API_KEY: "test-stub" }, campaign, article)).passed,
    ).toBe(true);
    const moderation = h.requests.find((r) => r.url.endsWith("/moderations"))!.body.input;
    const judge = h.requests.find((r) => r.url.endsWith("/chat/completions"))!.body.messages![1]
      .content;
    for (const value of [
      article.title,
      article.slug,
      article.excerpt,
      article.body_md,
      article.category,
      article.seo_title,
      article.seo_description,
    ]) {
      expect(moderation).toContain(value);
      expect(judge).toContain(value);
    }
  });

  test("high issue vetoes an otherwise passing contradictory judge", async () => {
    const h = harness({
      judge: {
        safe: true,
        score: 90,
        summary: "Contradictory",
        issues: [{ severity: "high", message: "Fabricated promise" }],
      },
    });
    const verdict = await h.verify.verifyArticle(
      { OPENAI_API_KEY: "test-stub" },
      campaign,
      article,
    );
    expect(verdict.judge.issues[0].severity).toBe("high");
    expect(verdict.passed).toBe(false);
  });

  test("holds a long artifact for review without paying to check only its prefix", async () => {
    const h = harness();
    const long = {
      ...article,
      body_md: "a".repeat(8001) + "\nTH Group guarantees delivery in 24 hours.",
    };
    const verdict = await h.verify.verifyArticle({ OPENAI_API_KEY: "test-stub" }, campaign, long);
    expect(verdict.passed).toBe(false);
    expect(verdict.error).toBeTruthy();
    expect(h.requests).toHaveLength(0);
  });

  for (const [name, response] of [
    ["missing results", {}],
    ["empty results", { results: [] }],
    ["missing flagged", { results: [{ categories: {} }] }],
    ["malformed categories", { results: [{ flagged: false, categories: { violence: "false" } }] }],
  ] as const) {
    test(`moderation ${name} fails closed`, async () => {
      const h = harness({ moderation: response });
      const verdict = await h.verify.verifyArticle(
        { OPENAI_API_KEY: "test-stub" },
        campaign,
        article,
      );
      expect(verdict.passed).toBe(false);
      expect(verdict.error).toBeTruthy();
    });
  }

  test("retains valid moderation, unsafe judge and low-score denials", async () => {
    for (const h of [
      harness({ moderation: { results: [{ flagged: true, categories: { violence: true } }] } }),
      harness({ judge: { safe: false, score: 90, summary: "Unsafe", issues: [] } }),
      harness({ judge: { safe: true, score: 69, summary: "Weak", issues: [] } }),
    ])
      expect(
        (await h.verify.verifyArticle({ OPENAI_API_KEY: "test-stub" }, campaign, article)).passed,
      ).toBe(false);
  });
});

describe("Blog news source and publish boundary", () => {
  test("preserves the article locator and publication date, not the publisher homepage", async () => {
    const h = harness();
    const news = await h.news.fetchNews("fulfillment", "vi");
    expect(news.items[0].link).toBe("https://article.example/story");
    const context = h.news.formatNewsContext(news.items);
    expect(context).toContain("https://article.example/story");
    expect(context).toContain("Tue, 13 Oct 2026 08:00:00 GMT");
  });

  test("a headline with no article URL does not count as a source", async () => {
    const h = harness({ rss: rss.replace("<link>https://article.example/story</link>", "") });
    expect((await h.news.fetchNews("fulfillment", "vi")).items).toHaveLength(0);
  });

  test("a non-web article link does not count as a news source", async () => {
    const h = harness({ rss: rss.replace("https://article.example/story", "javascript:alert(1)") });
    expect((await h.news.fetchNews("fulfillment", "vi")).items).toHaveLength(0);
  });

  for (const imageWarning of [null, "Không tìm được ảnh phù hợp"]) {
    test(`source-less news remains review and retains the source warning with image warning ${imageWarning}`, async () => {
      const h = harness({ rss: "<rss><channel></channel></rss>", imageWarning });
      expect((await process(h, { image_mode: "stock" })).status).toBe("needs_review");
      expect(h.posts.map((p) => p.status)).toEqual(["review"]);
      const final = h.runUpdates.at(-1)!;
      expect(final.error).toContain("Tin tức:");
      if (imageWarning) expect(final.error).toContain(imageWarning);
    });
  }

  test("valid sourced news still publishes after a passing full verifier", async () => {
    const h = harness();
    expect((await process(h)).status).toBe("published");
    expect(h.posts.map((p) => p.status)).toEqual(["review", "live"]);
  });

  test("general articles do not require news sources to publish after verification", async () => {
    const h = harness({ rss: "<rss><channel></channel></rss>" });
    expect((await process(h, { article_type: "general" })).status).toBe("published");
    expect(h.posts.map((p) => p.status)).toEqual(["review", "live"]);
  });

  test("high issue never produces a live write in the actual engine", async () => {
    const h = harness({
      judge: {
        safe: true,
        score: 90,
        summary: "Contradictory",
        issues: [{ severity: "high", message: "Fabricated promise" }],
      },
    });
    expect((await process(h)).status).toBe("needs_review");
    expect(h.posts.map((p) => p.status)).toEqual(["review"]);
  });

  test("autopublish remains opt-in for a clean sourced article", async () => {
    const h = harness();
    expect((await process(h, { autopublish: 0 })).status).toBe("needs_review");
    expect(h.posts.map((p) => p.status)).toEqual(["review"]);
  });
});
