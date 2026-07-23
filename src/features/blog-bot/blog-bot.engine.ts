// Blog Auto-Bot — generation engine (Phase 1).
//
// Phase 1 scope: generate ONE article for a campaign and save it as a REVIEW
// draft (status='review'). Manual "Run now" only — the daily scheduler and the
// cron drain are added in a later phase, so this file exposes runCampaignOnce()
// but does NOT touch src/server.ts scheduled() yet.
//
// SAFETY: autopublish is intentionally NOT honored here. Until the verifier
// stage exists (later phase) every generated post lands as 'review' regardless
// of the campaign's autopublish flag — the bot proposes, a human publishes.

import type { BlogBotCampaignRow, BlogBotRunRow } from "@/features/blog-bot/blog-bot.service";
import {
  countRunsSince,
  createRun,
  getRecentBlogTitles,
  getUsedTopics,
  slugExists,
  touchCampaignRun,
  updateRun,
} from "@/features/blog-bot/blog-bot.service";
import { generateArticle } from "@/features/blog-bot/blog-bot.openai";
import { resolveImages } from "@/features/blog-bot/blog-bot.images";

export interface EngineEnv {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  PEXELS_API_KEY?: string;
  UNSPLASH_ACCESS_KEY?: string;
}

export class BotConfigError extends Error {}

/** Choose the topic string for this run. seed_list rotates through unused
 *  topics (falls back to the first when all consumed); instruction mode passes
 *  the natural-language instruction straight through. */
async function pickTopic(campaign: BlogBotCampaignRow): Promise<string> {
  if (campaign.topic_source === "seed_list") {
    let topics: string[] = [];
    try {
      const arr = JSON.parse(campaign.seed_topics_json ?? "[]") as unknown;
      if (Array.isArray(arr)) topics = arr.filter((t): t is string => typeof t === "string");
    } catch {
      /* ignore malformed json — treated as empty */
    }
    if (topics.length === 0) {
      throw new BotConfigError("Campaign dùng danh sách chủ đề nhưng danh sách trống.");
    }
    const used = new Set(await getUsedTopics(campaign.id));
    return topics.find((t) => !used.has(t)) ?? topics[0];
  }
  const instruction = campaign.instruction_md?.trim();
  if (!instruction) {
    throw new BotConfigError("Campaign dùng lệnh tự nhiên nhưng ô lệnh đang trống.");
  }
  return instruction;
}

