import { getDb } from "@/core/db/client";

export interface HubContentRow {
  external_id: string;
  kind: "event" | "blog";
  slug: string;
  locale: string;
  content_id: number;
  source_revision: number;
  cms_revision: number;
  payload_json: string;
  payload_hash: string;
  projection_json: string;
}
export function contentTable(kind: "event" | "blog") {
  return kind === "event" ? "events" : "blog_posts";
}
export function getHubContent(externalId: string) {
  return getDb()
    .prepare("SELECT * FROM marketing_hub_contents WHERE external_id=?")
    .bind(externalId)
    .first<HubContentRow>();
}
export function guard(condition: string, bindings: unknown[] = []) {
  return getDb()
    .prepare(
      `INSERT INTO marketing_hub_guards(id,valid) VALUES (?,CASE WHEN (${condition}) THEN 1 ELSE 0 END)`,
    )
    .bind(crypto.randomUUID(), ...bindings);
}
export async function atomic(statements: D1PreparedStatement[]) {
  // D1 batch is transactional. A failed CHECK aborts business writes and receipt together.
  return getDb().batch([...statements, getDb().prepare("DELETE FROM marketing_hub_guards")]);
}
export function isConflict(error: unknown) {
  return /marketing_hub_conflict|UNIQUE constraint failed/.test(String(error));
}
export function command(commandId: string) {
  return getDb()
    .prepare("SELECT * FROM marketing_hub_commands WHERE command_id=?")
    .bind(commandId)
    .first<{ request_hash: string; response_json: string; response_status: number }>();
}
export function saveCommand(
  commandId: string,
  requestHash: string,
  response: unknown,
  status: number,
) {
  return getDb()
    .prepare(
      "INSERT INTO marketing_hub_commands(command_id,request_hash,response_json,response_status,created_at) VALUES (?,?,?,?,?)",
    )
    .bind(commandId, requestHash, JSON.stringify(response), status, new Date().toISOString());
}
export async function serviceActor(): Promise<number> {
  const db = getDb();
  // Do not consume first-human-admin bootstrap in a fresh CMS database.
  const admin = await db
    .prepare("SELECT id FROM users WHERE role='admin' AND status='active' LIMIT 1")
    .first();
  if (!admin) throw Object.assign(new Error("CMS_ADMIN_NOT_BOOTSTRAPPED"), { statusCode: 503 });
  await db
    .prepare(
      `INSERT INTO users(email,name,role,status,provider,created_at)
    VALUES ('marketing-hub@thgfulfill.com','Marketing Hub','editor','disabled','local',unixepoch())
    ON CONFLICT(email) DO NOTHING`,
    )
    .run();
  const actor = await db
    .prepare(
      "SELECT id FROM users WHERE email='marketing-hub@thgfulfill.com' AND status='disabled'",
    )
    .first<{ id: number }>();
  if (!actor) throw Object.assign(new Error("CMS_SERVICE_ACTOR_CONFLICT"), { statusCode: 409 });
  return actor.id;
}
