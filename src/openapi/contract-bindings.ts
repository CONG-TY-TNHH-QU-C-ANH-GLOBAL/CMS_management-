// The canonical schema ↔ registered schema bindings, and the identity assertion over them.
//
// This table used to live inside scripts/check-openapi-drift.ts, which meant that script
// re-imported all ~40 canonical schemas and route configs that src/openapi/paths.ts already
// imports — Sonar counted the two ~40-line import blocks as duplication, and it was right:
// there were two places listing the same wiring. The table lives here now, imported once, and
// the script became a thin runner over it.
//
// This does NOT weaken the check. The whole point is proving that the schema embedded in a
// route config is THE SAME OBJECT (`===`) as the canonical feature export — the failure mode
// being someone redefining a similar-looking Zod shape in paths.ts instead of importing it.
// `response()` and `requestBody()` read the registered schema out of the config exactly as
// before and compare it against a separately-imported canonical export; nothing is derived
// from a single source that could make the comparison trivially true.

import {
  blogCategoriesResponseSchema,
  blogListResponseSchema,
  blogPostResponseSchema,
} from "@/features/blog/blog.schemas";
import {
  applicantCreatedResponseSchema,
  applicantCvUploadedResponseSchema,
  applicantRequestSchema,
  jobResponseSchema,
  jobsResponseSchema,
} from "@/features/careers/careers.schemas";
import {
  communityCategoriesResponseSchema,
  communityQuestionResponseSchema,
  communityQuestionsResponseSchema,
  communityReviewResponseSchema,
  communityReviewsResponseSchema,
  communityQuestionSubmitSchema,
  communityReviewSubmitSchema,
  communitySameIssueResponseSchema,
  communitySubmitResponseSchema,
  communityWithdrawRequestSchema,
  communityWithdrawResponseSchema,
} from "@/features/community/community.schemas";
import {
  contactLocationsResponseSchema,
  faqsResponseSchema,
  integrationsResponseSchema,
  marqueeImagesResponseSchema,
  serviceBlocksResponseSchema,
  servicesResponseSchema,
  sitemapResponseSchema,
  testimonialsResponseSchema,
} from "@/features/content/content.schemas";
import { homepageResponseSchema } from "@/features/homepage/homepage.schemas";
import { translationsResponseSchema } from "@/features/i18n/i18n.schemas";
import { leadRequestBaseSchema } from "@/features/leads/lead-request";
import { leadCreatedResponseSchema } from "@/features/leads/leads.schemas";
import { policiesResponseSchema, policyResponseSchema } from "@/features/policies/policies.schemas";
import {
  pricingResponseSchema,
  pricingTableResponseSchema,
} from "@/features/pricing/pricing.schemas";
import { siteSettingsResponseSchema } from "@/features/settings/settings.schemas";
import {
  shippingRouteResponseSchema,
  shippingRoutesResponseSchema,
} from "@/features/shipping/shipping.schemas";
import {
  applicantCvRouteConfig,
  applicantsRouteConfig,
  blogCategoriesRouteConfig,
  blogListRouteConfig,
  blogPostRouteConfig,
  communityCategoriesRouteConfig,
  communityQuestionRouteConfig,
  communityQuestionsRouteConfig,
  communityQuestionSubmitRouteConfig,
  communityQuestionWithdrawRouteConfig,
  communityReviewRouteConfig,
  communityReviewSubmitRouteConfig,
  communityReviewWithdrawRouteConfig,
  communityReviewsRouteConfig,
  communitySameIssueRouteConfig,
  contactLocationsRouteConfig,
  faqsRouteConfig,
  homepageRouteConfig,
  integrationsRouteConfig,
  jobRouteConfig,
  jobsListRouteConfig,
  leadsRouteConfig,
  marqueeImagesRouteConfig,
  policiesListRouteConfig,
  policyRouteConfig,
  pricingListRouteConfig,
  pricingTableRouteConfig,
  serviceBlocksRouteConfig,
  servicesRouteConfig,
  shippingRouteRouteConfig,
  shippingRoutesListRouteConfig,
  siteSettingsRouteConfig,
  sitemapRouteConfig,
  testimonialsRouteConfig,
  translationsRouteConfig,
} from "./paths";

