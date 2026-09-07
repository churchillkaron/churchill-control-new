function normalizeIndustry(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Normalize an explicitly selected industry.
 *
 * Industry availability is not guessed here. The onboarding UI and
 * provisioning runtime validate the value against governed workspace_templates.
 */
export function detectIndustry(input = {}) {
  return normalizeIndustry(input.industry);
}

/**
 * Build only the neutral organization/owner onboarding contract.
 *
 * Module installation belongs exclusively to the governed workspace template.
 * Commercial plan assignment belongs to billing/subscription authority and is
 * deliberately not inferred from industry here.
 */
export function buildOnboardingCore(input = {}) {
  const industry = detectIndustry(input);

  return {
    organization: {
      name: input.name || null,
      organizationType: "client_company",
      industry,
    },
    owner: {
      email: input.ownerEmail || null,
    },
  };
}
