import { supabaseClient } from "@/lib/shared/supabase/client";

/**
 * AVANTIQO SYSTEM CONTEXT
 * Organization-based runtime context.
 */

export async function getSystemContextFromDB(organizationId) {
  if (!organizationId) return null;

  const { data: organization, error } =
    await supabaseClient
      .from("organizations")
      .select(`
        id,
        name,
        industry,
        organization_type,
        country,
        default_currency,
        timezone,
        status
      `)
      .eq("id", organizationId)
      .maybeSingle();

  if (error || !organization) {
    console.error("system context error:", error);
    return null;
  }

  return {
    organizationId: organization.id,
    organization_id: organization.id,
    role: "STAFF",
    plan: "enterprise",
    industry: organization.industry || "general",
    country: organization.country || null,
    currency: organization.default_currency || null,
    timezone: organization.timezone || null,
    organization,
  };
}
