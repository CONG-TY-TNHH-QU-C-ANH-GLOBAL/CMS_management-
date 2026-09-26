import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

const runtime = {} as Cloudflare.Env;
mock.module("cloudflare:workers", () => ({ env: runtime }));
const { enqueueCrmLeadSync, flushCrmLeadOutbox, getCrmLeadDeliveryHealth, replayLeadTelegramDelivery, retryCrmLeadDelivery } =
  await import("./crm-lead-sync");

let sql: Database;
function d1(database: Database): D1Database {
  return {
    prepare(query: string) {
      let args: (string | number | null)[] = [];
      const statement = {
        bind(...values: (string | number | null)[]) {
          args = values;
          return statement;
        },
        async first() {
          return database.query(query).get(...args);
        },
        async all() {
          return { results: database.query(query).all(...args) };
        },
        async run() {
          return statement.execute();
        },
        execute() {
          return { success: true, meta: { changes: database.query(query).run(...args).changes } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

beforeEach(() => {
  sql = new Database(":memory:");
  for (const migration of [
    "0001_init.sql",
    "0032_telegram_channels.sql",
    "0046_crm_lead_outbox.sql",
    "0056_thg_consultation_projection.sql",
  ]) {
    sql.exec(readFileSync(new URL(`../../../db/migrations/${migration}`, import.meta.url), "utf8"));
  }
  Object.assign(runtime, {
    DB: d1(sql),
    CRM_LEAD_SYNC_URL: "https://crm.example.test/api/integrations/cms/leads",
    CMS_CRM_SYNC_KEY: "test-signing-key",
    CRM_LEGACY_LEAD_BACKFILL_ENABLED: "false",
  });
});

afterEach(() => sql.close());

test("reports CRM and Telegram delivery state without lead contact data", async () => {
  sql.exec(`INSERT INTO leads(id,name,email,created_at) VALUES
    (1,'Missing','missing@example.test',100),
    (2,'Sent','sent@example.test',200),
    (3,'Failed','failed@example.test',300);
    INSERT INTO crm_lead_outbox(id,lead_id,event_key,payload_json,sent_at) VALUES
    (20,2,'cms:lead:2','{}',210);
    INSERT INTO crm_lead_outbox(id,lead_id,event_key,payload_json,attempts,failed_permanently_at,last_error) VALUES
    (30,3,'cms:lead:3','{}',12,310,'503 CRM unavailable');
    INSERT INTO telegram_channels(id,label,chat_id,kind) VALUES (1,'Sales','-1001','ops');
    INSERT INTO telegram_outbox(event_type,channel_id,chat_id,body_text,idempotency_key,sent_at) VALUES
    ('lead_received',1,'-1001','sent','lead:2:1',220);
    INSERT INTO telegram_outbox(event_type,channel_id,chat_id,body_text,idempotency_key,failed_permanently_at) VALUES
    ('lead_received',1,'-1001','failed','lead:3:1',320);`);

  const health = await getCrmLeadDeliveryHealth();
  expect(health.crmUrlConfigured).toBe(true);
  expect(health.crmSecretConfigured).toBe(true);
  expect(health.rows.map((row) => [row.leadId, row.crmState, row.telegramState])).toEqual([
    [3, "failed", "failed"],
    [2, "sent", "sent"],
    [1, "missing", "missing"],
  ]);
  expect(JSON.stringify(health)).not.toContain("@example.test");
});

test("retry only reopens a permanently failed CRM row", async () => {
  sql.exec(`INSERT INTO leads(id,name,email) VALUES (1,'One','one@example.test'),(2,'Two','two@example.test');
    INSERT INTO crm_lead_outbox(id,lead_id,event_key,payload_json,attempts,failed_permanently_at,last_error)
      VALUES (1,1,'cms:lead:1','{}',12,100,'failed');
    INSERT INTO crm_lead_outbox(id,lead_id,event_key,payload_json)
      VALUES (2,2,'cms:lead:2','{}');`);

  expect(await retryCrmLeadDelivery(1)).toBe(true);
  expect(await retryCrmLeadDelivery(2)).toBe(false);
  const reopened = sql
    .query("SELECT attempts, failed_permanently_at, last_error FROM crm_lead_outbox WHERE id=1")
    .get() as Record<string, unknown>;
  expect(reopened).toEqual({ attempts: 0, failed_permanently_at: null, last_error: null });
});

test("new website submissions emit consultation v2 and require a ticket receipt", async () => {
  sql.exec(`INSERT INTO leads(id,name,email,crm_projection) VALUES
    (8,'Legacy Customer','legacy@example.test','lead'),
    (9,'THG Customer','customer@example.test','consultation');
    INSERT INTO crm_lead_outbox(lead_id,event_key,payload_json,next_attempt_at)
      VALUES (8,'cms:lead:8','{"schemaVersion":1}',0);`);
  await enqueueCrmLeadSync(9, {
    name: "THG Customer",
    email: "customer@example.test",
    company_url: "https://shop.example.test",
    monthly_order_band: "500_1999",
    ship_to_markets: ["US", "EU_UK"],
    phone: "0901234567",
    message: "Need fulfillment advice",
    source_page: "https://thgfulfill.com/vi",
    locale: "vi",
    primary_service: "fulfill",
    surface: "consultation_modal",
    crm_projection: "consultation",
    visitor_location: { country: "VN", city: "Ho Chi Minh City", timezone: "Asia/Ho_Chi_Minh" },
  });
  const queued = sql.query("SELECT payload_json FROM crm_lead_outbox WHERE lead_id=9").get() as { payload_json: string };
  const event = JSON.parse(queued.payload_json);
  expect([event.schemaVersion, event.eventType, event.lead.location.country]).toEqual([
    2,
    "consultation.created",
    "VN",
  ]);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = mock(async () => Response.json({ ok: true, leadCode: "LD-WRONG" })) as unknown as typeof fetch;
    await flushCrmLeadOutbox();
    expect((sql.query("SELECT sent_at,attempts FROM crm_lead_outbox WHERE lead_id=9").get() as Record<string, unknown>)).toEqual({ sent_at: null, attempts: 1 });

    sql.exec("UPDATE crm_lead_outbox SET next_attempt_at=0 WHERE lead_id=9");
    globalThis.fetch = mock(async () => Response.json({ ok: true, ticketId: "SUP-20260926-ABC12345" })) as unknown as typeof fetch;
    await flushCrmLeadOutbox();
    expect((sql.query("SELECT sent_at FROM crm_lead_outbox WHERE lead_id=9").get() as { sent_at: number | null }).sent_at).not.toBeNull();
    expect(
      sql.query("SELECT sent_at,attempts FROM crm_lead_outbox WHERE lead_id=8").get(),
    ).toEqual({ sent_at: null, attempts: 0 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram replay enqueues once per subscribed channel", async () => {
  sql.exec(`INSERT INTO leads(id,name,email) VALUES (7,'Replay','replay@example.test');
    INSERT INTO telegram_channels(id,label,chat_id,kind) VALUES (4,'Sales','-1004','ops');
    INSERT INTO telegram_subscriptions(channel_id,event_type,enabled)
      VALUES (4,'lead_received',1);`);

  expect(await replayLeadTelegramDelivery(7)).toBe(1);
  expect(await replayLeadTelegramDelivery(7)).toBe(0);
  const delivery = sql
    .query("SELECT event_type, channel_id, idempotency_key FROM telegram_outbox")
    .get() as Record<string, unknown>;
  expect(delivery).toEqual({
    event_type: "lead_received",
    channel_id: 4,
    idempotency_key: "lead:7:4",
  });
});
