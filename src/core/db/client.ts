import { env } from "cloudflare:workers";
import "./env";

// D1 statements are stateless across requests; PRAGMA foreign_keys does not
// stick. CHECK constraints in 0001_init.sql enforce enums; FK referential
// integrity is enforced application-side at write time. Schema FK columns are
// kept for documentation and future migration to standalone Postgres.

export function getDb(): D1Database {
  return env.DB;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
