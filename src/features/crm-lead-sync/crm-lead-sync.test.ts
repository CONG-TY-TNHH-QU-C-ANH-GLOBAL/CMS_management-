import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

const runtime = {} as Cloudflare.Env;
mock.module("cloudflare:workers", () => ({ env: runtime }));
const { getCrmLeadDeliveryHealth, replayLeadTelegramDelivery, retryCrmLeadDelivery } =
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
  ]) {
    sql.exec(readFileSync(new URL(`../../../db/migrations/${migration}`, import.meta.url), "utf8"));
  }
  Object.assign(runtime, {
    DB: d1(sql),
    CRM_LEAD_SYNC_URL: "https://crm.example.test/api/integrations/cms/leads",
    CMS_CRM_SYNC_KEY: "test-signing-key",
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