/** Ensure the generated slug does not collide with an existing blog post. */
async function uniqueSlug(base: string): Promise<string> {
  if (!(await slugExists(base))) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`.slice(0, 200);
    if (!(await slugExists(candidate))) return candidate;
  }
  // Extremely unlikely; make it unique with a time-ish suffix.
  return `${base}-${Math.floor(Date.now() / 1000)}`.slice(0, 200);
}

/** Generate + save a draft for an already-created run row. Updates the run
 *  through generating → needs_review / failed. Never throws for expected
 *  failures — records them on the run. */
export async function processRun(
  env: EngineEnv,
  campaign: BlogBotCampaignRow,
  run: BlogBotRunRow,
  actorId: number,
): Promise<BlogBotRunRow> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    await updateRun(run.id, {
      status: "failed",
      error: "OPENAI_API_KEY chưa được set trên Worker.",
      attempts: run.attempts + 1,
    });
    return { ...run, status: "failed", error: "OPENAI_API_KEY chưa được set trên Worker." };
  }

  await updateRun(run.id, { status: "generating", attempts: run.attempts + 1 });

  const topic = run.topic ?? "";
  const existingTitles = await getRecentBlogTitles(40);
  const result = await generateArticle(
    apiKey,
    env.OPENAI_BASE_URL,
    campaign,
    topic,
    existingTitles,
  );

  if (!result.article) {
    await updateRun(run.id, {
      status: "failed",
      error: result.error ?? "Sinh bài thất bại (không rõ lý do).",
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
    });
    return { ...run, status: "failed", error: result.error };
  }

  // Save as a REVIEW draft via the normal blog write path (auto-translate +
  // landing-rebuild coalescing come for free; review status keeps it off the
  // public API until an operator publishes).
  const { upsertBlogPost } = await import("@/features/blog");
  const slug = await uniqueSlug(result.article.slug);
  const a = result.article;
  let blogPostId: number;
  try {
    const post = await upsertBlogPost(actorId, {
      slug,
      locale: campaign.locale,
      title: a.title,
      excerpt: a.excerpt || null,
      body_md: a.body_md,
      category: a.category ?? campaign.category ?? null,
      seo_title: a.seo_title,
      seo_description: a.seo_description,
      status: "review",
    });
    blogPostId = post.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateRun(run.id, {
      status: "failed",
      error: `Lưu bài thất bại: ${msg}`,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
    });
    return { ...run, status: "failed", error: msg };
  }

  // Images (best-effort): fetch a relevant hero photo (+ slides) and attach.
  // A failure here never fails the run — the article draft is already saved;
  // we surface the reason as a soft warning on the needs_review run.
  let imageCost = 0;
  let warning: string | null = null;
  if (campaign.image_mode !== "none") {
    await updateRun(run.id, { status: "imaging" });
    const img = await resolveImages(env, campaign, result.article, actorId);
    imageCost = img.costUsd;
    warning = img.warning;
    try {
      if (img.thumbnail) {
        const { setBlogThumbnailFromUrl } = await import("@/features/blog");
        await setBlogThumbnailFromUrl(actorId, {
          slug,
          locale: campaign.locale,
          url: img.thumbnail.url,
          alt_text: img.thumbnail.alt,
        });
      }
      if (img.slides.length > 0) {
        const { replaceBlogSlides } = await import("@/features/blog");
        await replaceBlogSlides(actorId, {
          slug,
          locale: campaign.locale,
          slides: img.slides.map((s) => ({ url: s.url, alt_text: s.alt })),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warning = (warning ? `${warning} | ` : "") + `Gắn ảnh thất bại: ${msg}`;
    }
  }

  await updateRun(run.id, {
    status: "needs_review",
    blog_post_id: blogPostId,
    blog_slug: slug,
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
    cost_usd: result.costUsd + imageCost,
    error: warning, // soft image warning; status stays needs_review
  });
  return { ...run, status: "needs_review", blog_post_id: blogPostId, blog_slug: slug };
}

const DAY_SECONDS = 86_400;

/** Full path for one manual/scheduled generation: quota guard → pick topic →
 *  create run → generate → save review draft. Returns the final run row. */
export async function runCampaignOnce(
  env: EngineEnv,
  campaign: BlogBotCampaignRow,
  trigger: "schedule" | "manual",
  actorId: number,
): Promise<BlogBotRunRow> {
  // Per-day quota guard (rolling 24h). Manual runs still respect it to avoid
  // runaway cost, but the operator sees a clear skipped reason.
  const nowSec = Math.floor(Date.now() / 1000);
  const todayCount = await countRunsSince(campaign.id, nowSec - DAY_SECONDS);
  if (todayCount >= campaign.max_per_day) {
    const run = await createRun(campaign.id, trigger, null);
    await updateRun(run.id, {
      status: "skipped",
      error: `Đã đạt giới hạn ${campaign.max_per_day} bài/ngày.`,
    });
    return { ...run, status: "skipped" };
  }

  let topic: string;
  try {
    topic = await pickTopic(campaign);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const run = await createRun(campaign.id, trigger, null);
    await updateRun(run.id, { status: "failed", error: msg });
    return { ...run, status: "failed", error: msg };
  }

  const run = await createRun(campaign.id, trigger, topic);
  const done = await processRun(env, campaign, run, actorId);
  await touchCampaignRun(campaign.id, null);
  return done;
}
