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

interface ResponseConfig {
  path: string;
  method: string;
  responses: Record<number, { content: { "application/json": { schema: unknown } } }>;
}

interface RequestBodyConfig {
  path: string;
  method: string;
  request: { body: { content: { "application/json": { schema: unknown } } } };
}

/** Bind a response schema. `status` picks the documented response; the registered value is
 *  READ OUT of the config, never reconstructed — that is what keeps the comparison meaningful. */
function response(config: ResponseConfig, status: number, canonical: unknown): ContractBinding {
  return {
    name: `${config.method.toUpperCase()} ${config.path} → ${status}`,
    canonical,
    registered: config.responses[status].content["application/json"].schema,
  };
}

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

export interface DriftFailure {
  name: string;
}

/** Every binding whose registered schema is not the canonical object. Empty means no drift. */
export function findContractDrift(
  bindings: readonly ContractBinding[] = CONTRACT_BINDINGS,
): DriftFailure[] {
  return bindings.filter((b) => b.canonical !== b.registered).map((b) => ({ name: b.name }));
}
