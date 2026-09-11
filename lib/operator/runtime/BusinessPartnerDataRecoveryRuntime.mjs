const CONTRACT = "AVANTIQO_BUSINESS_PARTNER_DATA_RECOVERY_V1";
const CONTEXT_FIELDS = new Set(["organizationid","organization_id","entityid","entity_id","periodid","period_id","partyid","party_id"]);

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function normalized(value) { return text(value, 240).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function label(field) { return text(field, 240).replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function schemaContract(capability = {}) {
  const schema = object(capability.input_schema);
  const props = object(schema.properties);
  const required = list(schema.required).map((v) => text(v, 240)).filter(Boolean);
  return JSON.stringify({ required, properties: Object.fromEntries(required.map((field) => [field, object(props[field])])) });
}
function missingFields(capability = {}, payload = {}) {
  const schema = object(capability.input_schema);
  return list(schema.required).map((v) => text(v, 240)).filter((field) => {
    if (!field || CONTEXT_FIELDS.has(normalized(field))) return false;
    return !Object.prototype.hasOwnProperty.call(object(payload), field);
  });
}
function validate(value, definition = {}) {
  const schema = object(definition); const type = text(schema.type, 40).toLowerCase();
  if (Array.isArray(schema.enum) && schema.enum.length) {
    const hit = schema.enum.find((candidate) => String(candidate).toLowerCase() === text(value).toLowerCase());
    return hit === undefined ? { ok: false, reason: "ENUM_VALUE_REQUIRED" } : { ok: true, value: hit };
  }
  if (type === "number") { const clean = text(value); const n = Number(clean); return clean && Number.isFinite(n) ? { ok: true, value: n } : { ok: false, reason: "NUMBER_REQUIRED" }; }
  if (type === "integer") { const clean = text(value); return /^-?\d+$/.test(clean) ? { ok: true, value: Number(clean) } : { ok: false, reason: "INTEGER_REQUIRED" }; }
  if (type === "boolean") { const clean = text(value).toLowerCase(); if (["true","yes","y","1"].includes(clean)) return { ok: true, value: true }; if (["false","no","n","0"].includes(clean)) return { ok: true, value: false }; return { ok: false, reason: "BOOLEAN_REQUIRED" }; }
  const clean = text(value); if (!clean) return { ok: false, reason: "VALUE_REQUIRED" };
  if (text(schema.format, 40).toLowerCase() === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(clean)) return { ok: false, reason: "ISO_DATE_REQUIRED" };
  if (text(schema.format, 40).toLowerCase() === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) return { ok: false, reason: "UUID_REQUIRED" };
  return { ok: true, value: clean };
}

export function createBusinessPartnerDataRecoveryState({ recovery = {}, capability = {}, repair = {} } = {}) {
  const key = text(object(recovery).capability?.key, 300); if (!key || key !== text(capability.key, 300)) return null;
  const missing = missingFields(capability, recovery.payload); if (!missing.length) return null;
  const properties = object(capability.input_schema?.properties);
  const fields = missing.map((field) => ({ field, label: label(field), type: text(properties[field]?.type, 40) || "string", format: text(properties[field]?.format, 40) || null, enum: Array.isArray(properties[field]?.enum) ? properties[field].enum.slice(0, 20) : null }));
  const requested = fields.map((item) => item.label).join(", ");
  const baseQuestion = text(repair.question, 800) || `I need ${requested} before I can continue.`;
  const hint = fields.length === 1 ? ` You can reply with just the ${fields[0].label.toLowerCase()} value.` : ` Reply as ${fields.map((item) => `${item.field} = value`).join("; ")}.`;
  return { contract: CONTRACT, status: "AWAITING_REQUIRED_INPUTS", capability_key: key, capability_input_contract: schemaContract(capability), partial_payload: { ...object(recovery.payload) }, missing_required_fields: missing, requested_fields: fields, question: `${baseQuestion}${hint}`.slice(0, 1200), authorization_effect: "NONE", execution_authorized: false, confirmation_granted: false, approval_granted: false };
}

export function applyBusinessPartnerDataRecoveryReply({ state = {}, capability = {}, message = "" } = {}) {
  const current = object(state); const key = text(capability.key, 300);
  if (text(current.contract) !== CONTRACT || current.status !== "AWAITING_REQUIRED_INPUTS" || key !== text(current.capability_key, 300)) return { accepted: false, complete: false, reason: "DATA_RECOVERY_STATE_MISMATCH", state: current };
  if (text(current.capability_input_contract, 16000) !== schemaContract(capability)) return { accepted: false, complete: false, reason: "CAPABILITY_INPUT_SCHEMA_CHANGED", state: current };
  const missing = new Set(list(current.missing_required_fields).map((v) => text(v, 240)).filter(Boolean)); const properties = object(capability.input_schema?.properties); const values = {}; const rejected = [];
  const raw = text(message, 8000); const segments = raw.split(/[;\n]+/).map((v) => v.trim()).filter(Boolean);
  if (missing.size === 1 && segments.length === 1 && !/^[^:=]{1,240}\s*[:=]/.test(segments[0])) {
    const field = [...missing][0]; const parsed = validate(segments[0], properties[field]); if (parsed.ok) values[field] = parsed.value; else rejected.push({ field, reason: parsed.reason });
  } else {
    const aliases = new Map(); for (const item of list(current.requested_fields)) { aliases.set(normalized(item.field), item.field); aliases.set(normalized(item.label), item.field); }
    for (const segment of segments) { const match = segment.match(/^([^:=]{1,240})\s*[:=]\s*(.+)$/); if (!match) { rejected.push({ segment, reason: "EXPLICIT_FIELD_ASSIGNMENT_REQUIRED" }); continue; } const field = aliases.get(normalized(match[1])); if (!field || !missing.has(field)) { rejected.push({ segment, reason: "FIELD_NOT_REQUESTED" }); continue; } const parsed = validate(match[2], properties[field]); if (!parsed.ok) rejected.push({ field, reason: parsed.reason }); else values[field] = parsed.value; }
  }
  const payload = { ...object(current.partial_payload) }; for (const [field, value] of Object.entries(values)) { payload[field] = value; missing.delete(field); }
  const complete = missing.size === 0 && rejected.length === 0;
  return { accepted: Object.keys(values).length > 0 && rejected.length === 0, complete, reason: rejected.length ? "INVALID_OR_UNREQUESTED_INPUT" : null, payload, state: { ...current, status: complete ? "READY_TO_RETRY" : "AWAITING_REQUIRED_INPUTS", partial_payload: payload, missing_required_fields: [...missing], auto_resume_allowed: complete, payload_validated: complete, retry_attempted: false, authorization_effect: "NONE", execution_authorized: false, confirmation_granted: false, approval_granted: false, updated_at: new Date().toISOString() }, rejected_fields: rejected };
}

export const BusinessPartnerDataRecoveryRuntime = Object.freeze({ contract: CONTRACT, create: createBusinessPartnerDataRecoveryState, apply: applyBusinessPartnerDataRecoveryReply });
