import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const MAX_ATTEMPTS = 5;

function normalizeBatchSize(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(parsed), MAX_BATCH_SIZE);
}

function eventRules(program) {
  const rules = program?.earning_policy?.event_rules;
  return Array.isArray(rules) ? rules.filter((rule) => rule?.enabled !== false) : [];
}

function programEffectiveAt(program) {
  const candidates = [program?.starts_at, program?.created_at]
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));
  return candidates.length
    ? new Date(Math.max(...candidates.map((value) => value.getTime())))
    : new Date(0);
}

function eventTypesForPrograms(programs) {
  return [
    ...new Set(
      programs.flatMap((program) =>
        eventRules(program)
          .map((rule) => String(rule?.event_type || "").trim())
          .filter(Boolean)
      )
    ),
  ];
}

function earliestEffectiveAt(programs) {
  const dates = programs.map(programEffectiveAt);
  return new Date(Math.min(...dates.map((value) => value.getTime()))).toISOString();
}

async function saveDelivery({ event, result, error, previous }) {
  const status = error ? "FAILED" : result?.awarded ? "AWARDED" : "IGNORED";
  const reason = error
    ? "PROCESSING_FAILED"
    : result?.reason || (result?.awarded ? "AWARDED" : "IGNORED");

  const row = {
    event_id: event.id,
    organization_id: event.organization_id || null,
    party_id: result?.party_id || event.payload?.party_id || event.payload?.customer_party_id || null,
    program_id: result?.program_id || null,
    status,
    reason,
    result: result || {},
    attempt_count: Number(previous?.attempt_count || 0) + 1,
    processed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_error: error ? error.message || String(error) : null,
  };

  const { error: deliveryError } = await supabaseAdmin
    .from("commercial_loyalty_event_deliveries")
    .upsert(row, { onConflict: "event_id" });

  if (deliveryError) throw deliveryError;
  return row;
}

export async function processLoyaltySystemEvents({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const limit = normalizeBatchSize(batchSize);
  const { data: programs, error: programError } = await supabaseAdmin
    .from("commercial_loyalty_programs")
    .select("id,organization_id,starts_at,created_at,earning_policy,status")
    .eq("status", "ACTIVE");

  if (programError) throw programError;

  const byOrganization = new Map();
  for (const program of programs || []) {
    if (!eventRules(program).length) continue;
    const list = byOrganization.get(program.organization_id) || [];
    list.push(program);
    byOrganization.set(program.organization_id, list);
  }

  const summary = {
    success: true,
    organizations: byOrganization.size,
    scanned: 0,
    processed: 0,
    awarded: 0,
    ignored: 0,
    failed: 0,
    results: [],
  };

  for (const [organizationId, organizationPrograms] of byOrganization) {
    const types = eventTypesForPrograms(organizationPrograms);
    if (!types.length) continue;

    const { data: events, error: eventError } = await supabaseAdmin
      .from("system_events")
      .select("id,type,payload,organization_id,created_at")
      .eq("organization_id", organizationId)
      .in("type", types)
      .gte("created_at", earliestEffectiveAt(organizationPrograms))
      .order("created_at", { ascending: true })
      .limit(limit);

    if (eventError) throw eventError;
    if (!(events || []).length) continue;

    summary.scanned += events.length;
    const eventIds = events.map((event) => event.id);
    const { data: deliveries, error: deliveryError } = await supabaseAdmin
      .from("commercial_loyalty_event_deliveries")
      .select("event_id,status,attempt_count")
      .in("event_id", eventIds);

    if (deliveryError) throw deliveryError;
    const deliveryMap = new Map((deliveries || []).map((row) => [row.event_id, row]));

    for (const event of events) {
      const previous = deliveryMap.get(event.id);
      if (previous && previous.status !== "FAILED") continue;
      if (previous && Number(previous.attempt_count || 0) >= MAX_ATTEMPTS) continue;

      try {
        const { data: result, error } = await supabaseAdmin.rpc(
          "commercial_loyalty_process_system_event",
          { p_event_id: event.id, p_actor_id: null }
        );
        if (error) throw error;

        const delivery = await saveDelivery({ event, result, previous });
        summary.processed += 1;
        if (delivery.status === "AWARDED") summary.awarded += 1;
        else summary.ignored += 1;
        summary.results.push({ event_id: event.id, status: delivery.status, reason: delivery.reason });
      } catch (error) {
        const delivery = await saveDelivery({ event, error, previous });
        summary.processed += 1;
        summary.failed += 1;
        summary.results.push({ event_id: event.id, status: delivery.status, error: delivery.last_error });
      }
    }
  }

  summary.success = summary.failed === 0;
  return summary;
}

export default processLoyaltySystemEvents;
