import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

import {
  getIndustryRuntime,
} from "@/lib/platform/runtime/getIndustryRuntime";

export async function getOrganizationIndustries({
  organizationId,
}) {

  const supabase =
    createServerSupabase();

  if (!organizationId) {

    return {
      success: false,
      error: "Missing organizationId",
    };

  }

  const {
    data,
    error,
  } = await supabase

    .from(
      "organization_industries"
    )

    .select("*")

    .eq(
      "organization_id",
      organizationId
    )

    .eq(
      "status",
      "ACTIVE"
    );

  if (error) {

    return {
      success: false,
      error: error.message,
    };

  }

  const runtimes =

    (data || [])
      .map(
        item =>
          getIndustryRuntime(
            item.industry_id
          )
      )
      .filter(Boolean);

  return {

    success: true,

    industries:
      data || [],

    runtimes,

  };

}
