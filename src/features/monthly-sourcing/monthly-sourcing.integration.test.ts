import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import {
  createLoader,
  d1,
  migratedSnapshot,
  srcPath,
} from "@/features/campaigns/landing/__fixtures__/worker-harness.test";

const ACTOR = 9;

let sql: Database;
let snapshot: Uint8Array;
let audits: Array<{ action: string; entity: string; entityId: number | null }>;

const db = d1(() => sql);
const loader = createLoader({
  "@/core/db/client": { getDb: () => db },
  "@/core/db/mutations": {
    auditLog: async (_actorId: number, action: string, entity: string, entityId: number | null) =>
      audits.push({ action, entity, entityId }),
  },
});
const service = loader.load<typeof import("./monthly-sourcing.service")>(
  srcPath("features/monthly-sourcing/monthly-sourcing.service"),
);

beforeAll(() => {
  snapshot = migratedSnapshot();
});

beforeEach(() => {
  sql = Database.deserialize(snapshot);
  audits = [];
});

function insertReadyPdf(id: number, key = "monthly-sourcing/january.pdf", verified = true) {
  sql
    .query(
      `INSERT INTO media (id, r2_key, mime, bytes, status, monthly_pdf_verified)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, key, "application/pdf", 10, "ready", verified ? 1 : 0);
}

describe("monthly sourcing year lifecycle", () => {
  test("refuses a year whose fixed LP namespace is already used by a campaign", async () => {
    sql
      .query(`INSERT INTO campaigns (slug, locale, title, status) VALUES (?, 'vi', ?, 'live')`)
      .run("thang-7-2026", "Existing campaign");

    await expect(service.createMonthlySourcingYear(ACTOR, 2026)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(await service.listMonthlySourcingAdmin()).toEqual([]);
  });

  test("creates twelve slots, publishes only a ready PDF, and exposes the active year", async () => {
    const year = await service.createMonthlySourcingYear(ACTOR, 2026);
    const admin = await service.listMonthlySourcingAdmin();
    expect(admin).toHaveLength(1);
    expect(admin[0]?.months.map((month) => month.month)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(admin[0]?.months[0]?.title).toBe("Top sản phẩm & nguồn hàng tháng 1/2026");

    await service.activateMonthlySourcingYear(ACTOR, year.id);
    expect(await service.getActiveLiveMonthlySourcing()).toEqual({ year: 2026, months: [] });

    const january = (await service.listMonthlySourcingAdmin())[0]?.months[0];
    expect(january).toBeDefined();
    insertReadyPdf(700);
    await service.updateMonthlySourcingMonth(ACTOR, {
      id: january!.id,
      pdf_media_id: 700,
      status: "live",
    });

    expect(await service.getActiveLiveMonthlySourcing()).toEqual({
      year: 2026,
      months: [
        {
          month: 1,
          title: "Top sản phẩm & nguồn hàng tháng 1/2026",
          slug: "thang-1-2026",
        },
      ],
    });
    await expect(
      service.getLiveMonthlySourcingForLanding(2026, 1, "https://cms.test", db),
    ).resolves.toEqual({
      year: 2026,
      month: 1,
      title: "Top sản phẩm & nguồn hàng tháng 1/2026",
      pdfUrl: "https://cms.test/api/v1/media/monthly-sourcing%2Fjanuary.pdf",
      pages: [],
    });
    expect(audits.map(({ action, entity }) => [action, entity])).toEqual([
      ["create", "monthly_sourcing_years"],
      ["publish", "monthly_sourcing_years"],
      ["update", "monthly_sourcing_months"],
    ]);
  });

  test("does not publish an invalid asset and removes a month when its PDF is archived", async () => {
    const year = await service.createMonthlySourcingYear(ACTOR, 2026);
    await service.activateMonthlySourcingYear(ACTOR, year.id);
    const january = (await service.listMonthlySourcingAdmin())[0]?.months[0];
    expect(january).toBeDefined();

    sql
      .query(`INSERT INTO media (id, r2_key, mime, bytes, status) VALUES (?, ?, ?, ?, ?)`)
      .run(701, "monthly-sourcing/not-a-pdf.png", "image/png", 10, "ready");
    await expect(
      service.updateMonthlySourcingMonth(ACTOR, {
        id: january!.id,
        pdf_media_id: 701,
        status: "live",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    insertReadyPdf(702, "monthly-sourcing/january-live.pdf");
    await service.updateMonthlySourcingMonth(ACTOR, {
      id: january!.id,
      pdf_media_id: 702,
      status: "live",
    });
    sql.query("UPDATE media SET status = 'archived' WHERE id = ?").run(702);

    expect(await service.getActiveLiveMonthlySourcing()).toEqual({ year: 2026, months: [] });
    await expect(
      service.getLiveMonthlySourcingForLanding(2026, 1, "https://cms.test", db),
    ).resolves.toBeNull();
  });

  test("does not publish a PDF that was not verified when uploaded", async () => {
    const year = await service.createMonthlySourcingYear(ACTOR, 2026);
    const january = (await service.listMonthlySourcingAdmin())[0]?.months[0];
    expect(january).toBeDefined();

    insertReadyPdf(704, "monthly-sourcing/unverified.pdf", false);
    await expect(
      service.updateMonthlySourcingMonth(ACTOR, {
        id: january!.id,
        pdf_media_id: 704,
        status: "live",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(year.year).toBe(2026);
  });

  test("moves the menu to one new year without breaking an older live direct link", async () => {
    const oldYear = await service.createMonthlySourcingYear(ACTOR, 2026);
    const oldJanuary = (await service.listMonthlySourcingAdmin())[0]?.months[0];
    insertReadyPdf(703, "monthly-sourcing/2026-1.pdf");
    await service.updateMonthlySourcingMonth(ACTOR, {
      id: oldJanuary!.id,
      pdf_media_id: 703,
      status: "live",
    });
    await service.activateMonthlySourcingYear(ACTOR, oldYear.id);

    const newYear = await service.createMonthlySourcingYear(ACTOR, 2027);
    await service.activateMonthlySourcingYear(ACTOR, newYear.id);

    expect(await service.getActiveLiveMonthlySourcing()).toEqual({ year: 2027, months: [] });
    await expect(
      service.getLiveMonthlySourcingForLanding(2026, 1, "https://cms.test", db),
    ).resolves.toMatchObject({
      year: 2026,
      month: 1,
      pdfUrl: "https://cms.test/api/v1/media/monthly-sourcing%2F2026-1.pdf",
    });
  });
});

describe("monthly sourcing page images", () => {
  function insertPageImage(id: number, tag = "monthly-sourcing-page", mime = "image/webp") {
    sql
      .query(`INSERT INTO media (id, r2_key, mime, bytes, status, tag) VALUES (?, ?, ?, ?, 'ready', ?)`)
      .run(id, `monthly-sourcing-page/p-${id}.webp`, mime, 10, tag);
  }
  async function liveJanuary() {
    const year = await service.createMonthlySourcingYear(ACTOR, 2026);
    await service.activateMonthlySourcingYear(ACTOR, year.id);
    const january = (await service.listMonthlySourcingAdmin())[0]!.months[0]!;
    insertReadyPdf(800, "monthly-sourcing/jan.pdf");
    await service.updateMonthlySourcingMonth(ACTOR, { id: january.id, pdf_media_id: 800, status: "live" });
    return january;
  }
  const pageInput = (ids: number[]) =>
    ids.map((media_id, index) => ({ page_no: index + 1, media_id, width: 1200, height: 1697 }));

  test("stores pages for the current PDF and serves them to the landing in order", async () => {
    const january = await liveJanuary();
    insertPageImage(801);
    insertPageImage(802);
    await expect(
      service.setMonthlySourcingPages(ACTOR, { id: january.id, pdf_media_id: 800, pages: pageInput([801, 802]) }),
    ).resolves.toEqual({ page_count: 2 });

    const landing = await service.getLiveMonthlySourcingForLanding(2026, 1, "https://cms.test", db);
    expect(landing?.pages.map((page) => page.url)).toEqual([
      "https://cms.test/api/v1/media/monthly-sourcing-page%2Fp-801.webp",
      "https://cms.test/api/v1/media/monthly-sourcing-page%2Fp-802.webp",
    ]);
    expect((await service.listMonthlySourcingAdmin())[0]!.months[0]!.page_count).toBe(2);
  });

  test("replacing the PDF retires the old page images until they are regenerated", async () => {
    const january = await liveJanuary();
    insertPageImage(801);
    await service.setMonthlySourcingPages(ACTOR, { id: january.id, pdf_media_id: 800, pages: pageInput([801]) });
    insertReadyPdf(803, "monthly-sourcing/jan-v2.pdf");
    await service.updateMonthlySourcingMonth(ACTOR, { id: january.id, pdf_media_id: 803 });

    const landing = await service.getLiveMonthlySourcingForLanding(2026, 1, "https://cms.test", db);
    expect(landing?.pages).toEqual([]);
    expect((await service.listMonthlySourcingAdmin())[0]!.months[0]!.page_count).toBe(0);
    await expect(
      service.setMonthlySourcingPages(ACTOR, { id: january.id, pdf_media_id: 800, pages: pageInput([801]) }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test("rejects wrong tag/mime, gaps and duplicate images", async () => {
    const january = await liveJanuary();
    insertPageImage(801, "misc");
    insertPageImage(802, "monthly-sourcing-page", "application/pdf");
    insertPageImage(803);
    insertPageImage(804);
    const set = (pages: ReturnType<typeof pageInput>) =>
      service.setMonthlySourcingPages(ACTOR, { id: january.id, pdf_media_id: 800, pages });
    await expect(set(pageInput([801]))).rejects.toMatchObject({ statusCode: 422 });
    await expect(set(pageInput([802]))).rejects.toMatchObject({ statusCode: 422 });
    await expect(set([{ page_no: 2, media_id: 803, width: 1, height: 1 }])).rejects.toMatchObject({ statusCode: 422 });
    await expect(set(pageInput([803, 803]))).rejects.toMatchObject({ statusCode: 422 });
    await expect(set(pageInput([803, 804]))).resolves.toEqual({ page_count: 2 });
  });
});
