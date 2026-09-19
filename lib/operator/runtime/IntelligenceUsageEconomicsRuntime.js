import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  assessIntelligenceOperatingHealth,
  summarizeIntelligenceUsage,
} from "./IntelligenceUsageEconomicsPolicy.js";

function text(value, limit = 160) {
  return String(value ?? "").trim().slice(0, limit);
}

export { assessIntelligenceOperatingHealth, summarizeIntelligenceUsage };

export async function readOrganizationIntelligenceEconomics({
  organizationId,
  startAt,
  endAt = null,
} = {}) {
  const organization = text(organizationId, 120);
  if (!organization) throw new Error("INTELLIGENCE_ECONOMICS_ORGANIZATION_REQUIRED");
  if (!startAt) throw new Error("INTELLIGENCE_ECONOMICS_START_REQUIRED");

  let query = supabaseAdmin
    .from("platform_service_usage")
    .select("module,supplier_cost,customer_price,metadata,created_at")
    .eq("organization_id", organization)
    .gte("created_at", startAt)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (endAt) query = query.lt("created_at", endAt);

  const result = await query;
  if (result.error) throw result.error;
  return {
    organization_id: organization,
    start_at: startAt,
    end_at: endAt,
    ...summarizeIntelligenceUsage(result.data),
  };
}

export const IntelligenceUsageEconomicsRuntime = Object.freeze({
  summarize: summarizeIntelligenceUsage,
  assess: assessIntelligenceOperatingHealth,
  read: readOrganizationIntelligenceEconomics,
});
