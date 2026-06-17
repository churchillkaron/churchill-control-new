import { getServiceSupabase }
from "@/lib/shared/supabase/service";

import { buildDefaultBusinessProfile }
from "@/lib/ai/profiles/buildDefaultBusinessProfile";

import { resolveTenantIndustries }
from "@/lib/ai/profiles/resolveTenantIndustries";

function uniqueMerge(
  items = []
) {

  return [
    ...new Set(
      items.filter(Boolean)
    ),
  ];

}

function mergeProfiles(
  profiles = [],
  industries = []
) {

  return {

    industries,

    business_types:
      uniqueMerge(
        profiles.flatMap(
          profile =>
            profile.business_types || []
        )
      ),

    revenue_drivers:
      uniqueMerge(
        profiles.flatMap(
          profile =>
            profile.revenue_drivers || []
        )
      ),

    customer_motivations:
      uniqueMerge(
        profiles.flatMap(
          profile =>
            profile.customer_motivations || []
        )
      ),

    operational_focus:
      uniqueMerge(
        profiles.flatMap(
          profile =>
            profile.operational_focus || []
        )
      ),

    marketing_angles:
      uniqueMerge(
        profiles.flatMap(
          profile =>
            profile.marketing_angles || []
        )
      ),

    physical_assets: [],

    products: [],

    services: [],

    ai_priorities: [],

    source:
      "default_industry_runtime",

    generated_at:
      new Date()
        .toISOString(),

  };

}

export async function getOrCreateBusinessProfile({
  tenantId,
}) {

  if (!tenantId) {
    throw new Error(
      "tenantId required"
    );
  }

  const supabase =
    getServiceSupabase();

  const {
    data: existing,
    error: existingError,
  } = await supabase

    .from(
      "ai_business_profiles"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .maybeSingle();

  if (existingError) {

    console.error(
      "AI BUSINESS PROFILE LOAD ERROR",
      existingError
    );

    throw existingError;

  }

  if (existing?.profile) {

    return existing.profile;

  }

  const industries =
    await resolveTenantIndustries({
      tenantId,
    });

  const defaultProfiles =
    industries.map(
      industryId =>
        buildDefaultBusinessProfile(
          industryId
        )
    );

  const profile =
    mergeProfiles(
      defaultProfiles,
      industries
    );

  const {
    error: insertError,
  } = await supabase

    .from(
      "ai_business_profiles"
    )

    .insert({

      tenant_id:
        tenantId,

      profile,

      updated_at:
        new Date()
          .toISOString(),

    });

  if (insertError) {

    console.error(
      "AI BUSINESS PROFILE CREATE ERROR",
      insertError
    );

    throw insertError;

  }

  return profile;

}
