import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { MonthlySourcingStatus } from "./monthly-sourcing.service";
export type {
  MonthlySourcingAdminMonth,
  MonthlySourcingAdminYear,
} from "./monthly-sourcing.server";

const ID = z.number().int().positive();
const YEAR = z.number().int().min(2020).max(2100);
const STATUS = z.enum(["draft", "live", "archived"]);

export const getMonthlySourcingAdminFn = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./monthly-sourcing.server")).getMonthlySourcingAdmin(),
);

export const createMonthlySourcingYearFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ year: YEAR }).parse(data))
  .handler(async ({ data }) =>
    (await import("./monthly-sourcing.server")).createMonthlySourcingYear(data.year),
  );

export const activateMonthlySourcingYearFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: ID }).parse(data))
  .handler(async ({ data }) =>
    (await import("./monthly-sourcing.server")).activateMonthlySourcingYear(data.id),
  );

export const setMonthlySourcingPagesFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: ID,
        pdf_media_id: ID,
        pages: z
          .array(
            z.object({
              page_no: z.number().int().min(1).max(200),
              media_id: ID,
              width: z.number().int().min(1).max(6000),
              height: z.number().int().min(1).max(8000),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    (await import("./monthly-sourcing.server")).setMonthlySourcingPages(data),
  );

export const updateMonthlySourcingMonthFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: ID,
        title: z.string().trim().min(1).max(200).optional(),
        pdf_media_id: ID.nullable().optional(),
        status: STATUS.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    (await import("./monthly-sourcing.server")).updateMonthlySourcingMonth(data),
  );
