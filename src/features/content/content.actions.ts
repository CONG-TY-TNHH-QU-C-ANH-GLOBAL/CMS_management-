// RPC stubs for landing-page content. Read + write.
// Each mutation: requireSession(role) → service call → bumpCmsRev() → return.
// Service layer is responsible for auditLog. Public REST API edge cache invalidates via bumpCmsRev.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type {
  ContactLocationRow,
  FaqRow,
  IntegrationRow,
  Locale,
  MarqueeImageRow,
  ServiceI18nRow,
  ServiceRow,
  ServiceWithI18n,
  TestimonialRow,
} from "@/features/content";

const LOCALE = z.enum(["en", "vi", "zh"]);
const ID = z.number().int().positive();

// ───────────────────────────── reads ─────────────────────────────

export const listServicesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listServices } = await import("@/features/content");
  await requireSession("viewer");
  return { services: await listServices() };
});

export const listHomeFaqsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listFaqs } = await import("@/features/content");
  await requireSession("viewer");
  return { faqs: await listFaqs("home") };
});

/** All FAQs across scopes — admin surfaces scope tabs (home / order / …)
 *  on one page rather than a separate route per scope. */
export const listAllFaqsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listAllFaqs } = await import("@/features/content");
  await requireSession("viewer");
  return { faqs: await listAllFaqs() };
});

export const listTestimonialsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listTestimonials } = await import("@/features/content");
  await requireSession("viewer");
  return { testimonials: await listTestimonials() };
});

export const listContactLocationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listContactLocations } = await import("@/features/content");
  await requireSession("viewer");
  return { locations: await listContactLocations() };
});

export const listIntegrationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listIntegrations } = await import("@/features/content");
  await requireSession("viewer");
  return { integrations: await listIntegrations() };
});

export const listMarqueeImagesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listMarqueeImages } = await import("@/features/content");
  await requireSession("viewer");
  return { images: await listMarqueeImages() };
});

// ───────────────────────────── Service mutations ─────────────────────────────

const STATUS = z.enum(["draft", "live", "archived"]);

const galleryItemSchema = z.object({
  url: z.string().max(2000).optional(),
  media_id: z.number().int().positive().optional(),
  alt: z.string().max(500).optional(),
});

const videoSchema = z.object({
  youtube_id: z.string().min(1).max(20),
  caption_key: z.string().max(200).optional(),
  caption: z.string().max(500).optional(),
  thumb: z.string().max(2000).optional(),
});

const productSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.string().max(50).optional(),
  time: z.string().max(50).optional(),
  origin: z.string().max(100).optional(),
  image: z.string().max(2000).optional(),
  media_id: z.number().int().positive().optional(),
});

const serviceBaseUpdate = z.object({
  id: z.string().min(1).max(100),
  position: z.number().int().min(0).optional(),
  icon: z.string().max(20).nullable().optional(),
  status: STATUS.optional(),
  gallery: z.array(galleryItemSchema).max(50).nullable().optional(),
  videos: z.array(videoSchema).max(20).nullable().optional(),
  products: z.array(productSchema).max(50).nullable().optional(),
});

export const updateServiceBaseFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => serviceBaseUpdate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateServiceBase } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const service = await updateServiceBase(me.id, data);
    await bumpCmsRev();
    return { service };
  });

const serviceI18nUpsert = z.object({
  service_id: z.string().min(1).max(100),
  locale: LOCALE,
  name: z.string().min(1).max(200),
  tagline: z.string().max(500).nullable().optional(),
  hero_eyebrow: z.string().max(200).nullable().optional(),
  hero_title: z.string().max(500).nullable().optional(),
  hero_sub: z.string().max(2000).nullable().optional(),
  cta_text: z.string().max(100).nullable().optional(),
  cta_url: z.string().max(500).nullable().optional(),
  body_md: z.string().max(10000).nullable().optional(),
});

export const upsertServiceI18nFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => serviceI18nUpsert.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { upsertServiceI18n } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const i18n = await upsertServiceI18n(me.id, data);
    await bumpCmsRev();
    return { i18n };
  });

const serviceBulletsReplace = z.object({
  service_id: z.string().min(1).max(100),
  locale: LOCALE,
  bullets: z.array(z.string().max(500)).max(50),
});

export const replaceServiceBulletsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => serviceBulletsReplace.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { replaceServiceBullets } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const bullets = await replaceServiceBullets(me.id, data);
    await bumpCmsRev();
    return { bullets };
  });

// ───────────────────────────── FAQ mutations ─────────────────────────────

const faqCreate = z.object({
  scope: z.string().min(1).max(100).default("home"),
  position: z.number().int().min(0).default(99),
  locale: LOCALE,
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(5000),
});

export const createFaqFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => faqCreate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { createFaq } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const faq = await createFaq(me.id, data);
    await bumpCmsRev();
    return { faq };
  });

const faqUpdate = z.object({
  id: ID,
  question: z.string().min(1).max(500).optional(),
  answer: z.string().min(1).max(5000).optional(),
  position: z.number().int().min(0).optional(),
});

export const updateFaqFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => faqUpdate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateFaq } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const faq = await updateFaq(me.id, data);
    await bumpCmsRev();
    return { faq };
  });

export const deleteFaqFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: ID }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteFaq } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deleteFaq(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

const faqReorder = z.object({
  scope: z.string().min(1).max(100),
  locale: LOCALE,
  orderedIds: z.array(ID),
});

export const reorderFaqsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => faqReorder.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { reorderFaqs } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await reorderFaqs(me.id, data);
    await bumpCmsRev();
    return { ok: true as const };
  });

