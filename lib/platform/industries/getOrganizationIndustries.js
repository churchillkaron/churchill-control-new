import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getIndustryRuntime } from "@/lib/platform/runtime/getIndustryRuntime";

export async function getOrganizationIndustries({ organizationId, organization }) {
  const supabase = createServerSupabase();

  if (!organizationId) {
    return { success: false, error: "Missing organizationId" };
  }

  const { data, error } = await supabase
    .from("organization_industries")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE");

  if (organizationId === "33336a72-acb5-474e-856b-8be0269360e2") console.dir(data,{depth:null});

  if (error) {
    return { success: false, error: error.message };
  }

  const runtimes = (data || [])
    .map(item => getIndustryRuntime(item.industry_id, organization))
    .filter(Boolean);

  // Enterprise / platform owner fallback if no industry exists
  if (runtimes.length === 0 && organization) {
    const fallbackRuntime = getIndustryRuntime(null, organization);
    if (fallbackRuntime) runtimes.push(fallbackRuntime);
  }

  return {
    success: true,
    industries: data || [],
    runtimes,
  };
}
