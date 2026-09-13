import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 160) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

export function summarizeIntelligenceUsage(rows = []) {
  const summary = { calls: 0, fast_calls: 0, deep_calls: 0, input_tokens: 0, output_tokens: 0, estimated_context_tokens: 0, supplier_cost: 0, customer_price: 0, average_context_tokens: 0 };
  for (const row of list(rows)) {
    const metadata = object(row.metadata);
    if (text(metadata.module).toUpperCase() !== "INTELLIGENCE" && text(row.module).toUpperCase() !== "INTELLIGENCE") continue;
    summary.calls += 1;
    const lane = text(metadata.intelligence_execution_lane).toLowerCase();
    if (lane === "fast") summary.fast_calls += 1;
    if (lane === "deep") summary.deep_calls += 1;
    const resultUsage = object(object(metadata.result).usage);
    summary.input_tokens += number(metadata.input_tokens ?? resultUsage.input_tokens);
    summary.output_tokens += number(metadata.output_tokens ?? resultUsage.output_tokens);
    summary.estimated_context_tokens += number(object(metadata.intelligence_context_budget).estimated_input_tokens);
    summary.supplier_cost += number(row.supplier_cost);
    summary.customer_price += number(row.customer_price);
  }
  summary.average_context_tokens = summary.calls ? Math.round(summary.estimated_context_tokens / summary.calls) : 0;
  return summary;
}

export async function readOrganizationIntelligenceEconomics({ organizationId, startAt, endAt = null } = {}) {
  const organization = text(organizationId, 120);
  if (!organization) throw new Error("INTELLIGENCE_ECONOMICS_ORGANIZATION_REQUIRED");
  if (!startAt) throw new Error("INTELLIGENCE_ECONOMICS_START_REQUIRED");
  let query = supabaseAdmin.from("platform_service_usage").select("module,supplier_cost,customer_price,metadata,created_at").eq("organization_id", organization).gte("created_at", startAt).order("created_at", { ascending: false }).limit(5000);
  if (endAt) query = query.lt("created_at", endAt);
  const result = await query;
  if (result.error) throw result.error;
  return { organization_id: organization, start_at: startAt, end_at: endAt, ...summarizeIntelligenceUsage(result.data) };
}

export const IntelligenceUsageEconomicsRuntime = Object.freeze({ summarize: summarizeIntelligenceUsage, read: readOrganizationIntelligenceEconomics });
