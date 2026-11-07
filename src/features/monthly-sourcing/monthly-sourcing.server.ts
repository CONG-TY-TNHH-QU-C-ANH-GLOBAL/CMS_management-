// Server-only admin bodies.  Keeping auth, D1 and cache invalidation here
// prevents them from entering the CMS browser bundle through server functions.

import { bumpCmsRev } from "@/core/db/mutations";
import { requireSession } from "@/features/auth";
import { toMediaUrl } from "@/features/partners/partners.media";

import * as service from "./monthly-sourcing.service";

type Role = "viewer" | "editor";

export type MonthlySourcingAdminMonth = service.MonthlySourcingAdminMonthRow & {
  pdf_url: string | null;
};

export type MonthlySourcingAdminYear = Omit<service.MonthlySourcingAdminYear, "months"> & {
  months: MonthlySourcingAdminMonth[];
};

async function mutate<T>(role: Role, run: (actorId: number) => Promise<T>): Promise<T> {
  const me = await requireSession(role);
  const result = await run(me.id);
  await bumpCmsRev();
  return result;
}

export async function getMonthlySourcingAdmin(): Promise<{ years: MonthlySourcingAdminYear[] }> {
  await requireSession("viewer");
  const years = await service.listMonthlySourcingAdmin();
  return {
    years: years.map((year) => ({
      ...year,
      months: year.months.map((month) => ({
        ...month,
        // Relative on purpose: the CMS admin and its document proxy share an origin.
        pdf_url: toMediaUrl(month.pdf_r2_key, ""),
      })),
    })),
  };
}

export const createMonthlySourcingYear = (year: number) =>
  mutate("editor", (actorId) => service.createMonthlySourcingYear(actorId, year));

export const activateMonthlySourcingYear = (id: number) =>
  mutate("editor", (actorId) => service.activateMonthlySourcingYear(actorId, id));

export const updateMonthlySourcingMonth = (input: service.UpdateMonthlySourcingMonthInput) =>
  mutate("editor", (actorId) => service.updateMonthlySourcingMonth(actorId, input));
