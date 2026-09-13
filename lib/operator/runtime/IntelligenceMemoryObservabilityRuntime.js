import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { intelligenceMemoryTemperature } from "./IntelligenceMemoryTemperaturePolicy.js";
import { OPERATOR_OBSERVABILITY_SOURCES } from "./IntelligenceMemoryGovernorPolicy.js";

const CONTRACT = "AVANTIQO_INTELLIGENCE_MEMORY_OBSERVABILITY_V1";

function text(value, limit = 160) {
  return String(value ?? "").trim().slice(0, limit);
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

async function exactCount(query) {
  const result = await query.select("id", { count: "exact", head: true });
  if (result.error) throw result.error;
  return Number(result.count || 0);
}

export async function readIntelligenceMemoryObservability({ organizationId } = {}) {
  const organization = text(organizationId, 120);
  if (!organization) throw new Error("INTELLIGENCE_MEMORY_ORGANIZATION_REQUIRED");

  const base = () => supabaseAdmin.from("intelligence_memories").eq("organization_id", organization);
  const [activeTotal, archivedTotal, operatorActiveTotal, operatorArchivedTotal] = await Promise.all([
    exactCount(base().eq("active", true)),
    exactCount(base().eq("active", false)),
    exactCount(base().eq("active", true).in("source", OPERATOR_OBSERVABILITY_SOURCES)),
    exactCount(base().eq("active", false).in("source", OPERATOR_OBSERVABILITY_SOURCES)),
  ]);
  const activeRows = await base()
    .select("memory_type,importance,source,recall_count,metadata,updated_at,created_at")
    .eq("active", true)
    .in("source", OPERATOR_OBSERVABILITY_SOURCES)
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (activeRows.error) throw activeRows.error;

  const temperature = { HOT: 0, WARM: 0, COLD: 0 };
  const byType = {};
  let recallCount = 0;
  let sampledMetadataBytes = 0;
  for (const row of rows(activeRows.data)) {
    const bucket = intelligenceMemoryTemperature(row);
    temperature[bucket] = Number(temperature[bucket] || 0) + 1;
    const type = text(row.memory_type, 80) || "unknown";
    byType[type] = Number(byType[type] || 0) + 1;
    recallCount += Math.max(0, Number(row.recall_count || 0));
    sampledMetadataBytes += Buffer.byteLength(JSON.stringify(row.metadata || {}), "utf8");
  }

  return {
    contract: CONTRACT,
    organization_id: organization,
    memory: {
      active_total: activeTotal,
      archived_total: archivedTotal,
      operator_active_total: operatorActiveTotal,
      operator_archived_total: operatorArchivedTotal,
      sampled_operator_active: rows(activeRows.data).length,
      sample_capped: operatorActiveTotal > rows(activeRows.data).length,
      temperature,
      by_type: byType,
      recall_count: recallCount,
      sampled_metadata_bytes: sampledMetadataBytes,
      average_metadata_bytes: rows(activeRows.data).length ? Math.round(sampledMetadataBytes / rows(activeRows.data).length) : 0,
    },
    privacy: {
      raw_memory_content_returned: false,
      raw_reasoning_returned: false,
    },
  };
}

export const IntelligenceMemoryObservabilityRuntime = Object.freeze({
  contract: CONTRACT,
  read: readIntelligenceMemoryObservability,
});
