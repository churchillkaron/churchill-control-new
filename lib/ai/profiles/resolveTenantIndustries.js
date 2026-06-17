import { createServerSupabase }
from "@/lib/shared/supabase/server";

export async function resolveTenantIndustries({
  tenantId,
}) {

  const supabase =
    createServerSupabase();

  const {
    data: organizations,
    error: orgError,
  } = await supabase

    .from("organizations")

    .select("id")

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "organization_status",
      "ACTIVE"
    );

  if (orgError) {
    throw orgError;
  }

  const organizationIds =
    (organizations || [])
      .map(org => org.id);

  if (
    organizationIds.length === 0
  ) {

    return [];

  }

  const {
    data: industries,
    error: industryError,
  } = await supabase

    .from(
      "organization_industries"
    )

    .select(
      "industry_id"
    )

    .in(
      "organization_id",
      organizationIds
    )

    .eq(
      "status",
      "ACTIVE"
    );

  if (industryError) {
    throw industryError;
  }

  return [

    ...new Set(

      (industries || [])
        .map(
          row => row.industry_id
        )
        .filter(Boolean)

    ),

  ];

}