// ───────────────────────────── Testimonial mutations ─────────────────────────────

const testCreate = z.object({
  position: z.number().int().min(0).default(99),
  locale: LOCALE,
  quote: z.string().min(1).max(2000),
  author_name: z.string().min(1).max(200),
  author_role: z.string().max(200).nullable().optional(),
  avatar_media_id: ID.nullable().optional(),
});

export const createTestimonialFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => testCreate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { createTestimonial } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const testimonial = await createTestimonial(me.id, data);
    await bumpCmsRev();
    return { testimonial };
  });

const testUpdate = z.object({
  id: ID,
  position: z.number().int().min(0).optional(),
  quote: z.string().min(1).max(2000).optional(),
  author_name: z.string().min(1).max(200).optional(),
  author_role: z.string().max(200).nullable().optional(),
  avatar_media_id: ID.nullable().optional(),
});

export const updateTestimonialFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => testUpdate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateTestimonial } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const testimonial = await updateTestimonial(me.id, data);
    await bumpCmsRev();
    return { testimonial };
  });

export const deleteTestimonialFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: ID }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteTestimonial } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deleteTestimonial(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const reorderTestimonialsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ locale: LOCALE, orderedIds: z.array(ID) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { reorderTestimonials } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await reorderTestimonials(me.id, data);
    await bumpCmsRev();
    return { ok: true as const };
  });

// ───────────────────────────── Contact location mutations ─────────────────────────────

const KIND = z.enum(["office", "warehouse", "phone", "email", "website"]);

const contactCreate = z.object({
  position: z.number().int().min(0).default(99),
  kind: KIND,
  locale: LOCALE,
  label: z.string().min(1).max(200),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(100).nullable().optional(),
  url: z.string().max(500).nullable().optional(),
  lang_class: z.string().max(50).nullable().optional(),
});

export const createContactLocationFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => contactCreate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { createContactLocation } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const location = await createContactLocation(me.id, data);
    await bumpCmsRev();
    return { location };
  });

const contactUpdate = z.object({
  id: ID,
  position: z.number().int().min(0).optional(),
  kind: KIND.optional(),
  label: z.string().min(1).max(200).optional(),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(100).nullable().optional(),
  url: z.string().max(500).nullable().optional(),
  lang_class: z.string().max(50).nullable().optional(),
});

export const updateContactLocationFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => contactUpdate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateContactLocation } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const location = await updateContactLocation(me.id, data);
    await bumpCmsRev();
    return { location };
  });

export const deleteContactLocationFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: ID }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteContactLocation } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deleteContactLocation(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const reorderContactLocationsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ locale: LOCALE, orderedIds: z.array(ID) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { reorderContactLocations } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await reorderContactLocations(me.id, data);
    await bumpCmsRev();
    return { ok: true as const };
  });

// ───────────────────────────── Integration mutations (locale-agnostic) ─────────────────────────────

const integrationCreate = z.object({
  position: z.number().int().min(0).default(99),
  name: z.string().min(1).max(100),
  logo_media_id: ID.nullable().optional(),
  url: z.string().max(500).nullable().optional(),
  color_class: z.string().max(100).nullable().optional(),
});

export const createIntegrationFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => integrationCreate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { createIntegration } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const integration = await createIntegration(me.id, data);
    await bumpCmsRev();
    return { integration };
  });

const integrationUpdate = z.object({
  id: ID,
  position: z.number().int().min(0).optional(),
  name: z.string().min(1).max(100).optional(),
  logo_media_id: ID.nullable().optional(),
  url: z.string().max(500).nullable().optional(),
  color_class: z.string().max(100).nullable().optional(),
});

export const updateIntegrationFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => integrationUpdate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateIntegration } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const integration = await updateIntegration(me.id, data);
    await bumpCmsRev();
    return { integration };
  });

export const deleteIntegrationFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: ID }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteIntegration } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deleteIntegration(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const reorderIntegrationsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ orderedIds: z.array(ID) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { reorderIntegrations } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await reorderIntegrations(me.id, data.orderedIds);
    await bumpCmsRev();
    return { ok: true as const };
  });

// ───────────────────────────── Marquee mutations ─────────────────────────────

const marqueeCreate = z.object({
  position: z.number().int().min(0).default(99),
  media_id: ID,
  alt_text: z.string().min(1).max(200),
});

export const createMarqueeImageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => marqueeCreate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { createMarqueeImage } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const image = await createMarqueeImage(me.id, data);
    await bumpCmsRev();
    return { image };
  });

const marqueeCreateUrl = z.object({
  position: z.number().int().min(0).default(99),
  url: z.string().url().max(2000),
  alt_text: z.string().min(1).max(200),
});

export const createMarqueeImageFromUrlFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => marqueeCreateUrl.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { createMarqueeImageFromUrl } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const image = await createMarqueeImageFromUrl(me.id, data);
    await bumpCmsRev();
    return { image };
  });

const marqueeUpdate = z.object({
  id: ID,
  position: z.number().int().min(0).optional(),
  media_id: ID.optional(),
  alt_text: z.string().min(1).max(200).optional(),
});

export const updateMarqueeImageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => marqueeUpdate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateMarqueeImage } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const image = await updateMarqueeImage(me.id, data);
    await bumpCmsRev();
    return { image };
  });

export const deleteMarqueeImageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: ID }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteMarqueeImage } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deleteMarqueeImage(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const reorderMarqueeImagesFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ orderedIds: z.array(ID) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { reorderMarqueeImages } = await import("@/features/content");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await reorderMarqueeImages(me.id, data.orderedIds);
    await bumpCmsRev();
    return { ok: true as const };
  });
