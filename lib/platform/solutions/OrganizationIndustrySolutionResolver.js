import {
  resolveOrganizationOperationalSolutions,
} from "@/lib/platform/solutions/OrganizationOperationalSolutionRegistry";

const INDUSTRY_CLASSIFICATION_FIELDS = Object.freeze([
  "organization_type",
  "type",
  "industry",
  "industry_code",
  "business_type",
  "business_model",
  "sector",
  "vertical",
  "solution",
  "solution_code",
  "installed_solution",
  "installed_solutions",
  "solutions",
  "capability_packages",
]);

function text(value) {
  return String(value ?? "").trim();
}

function organizationIndustryMetadata(organization = {}) {
  return Object.fromEntries(
    INDUSTRY_CLASSIFICATION_FIELDS
      .filter((field) => organization?.[field] !== undefined)
      .map((field) => [field, organization[field]]),
  );
}

export function resolveOrganizationIndustrySolutions({
  organization,
  organizationId,
} = {}) {
  const activeOrganizationId = text(organizationId);
  if (!activeOrganizationId) return [];

  const loadedOrganizationId = text(organization?.id);
  if (loadedOrganizationId && loadedOrganizationId !== activeOrganizationId) {
    return [];
  }

  return resolveOrganizationOperationalSolutions({
    organization: organizationIndustryMetadata(organization || {}),
    organizationId: activeOrganizationId,
  });
}

export function organizationHasIndustrySolution({
  organization,
  organizationId,
  solutionId,
} = {}) {
  const requestedSolutionId = text(solutionId);
  if (!requestedSolutionId) return false;

  return resolveOrganizationIndustrySolutions({ organization, organizationId })
    .some((solution) => solution.id === requestedSolutionId);
}

export default Object.freeze({
  resolveOrganizationIndustrySolutions,
  organizationHasIndustrySolution,
});
