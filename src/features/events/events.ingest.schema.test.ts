// The draft-only guarantee of the agent ingest surface, stated where it is
// actually enforced.
//
// No mocking and no Worker runtime: the schema module is pure by design (see its
// header), so this suite can pin the security-relevant property directly instead
// of inferring it from a route's behaviour.

import { describe, expect, test } from "bun:test";

import { agentEventBodySchema } from "./events.ingest.schema";

const minimal = {
  slug: "thg-x-onpoint",
  title: "THG x ONPOINT",
  event_date: "2026-09-01",
};

describe("agent ingest body", () => {
  test("an agent cannot ask for publication", () => {
    // THE load-bearing assertion of this module. A caller that sends a publish
    // instruction — under any of the names the column, the CMS UI or a careless
    // agent might use — has it stripped during parse, so nothing downstream can
    // honour it even by accident.
    const parsed = agentEventBodySchema.parse({
      ...minimal,
      status: "live",
      published: true,
      publish: true,
    });
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("published");
    expect(parsed).not.toHaveProperty("publish");
  });

  test("defaults the locale to vi — the language marketing reviews", () => {
    expect(agentEventBodySchema.parse(minimal).locale).toBe("vi");
    expect(agentEventBodySchema.parse({ ...minimal, locale: "en" }).locale).toBe("en");
    expect(agentEventBodySchema.safeParse({ ...minimal, locale: "fr" }).success).toBe(false);
  });

  test("requires the three fields an Event cannot render without", () => {
    for (const missing of ["slug", "title", "event_date"] as const) {
      const body: Record<string, unknown> = { ...minimal };
      delete body[missing];
      expect(agentEventBodySchema.safeParse(body).success).toBe(false);
    }
  });

  test("rejects a slug that would not survive a URL", () => {
    for (const slug of ["Có Dấu", "with space", "UPPER", "trailing-", "double--dash", ""]) {
      expect(agentEventBodySchema.safeParse({ ...minimal, slug }).success).toBe(false);
    }
    expect(agentEventBodySchema.safeParse({ ...minimal, slug: "thg-x-amazon-2026" }).success).toBe(
      true,
    );
  });

  test("pins event_date to the ISO form the column sorts on", () => {
    // The column is TEXT and every consumer compares these as strings, so a
    // "01/09/2026" would sort and filter wrongly rather than fail loudly.
    for (const date of ["01/09/2026", "2026-9-1", "Sep 1 2026", "2026-09-01T00:00:00Z"]) {
      expect(agentEventBodySchema.safeParse({ ...minimal, event_date: date }).success).toBe(false);
    }
    expect(agentEventBodySchema.safeParse(minimal).success).toBe(true);
  });

  test("rejects a non-URL in any link field", () => {
    for (const field of ["url", "video_url", "cover_url"] as const) {
      expect(agentEventBodySchema.safeParse({ ...minimal, [field]: "not-a-url" }).success).toBe(
        false,
      );
      expect(
        agentEventBodySchema.safeParse({ ...minimal, [field]: "https://youtu.be/q7NiFssAaRE" })
          .success,
      ).toBe(true);
    }
  });

  test("accepts the full body a writer agent produces", () => {
    const parsed = agentEventBodySchema.parse({
      ...minimal,
      locale: "vi",
      summary: "Câu chuyện hợp tác cùng ONPOINT.",
      body_md: "## THG x ONPOINT\n\nNội dung…",
      end_date: "2026-09-02",
      location: "TP. Hồ Chí Minh",
      role: "Sự kiện đối tác",
      url: "https://www.facebook.com/share/p/1Spw5uMYPT/",
      video_url: "https://youtu.be/q7NiFssAaRE",
      cover_url: "https://cdn.example.com/cover.jpg",
      seo_title: "THG x ONPOINT | THG Fulfill",
      seo_description: "Sự kiện hợp tác giữa THG Fulfill và ONPOINT.",
      agent: "marketing-writer-v1",
    });
    expect(parsed.agent).toBe("marketing-writer-v1");
    expect(parsed.role).toBe("Sự kiện đối tác");
  });
});
