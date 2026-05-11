// Dashboard service — aggregate counts from D1 for overview widgets.

import { getDb } from "@/core/db/client";

export interface DashboardSummary {
  translations: number;          // 1190 keys × 3 locales = 3570
  services: number;              // 3
  pricing_tables: number;        // 18
  faqs: number;                  // 5 × 3 locales = 15
  testimonials: number;          // 4 × 3
  contact_locations: number;     // 7 × 3
  blog_posts: number;            // 0 for now
  media: number;                 // 9 marquee + future R2 uploads
  users_active: number;
  leads_new: number;             // unread leads
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const row = await getDb()
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM translations) AS translations,
        (SELECT COUNT(*) FROM services) AS services,
        (SELECT COUNT(*) FROM pricing_tables) AS pricing_tables,
        (SELECT COUNT(DISTINCT position) FROM faqs WHERE scope = 'home') AS faqs,
        (SELECT COUNT(DISTINCT position) FROM testimonials) AS testimonials,
        (SELECT COUNT(DISTINCT position) FROM contact_locations) AS contact_locations,
        (SELECT COUNT(*) FROM blog_posts) AS blog_posts,
        (SELECT COUNT(*) FROM media) AS media,
        (SELECT COUNT(*) FROM users WHERE status = 'active') AS users_active,
        (SELECT COUNT(*) FROM leads WHERE status = 'new') AS leads_new`,
    )
    .first<DashboardSummary>();

  return (
    row ?? {
      translations: 0,
      services: 0,
      pricing_tables: 0,
      faqs: 0,
      testimonials: 0,
      contact_locations: 0,
      blog_posts: 0,
      media: 0,
      users_active: 0,
      leads_new: 0,
    }
  );
}
