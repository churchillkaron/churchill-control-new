import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function safeLimit(value) {
  return Math.max(1, Math.min(Number(value) || 200, 500));
}

async function loadLines({ organizationId, entityId, quotationIds }) {
  if (!quotationIds.length) return [];

  const result = await supabaseAdmin
    .from("commercial_quotation_lines")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .in("quotation_id", quotationIds)
    .order("line_number", { ascending: true });

  if (result.error) throw result.error;
  return result.data || [];
}

function attachLines(quotations, lines) {
  const linesByQuotation = new Map();

  for (const line of lines) {
    const current = linesByQuotation.get(line.quotation_id) || [];
    current.push(line);
    linesByQuotation.set(line.quotation_id, current);
  }

  return quotations.map((quotation) => ({
    ...quotation,
    items: linesByQuotation.get(quotation.id) || [],
    quotation_lines: linesByQuotation.get(quotation.id) || [],
  }));
}

export async function searchQuotations({
  organizationId,
  entityId,
  status = null,
  limit = 200,
}) {
  let query = supabaseAdmin
    .from("commercial_quotations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(safeLimit(limit));

  if (status) query = query.eq("status", String(status).toUpperCase());

  const result = await query;
  if (result.error) throw result.error;

  const quotations = result.data || [];
  const lines = await loadLines({
    organizationId,
    entityId,
    quotationIds: quotations.map((quotation) => quotation.id),
  });

  return attachLines(quotations, lines);
}

export async function loadQuotation({ organizationId, entityId, quotationId }) {
  const result = await supabaseAdmin
    .from("commercial_quotations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", quotationId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) return null;

  const rows = await loadLines({
    organizationId,
    entityId,
    quotationIds: [quotationId],
  });

  return attachLines([result.data], rows)[0];
}

export default {
  loadQuotation,
  searchQuotations,
};
