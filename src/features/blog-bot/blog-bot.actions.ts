import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type {
  BlogBotCampaignRow,
  BlogBotRunRow,
  BotLocale,
  ImageMode,
  RunStatus,
  TopicSource,
} from "@/features/blog-bot/blog-bot.service";

const LOCALE = z.enum(["en", "vi", "zh"]);
const TOPIC_SOURCE = z.enum(["instruction", "seed_list"]);
const IMAGE_MODE = z.enum(["none", "ai_generate", "stock"]);
// gpt-4o = higher quality prose; gpt-4o-mini = cheaper. Mirrors the model
// allow-list the translation pricing table already supports.
const MODEL = z.enum(["gpt-4o", "gpt-4o-mini"]);
const RUN_TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ chạy phải dạng HH:MM (24h)");

// Shared campaign field shape. Create requires `name`; update takes a partial.
const campaignFields = {
  name: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  run_time: RUN_TIME.optional(),
  timezone: z.string().max(64).optional(),
  locale: LOCALE.optional(),
  category: z.string().max(100).nullable().optional(),
  tone: z.string().max(200).nullable().optional(),
  topic_source: TOPIC_SOURCE.optional(),
  instruction_md: z.string().max(8000).nullable().optional(),
  seed_topics_json: z.string().max(8000).nullable().optional(),
  guidelines_md: z.string().max(8000).nullable().optional(),
  image_mode: IMAGE_MODE.optional(),
  image_style: z.string().max(200).nullable().optional(),
  autopublish: z.boolean().optional(),
  model: MODEL.optional(),
  max_per_day: z.number().int().min(1).max(20).optional(),
};

const createSchema = z.object(campaignFields);
// Update: same fields but `name` optional too, plus the target id.
const updateSchema = z.object({
  id: z.number().int().positive(),
  ...campaignFields,
  name: campaignFields.name.optional(),
});

// ─────────────── reads ───────────────

export const listBotCampaignsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listCampaigns, listRuns } = await import("@/features/blog-bot/blog-bot.service");
  await requireSession("viewer");
  const [campaigns, runs] = await Promise.all([listCampaigns(), listRuns(null, 50)]);
  return { campaigns, runs };
});

// ─────────────── mutations ───────────────

export const createBotCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { createCampaign } = await import("@/features/blog-bot/blog-bot.service");
    const me = await requireSession("editor");
    const campaign = await createCampaign(me.id, data);
    return { campaign };
  });

export const updateBotCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateCampaign } = await import("@/features/blog-bot/blog-bot.service");
    const me = await requireSession("editor");
    const { id, ...rest } = data;
    const campaign = await updateCampaign(me.id, id, rest);
    return { campaign };
  });

export const deleteBotCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.number().int().positive() }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteCampaign } = await import("@/features/blog-bot/blog-bot.service");
    const me = await requireSession("editor");
    await deleteCampaign(me.id, data.id);
    return { ok: true as const };
  });

// "Run now" — generate one draft article for a campaign synchronously and
// return the resulting run. Saves as a review draft (never publishes). Editor
// session; the operator's id becomes the blog post author.
export const runBotCampaignNowFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.number().int().positive() }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { getCampaign } = await import("@/features/blog-bot/blog-bot.service");
    const { runCampaignOnce } = await import("@/features/blog-bot/blog-bot.engine");
    const { env } = await import("cloudflare:workers");
    const me = await requireSession("editor");
    const campaign = await getCampaign(data.id);
    if (!campaign) {
      throw Object.assign(new Error("Campaign không tồn tại"), { statusCode: 404 });
    }
    const run = await runCampaignOnce(env, campaign, "manual", me.id);
    return { run };
  });
