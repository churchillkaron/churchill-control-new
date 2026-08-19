import { supabaseClient } from "@/lib/shared/supabase/client";
import { resolveOrganizationTimeContext } from "@/lib/shared/time/organizationTime";

/**
 * AVANTIQO SYSTEM CONTEXT
 * Organization-based runtime context.
 */

export async function getSystemContextFromDB(organizationId) {
  if (!organizationId) return null;

  const [organizationResult, timeContext] = await Promise.all([
    supabaseClient
      .from("organizations")
      .select(`
        id,
        name,
        industry,
        organization_type,
        country,
        status
      `)
      .eq("id", organizationId)
      .maybeSingle(),
    resolveOrganizationTimeContext({ organizationId }),
  ]);

  const { data: organization, error } = organizationResult;

  if (error || !organization) {
    console.error("system context error:", error);
    return null;
  }

  const normalizedOrganization = {
    ...organization,
    default_currency: timeContext?.currency || null,
    timezone: timeContext?.timezone || null,
  };

  return {
    organizationId: organization.id,
    organization_id: organization.id,
    role: "STAFF",
    plan: "enterprise",
    industry: organization.industry || "general",
    country: organization.country || null,
    currency: timeContext?.currency || null,
    timezone: timeContext?.timezone || null,
    organization: normalizedOrganization,
  };
}
