import {
  getServiceSupabase,
} from "@/lib/shared/supabase/service";

import {
  buildDefaultBusinessProfile,
} from "@/lib/ai/profiles/buildDefaultBusinessProfile";
import {
  resolveOrganizationIndustries,
} from "@/lib/ai/profiles/resolveOrganizationIndustries";

function uniqueMerge(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function mergeProfiles(profiles = [], industries = []) {
  return {
    industries,
    business_types: uniqueMerge(
      profiles.flatMap((profile) => profile.business_types || []),
    ),
    revenue_drivers: uniqueMerge(
      profiles.flatMap((profile) => profile.revenue_drivers || []),
    ),
    customer_motivations: uniqueMerge(
      profiles.flatMap((profile) => profile.customer_motivations || []),
    ),
    operational_focus: uniqueMerge(
      profiles.flatMap((profile) => profile.operational_focus || []),
    ),
    marketing_angles: uniqueMerge(
      profiles.flatMap((profile) => profile.marketing_angles || []),
    ),
    physical_assets: [],
    products: [],
    services: [],
    ai_priorities: [],
    source: "default_industry_runtime",
    generated_at: new Date().toISOString(),
  };
}

export async function getOrCreateBusinessProfile({
  organizationId,
} = {}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const supabase = getServiceSupabase();
  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("ai_business_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existingError) {
    console.error("AI BUSINESS PROFILE LOAD ERROR", existingError);
    throw existingError;
  }

  if (existing?.profile) return existing.profile;

  const industries = await resolveOrganizationIndustries({
    organizationId,
  });
  const defaultProfiles = industries.map((industryId) =>
    buildDefaultBusinessProfile(industryId));
  const profile = mergeProfiles(defaultProfiles, industries);

  const {
    error: upsertError,
  } = await supabase
    .from("ai_business_profiles")
    .upsert({
      organization_id: organizationId,
      profile,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "organization_id",
    });

  if (upsertError) {
    console.error("AI BUSINESS PROFILE CREATE ERROR", upsertError);
    throw upsertError;
  }

  return profile;
}
