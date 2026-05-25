/**
 * D4.1 smoke test — ONE test only.
 *
 * Purpose: prove the vitest harness boots, resolves the `@/`-alias path,
 * loads a tests/helpers/ utility, and executes a deterministic assertion.
 * That's it.
 *
 * This test does NOT touch Cloudflare workerd, D1, R2, KV, the TanStack
 * Start server entry, or any feature service. Those couplings are deferred
 * to D4.2+ where the strategy (service-layer mock D1 vs.
 * @cloudflare/vitest-pool-workers) is decided separately.
 */

import { describe, expect, it } from "vitest";

import { extractShape } from "./helpers/extractShape";

describe("D4.1 smoke — vitest infra is wired correctly", () => {
  it("extractShape produces a deterministic shape signature for a representative API-style payload", () => {
    const sample = {
      locale: "vi",
      scope: "home",
      faqs: [
        { id: 1, position: 1, question: "Q?", answer: "A." },
        { id: 2, position: 2, question: "Q2?", answer: "A2." },
      ],
    };
    expect(extractShape(sample)).toEqual({
      __type: "object",
      props: {
        faqs: {
          __type: "array",
          elem: {
            __type: "object",
            props: {
              answer: { __type: "primitive", t: "string" },
              id: { __type: "primitive", t: "number" },
              position: { __type: "primitive", t: "number" },
              question: { __type: "primitive", t: "string" },
            },
          },
        },
        locale: { __type: "primitive", t: "string" },
        scope: { __type: "primitive", t: "string" },
      },
    });
  });
});
