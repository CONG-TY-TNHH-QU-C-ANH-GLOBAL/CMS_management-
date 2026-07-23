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
import { verifyArticle } from "@/features/blog-bot/blog-bot.verify";
import { isCampaignDue, localParts } from "@/features/blog-bot/blog-bot.schedule";

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

/** Auto-approve the EN/ZH DRAFT translations that the blog pipeline created for
 *  a just-published post (flips draft → reviewed so they become public).
 *  Skips non-draft rows (e.g. 'failed'). Best-effort: returns a short note when
 *  something was off, or null on clean success. Never throws. */
async function approveDraftTranslations(
  actorId: number,
  blogPostId: number,
): Promise<string | null> {
  try {
    const { listBlogPostTranslationsForId, approveBlogPostTranslation } =
      await import("@/features/translations/blog-post.translation.service");
    const rows = await listBlogPostTranslationsForId(blogPostId);
    const drafts = rows.filter((r) => r.status === "draft");
    const failed = rows.filter((r) => r.status === "failed");
    let approved = 0;
    for (const r of drafts) {
      try {
        await approveBlogPostTranslation(actorId, r.id);
        approved++;
      } catch {
        /* skip a row that won't transition */
      }
    }
    const parts: string[] = [];
    if (approved > 0) parts.push(`Đã tự duyệt ${approved} bản dịch`);
    if (failed.length > 0) parts.push(`${failed.length} bản dịch lỗi (cần soát tay)`);
    if (drafts.length === 0 && failed.length === 0) return null; // nothing to do
    return parts.join(", ") || null;
  } catch (err) {
    return `Tự duyệt dịch thất bại: ${err instanceof Error ? err.message : String(err)}`;
  }
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

  // Verify (moderation + LLM judge). Advisory in P3 — the draft is saved for a
  // human either way; the verdict is stored and becomes the auto-publish gate
  // in P4. Never throws (fail-closed verdict on error).
  await updateRun(run.id, { status: "verifying" });
  const verdict = await verifyArticle(env, campaign, result.article);

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
  let warning: string | null = result.warning; // carry any news-fetch note
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

  // Merge any verifier note into the soft warning shown on the run.
  if (verdict.error) warning = (warning ? `${warning} | ` : "") + verdict.error;

  // Auto-publish gate (P4): flip the draft to 'live' ONLY when the campaign
  // opted in AND the verifier passed (moderation clean + judge safe + score).
  // Otherwise it stays 'review' for a human. Images are already attached above,
  // so a published post is never public without its photo. A publish failure
  // is non-fatal — the draft is preserved and surfaced for review.
  const shouldPublish = campaign.autopublish === 1 && verdict.passed;
  let runStatus: "published" | "needs_review" = "needs_review";
  if (shouldPublish) {
    try {
      const today = localParts(campaign.timezone || "Asia/Ho_Chi_Minh", Date.now()).date;
      await upsertBlogPost(actorId, {
        slug,
        locale: campaign.locale,
        title: a.title,
        status: "live",
        published_date: today,
      });
      runStatus = "published";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warning = (warning ? `${warning} | ` : "") + `Auto-đăng thất bại (giữ Chờ duyệt): ${msg}`;
    }

    // P5: optionally auto-approve the EN/ZH draft translations the blog pipeline
    // already created, so the published post is public in all 3 languages.
    // Best-effort — a failure never unpublishes the VI post.
    if (runStatus === "published" && campaign.autoapprove_translations === 1) {
      const note = await approveDraftTranslations(actorId, blogPostId);
      if (note) warning = (warning ? `${warning} | ` : "") + note;
    }
  }

  await updateRun(run.id, {
    status: runStatus,
    blog_post_id: blogPostId,
    blog_slug: slug,
    verdict_json: JSON.stringify(verdict),
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
    cost_usd: result.costUsd + imageCost + verdict.costUsd,
    error: warning,
  });
  return { ...run, status: runStatus, blog_post_id: blogPostId, blog_slug: slug };
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

// Process at most this many due campaigns per cron tick. Keeps a single
// scheduled() invocation bounded to ~one generation; remaining due campaigns
// are picked up on the next minute's tick (each still runs at/after its
// run_time that day). One generation is minutes of I/O-bound work, so we never
// let the blog bot dominate the shared cron invocation.
const MAX_CAMPAIGNS_PER_TICK = 1;

/** Cron entry point (added as an isolated task in src/server.ts scheduled()).
 *  Runs any enabled campaign that is due (local run_time reached, not yet run
 *  today) — at most MAX_CAMPAIGNS_PER_TICK per tick. Returns how many it
 *  processed. Isolated: each campaign is wrapped so one failure cannot affect
 *  another, and the caller further guards the whole task. */
export async function runBlogBotScheduler(env: EngineEnv, maxMs = 50_000): Promise<number> {
  const { listEnabledCampaigns } = await import("@/features/blog-bot/blog-bot.service");
  const deadline = Date.now() + maxMs;
  const enabled = await listEnabledCampaigns();
  const nowMs = Date.now();
  const due = enabled.filter((c) => isCampaignDue(c, nowMs));

  let processed = 0;
  for (const campaign of due) {
    if (processed >= MAX_CAMPAIGNS_PER_TICK || Date.now() > deadline) break;
    const actorId = campaign.created_by ?? 0; // system actor (mirrors translation engine)
    try {
      await runCampaignOnce(env, campaign, "schedule", actorId);
      processed++;
    } catch (err) {
      console.error("[blog-bot] scheduled run failed for campaign", campaign.id, err);
    }
  }
  return processed;
}