export interface ContractBinding {
  name: string;
  canonical: unknown;
  registered: unknown;
}

/** A response entry as the route configs declare it. */
interface JsonResponse {
  content: { "application/json": { schema: unknown } };
}

/** The shape `response()` needs. The generic below keeps the STATUS KEYS of the concrete
 *  config, which is what makes an unregistered status a compile error. */
interface ResponseConfig {
  path: string;
  method: string;
  responses: Readonly<Record<number, unknown>>;
}

interface RequestBodyConfig {
  path: string;
  method: string;
  request: { body: { content: { "application/json": { schema: unknown } } } };
}

/** Thrown at module load when a binding names a response the config does not declare. Module
 *  init is the right moment: an unresolvable binding is a build-time authoring mistake, and
 *  failing there stops both the drift script and the test suite with the same diagnostic. */
export class ContractBindingError extends Error {
  constructor(method: string, path: string, status: number, problem: string) {
    super(
      `Contract binding ${method.toUpperCase()} ${path} → ${status}: ${problem}. ` +
        `A binding may only reference a response that the route config in src/openapi/paths.ts ` +
        `actually registers with an application/json schema.`,
    );
    this.name = "ContractBindingError";
  }
}

/**
 * Bind a response schema.
 *
 * TWO layers, deliberately:
 *
 *   1. COMPILE TIME — `status` is `keyof C["responses"] & number`. Because every route config
 *      is declared `as const`, its `responses` object has literal keys, so binding a status
 *      the config never registered does not typecheck. The previous signature used a broad
 *      `Record<number, …>`, which made arbitrary numeric access look safe.
 *   2. RUNTIME — the guard below. Types cannot see through a config that is widened somewhere,
 *      and the failure mode being replaced was a bare `TypeError: Cannot read properties of
 *      undefined` at module init with no indication of WHICH binding was wrong.
 *
 * The registered schema is still READ OUT of the config and never reconstructed, so
 * identity-based drift comparison is unchanged.
 */
export function bindResponse<C extends ResponseConfig>(
  config: C,
  status: keyof C["responses"] & number,
  canonical: unknown,
): ContractBinding {
  const entry = config.responses[status] as JsonResponse | undefined;
  if (entry === undefined) {
    throw new ContractBindingError(config.method, config.path, status, "no such response status");
  }
  const schema = entry.content?.["application/json"]?.schema;
  if (schema === undefined) {
    throw new ContractBindingError(
      config.method,
      config.path,
      status,
      "the response declares no application/json schema",
    );
  }
  return {
    name: `${config.method.toUpperCase()} ${config.path} → ${status}`,
    canonical,
    registered: schema,
  };
}

/** Local alias so the ~45-entry table below reads as data. */
const response = bindResponse;

/** Bind a request body schema. Request bodies drift as silently as responses, and on a write
 *  endpoint the blast radius is a rejected lead rather than a misrendered section. */
function requestBody(config: RequestBodyConfig, canonical: unknown): ContractBinding {
  return {
    name: `${config.method.toUpperCase()} ${config.path} → request body`,
    canonical,
    registered: config.request.body.content["application/json"].schema,
  };
}

