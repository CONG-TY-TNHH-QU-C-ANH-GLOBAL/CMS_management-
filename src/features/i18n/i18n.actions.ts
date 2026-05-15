// RPC server fns for the translations admin (UI primitives editing).
// Pattern mirrors content.actions / glossary.actions.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { TranslationRow } from "./i18n.service";

const LOCALE = z.enum(["en", "vi", "zh"]);
const KEY = z.string().trim().min(1).max(120);
const VALUE = z.string().max(20000);

export const listAllTranslationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listAllTranslations } = await import("./i18n.service");
  await requireSession("viewer");
  return await listAllTranslations();
});

export const upsertTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ key: KEY, locale: LOCALE, value: VALUE }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { upsertTranslation } = await import("./i18n.service");
    const me = await requireSession("editor");
    const result = await upsertTranslation(me.id, data);
    await bumpCmsRev();
    return result;
  });

export const deleteTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ key: KEY, locale: LOCALE }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { deleteTranslation } = await import("./i18n.service");
    const me = await requireSession("editor");
    await deleteTranslation(me.id, data);
    await bumpCmsRev();
    return { ok: true as const };
  });
