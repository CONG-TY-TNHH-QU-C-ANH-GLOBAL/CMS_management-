import { z } from "zod";

export const hubEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    externalId: z
      .string()
      .max(300)
      .regex(/^crm:[A-Za-z0-9_-]+:[a-z0-9][a-z0-9._-]*$/),
    taskId: z.string().min(1).max(100),
    versionId: z.string().min(1).max(100),
    approvalId: z.string().min(1).max(100),
    sourceRevision: z.number().int().positive().safe(),
    kind: z.enum(["event", "blog"]),
    locale: z.enum(["vi", "en", "zh"]),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    content: z.unknown(),
    sourceLinks: z.array(z.string().max(1000)).max(20),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    renderedContent: z.record(z.unknown()),
  })
  .strict();
export type HubEnvelope = z.infer<typeof hubEnvelopeSchema>;

const nullable = (limit: number) => z.string().max(limit).nullable();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date");
export const hubEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    summary: nullable(500),
    body_md: z.string().min(1).max(60000),
    event_date: date,
    end_date: date.nullable(),
    location: nullable(200),
    role: nullable(120),
    url: z.string().url().max(500).nullable(),
    video_url: z.string().url().max(500).nullable(),
    seo_title: nullable(200),
    seo_description: nullable(300),
  })
  .strict()
  .refine(
    (value) => !value.end_date || value.end_date >= value.event_date,
    "End date precedes event date",
  );
export const hubBlogSchema = z
  .object({
    title: z.string().min(1).max(500),
    excerpt: nullable(2000),
    body_md: z.string().min(1).max(60000),
    category: nullable(100),
    published_date: date.nullable(),
    seo_title: nullable(200),
    seo_description: nullable(500),
  })
  .strict();

export const hubPreviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    externalId: z
      .string()
      .max(300)
      .regex(/^crm-preview:[A-Za-z0-9_-]+:[a-z0-9][a-z0-9._-]*$/),
    taskId: z.string().min(1).max(100),
    versionId: z.string().min(1).max(100),
    targetId: z.string().min(1).max(100),
    sourceRevision: z.number().int().positive().safe(),
    kind: z.literal("blog"),
    locale: z.enum(["vi", "en", "zh"]),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
    renderedContent: hubBlogSchema,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const hubReadResponseSchema = z.object({
  externalId: z.string(),
  taskId: z.string(),
  versionId: z.string(),
  approvalId: z.string(),
  sourceRevision: z.number().int(),
  payloadHash: z.string(),
  contentHash: z.string(),
  kind: z.enum(["event", "blog"]),
  locale: z.string(),
  slug: z.string(),
  cmsRevision: z.number().int(),
  status: z.string(),
  publicUrl: z.string().nullable(),
  callbacks: z.array(
    z.object({
      eventId: z.string(),
      state: z.string(),
      attempts: z.number().int(),
      errorCode: z.string().nullable(),
    }),
  ),
});

export const hubMediaSchema = z
  .object({
    mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
    dataBase64: z.string().min(1).max(1400000),
    altText: z.string().max(200).default(""),
  })
  .strict();

export const hubRetrySchema = z
  .object({ expectedAttempts: z.number().int().nonnegative().safe() })
  .strict();