export const CONTRACT_BINDINGS: readonly ContractBinding[] = [
  response(faqsRouteConfig, 200, faqsResponseSchema),
  response(testimonialsRouteConfig, 200, testimonialsResponseSchema),
  response(contactLocationsRouteConfig, 200, contactLocationsResponseSchema),
  response(integrationsRouteConfig, 200, integrationsResponseSchema),
  response(translationsRouteConfig, 200, translationsResponseSchema),
  response(blogListRouteConfig, 200, blogListResponseSchema),
  response(blogPostRouteConfig, 200, blogPostResponseSchema),
  response(marqueeImagesRouteConfig, 200, marqueeImagesResponseSchema),
  response(jobsListRouteConfig, 200, jobsResponseSchema),
  response(jobRouteConfig, 200, jobResponseSchema),
  response(servicesRouteConfig, 200, servicesResponseSchema),
  response(homepageRouteConfig, 200, homepageResponseSchema),
  response(siteSettingsRouteConfig, 200, siteSettingsResponseSchema),
  response(pricingListRouteConfig, 200, pricingResponseSchema),
  response(pricingTableRouteConfig, 200, pricingTableResponseSchema),
  response(policiesListRouteConfig, 200, policiesResponseSchema),
  response(policyRouteConfig, 200, policyResponseSchema),
  response(communityQuestionsRouteConfig, 200, communityQuestionsResponseSchema),
  response(communityQuestionRouteConfig, 200, communityQuestionResponseSchema),
  response(communityCategoriesRouteConfig, 200, communityCategoriesResponseSchema),
  response(communityReviewsRouteConfig, 200, communityReviewsResponseSchema),
  response(communityReviewRouteConfig, 200, communityReviewResponseSchema),
  response(serviceBlocksRouteConfig, 200, serviceBlocksResponseSchema),
  response(blogCategoriesRouteConfig, 200, blogCategoriesResponseSchema),
  response(shippingRoutesListRouteConfig, 200, shippingRoutesResponseSchema),
  response(shippingRouteRouteConfig, 200, shippingRouteResponseSchema),
  response(sitemapRouteConfig, 200, sitemapResponseSchema),
  requestBody(leadsRouteConfig, leadRequestBaseSchema),
  response(leadsRouteConfig, 201, leadCreatedResponseSchema),
  requestBody(applicantsRouteConfig, applicantRequestSchema),
  response(applicantsRouteConfig, 200, applicantCreatedResponseSchema),
  response(applicantCvRouteConfig, 200, applicantCvUploadedResponseSchema),
  response(communitySameIssueRouteConfig, 200, communitySameIssueResponseSchema),
  requestBody(communityQuestionWithdrawRouteConfig, communityWithdrawRequestSchema),
  response(communityQuestionWithdrawRouteConfig, 200, communityWithdrawResponseSchema),
  requestBody(communityReviewWithdrawRouteConfig, communityWithdrawRequestSchema),
  response(communityReviewWithdrawRouteConfig, 200, communityWithdrawResponseSchema),
  requestBody(communityQuestionSubmitRouteConfig, communityQuestionSubmitSchema),
  response(communityQuestionSubmitRouteConfig, 201, communitySubmitResponseSchema),
  requestBody(communityReviewSubmitRouteConfig, communityReviewSubmitSchema),
  response(communityReviewSubmitRouteConfig, 201, communitySubmitResponseSchema),
];

export type ContractCheckFailure =
  | { kind: "empty-binding-set"; message: string }
  | { kind: "schema-drift"; message: string };

/**
 * The ONE contract-binding gate. Both `scripts/check-openapi-drift.ts` and
 * `src/openapi/public-surface.test.ts` call this, so the rules cannot diverge between the CLI
 * and the suite — which is exactly how the empty-set hole existed: the non-empty assertion
 * lived only in the test, while CI also runs the script on its own.
 *
 * Two rules:
 *
 *   1. FAIL CLOSED ON AN EMPTY TABLE. A gate that validates zero bindings and reports success
 *      is worse than no gate: it makes a green check mean nothing. If the table is ever
 *      emptied — by a bad merge, a refactor, or a conditional import — this says so.
 *   2. Every registered schema must be the SAME OBJECT as the canonical feature export.
 */
export function checkContractBindings(
  bindings: readonly ContractBinding[] = CONTRACT_BINDINGS,
): ContractCheckFailure[] {
  if (bindings.length === 0) {
    return [
      {
        kind: "empty-binding-set",
        message:
          "No contract bindings to check. A contract gate that validates zero bindings must " +
          "fail closed — a green result here would prove nothing about the public API.",
      },
    ];
  }

  return bindings
    .filter((b) => b.canonical !== b.registered)
    .map((b) => ({
      kind: "schema-drift" as const,
      message:
        `${b.name}: OpenAPI registration is NOT the canonical schema. Someone likely redefined ` +
        `a similar Zod shape in src/openapi/paths.ts instead of importing from ` +
        `features/<feature>/<feature>.schemas. Fix: replace the inline schema with the ` +
        `canonical import.`,
    }));
}
