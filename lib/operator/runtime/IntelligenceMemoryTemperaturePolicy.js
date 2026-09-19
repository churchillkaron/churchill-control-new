function text(value, limit = 200) {
  return String(value ?? "").trim().slice(0, limit);
}

function ageDays(row, nowMs = Date.now()) {
  const timestamp = new Date(row?.updated_at || row?.created_at || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - timestamp) / 86400000);
}

export function intelligenceMemoryTemperature(row = {}, nowMs = Date.now()) {
  const type = text(row.memory_type, 80) || "fact";
  const importance = Math.max(0, Math.min(1, Number(row.importance || 0)));
  const age = ageDays(row, nowMs);
  if (["goal", "decision", "constraint"].includes(type) && importance >= 0.65) return "HOT";
  if (importance >= 0.9 || age <= 14) return "HOT";
  if (importance >= 0.6 || age <= 120 || ["preference", "relationship", "lesson"].includes(type)) return "WARM";
  return "COLD";
}

export function operatorMemoryConsolidationDisposition(row = {}, nowMs = Date.now()) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const source = text(row.source, 120);
  const type = text(row.memory_type, 80);
  const durability = text(metadata.durability, 80).toLowerCase();
  const temperature = intelligenceMemoryTemperature(row, nowMs);
  const protectedSource = !["operator_project_state", "explicit_user_statement"].includes(source);
  const protectedDurable = durability === "durable" || ["goal", "decision", "constraint", "preference"].includes(type);
  if (protectedSource || protectedDurable) return { disposition: "KEEP", temperature, reason: "PROTECTED_DURABLE_MEMORY" };
  const age = ageDays(row, nowMs);
  const importance = Math.max(0, Math.min(1, Number(row.importance || 0)));
  const recallCount = Math.max(0, Number(row.recall_count || 0));
  if (temperature === "COLD" && age >= 120 && importance < 0.6 && recallCount <= 1) {
    return { disposition: "ARCHIVE", temperature, reason: "COLD_LOW_VALUE_TRANSIENT" };
  }
  return { disposition: "KEEP", temperature, reason: "ACTIVE_RELEVANT_MEMORY" };
}

export const IntelligenceMemoryTemperaturePolicy = Object.freeze({
  classify: intelligenceMemoryTemperature,
  consolidationDisposition: operatorMemoryConsolidationDisposition,
});
