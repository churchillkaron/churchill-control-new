import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function code(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanDate(value) {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const error = new Error("qualification date must use YYYY-MM-DD format");
    error.status = 400;
    throw error;
  }
  return normalized;
}

function uniqueCodes(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(code).filter(Boolean))];
}

function activeOn(row, dateValue) {
  if (String(row?.status || "").toLowerCase() !== "active") return false;
  if (row?.valid_from && String(row.valid_from) > dateValue) return false;
  if (row?.valid_until && String(row.valid_until) < dateValue) return false;
  return true;
}

export async function loadQualificationEvidence({
  organizationId,
  staffIds = [],
  requiredCodes = [],
  onDate,
} = {}) {
  const organization_id = text(organizationId);
  if (!organization_id) throw new Error("organizationId required");

  const staff_ids = [...new Set((Array.isArray(staffIds) ? staffIds : []).map(text).filter(Boolean))];
  const codes = uniqueCodes(requiredCodes);
  const dateValue = cleanDate(onDate);

  if (!staff_ids.length || !codes.length) {
    return {
      requiredCodes: codes,
      catalog: [],
      holdings: [],
      evaluations: Object.fromEntries(staff_ids.map((staffId) => [staffId, {
        status: codes.length ? "MISSING" : "NOT_REQUIRED",
        qualified: codes.length ? false : true,
        required_codes: codes,
        held_codes: [],
        missing_codes: codes,
        evidence: [],
      }])),
    };
  }

  const catalogResult = await supabaseAdmin
    .from("people_qualification_catalog")
    .select("id,code,name,status")
    .eq("organization_id", organization_id)
    .eq("status", "active")
    .in("code", codes);
  if (catalogResult.error) throw catalogResult.error;

  const catalog = catalogResult.data || [];
  const qualificationIds = catalog.map((row) => row.id);
  const holdingsResult = qualificationIds.length
    ? await supabaseAdmin
        .from("staff_qualifications")
        .select("id,staff_id,qualification_id,status,valid_from,valid_until,evidence_reference,verified_by,verified_at")
        .eq("organization_id", organization_id)
        .in("staff_id", staff_ids)
        .in("qualification_id", qualificationIds)
    : { data: [], error: null };
  if (holdingsResult.error) throw holdingsResult.error;

  const holdings = holdingsResult.data || [];
  const catalogById = Object.fromEntries(catalog.map((row) => [row.id, row]));
  const knownCodes = new Set(catalog.map((row) => code(row.code)));
  const unknownRequirementCodes = codes.filter((required) => !knownCodes.has(required));

  const evaluations = Object.fromEntries(staff_ids.map((staffId) => {
    const current = holdings
      .filter((row) => row.staff_id === staffId && activeOn(row, dateValue))
      .map((row) => ({
        ...row,
        code: code(catalogById[row.qualification_id]?.code),
        name: catalogById[row.qualification_id]?.name || null,
      }))
      .filter((row) => row.code);

    const heldCodes = [...new Set(current.map((row) => row.code))];
    const missingCodes = codes.filter((required) => !heldCodes.includes(required));

    return [staffId, {
      status: unknownRequirementCodes.length
        ? "REQUIREMENT_NOT_CONFIGURED"
        : missingCodes.length
          ? "MISSING"
          : "QUALIFIED",
      qualified: unknownRequirementCodes.length === 0 && missingCodes.length === 0,
      required_codes: codes,
      held_codes: heldCodes,
      missing_codes: missingCodes,
      unknown_requirement_codes: unknownRequirementCodes,
      evidence: current.map((row) => ({
        qualification_id: row.qualification_id,
        code: row.code,
        name: row.name,
        valid_from: row.valid_from || null,
        valid_until: row.valid_until || null,
        evidence_reference: row.evidence_reference || null,
        verified_at: row.verified_at || null,
      })),
    }];
  }));

  return {
    requiredCodes: codes,
    catalog,
    holdings,
    evaluations,
  };
}

export function requiredQualificationCodesFromService(service = {}) {
  const protocol = service.execution_protocol || service.protocol || {};
  return uniqueCodes(protocol.required_qualification_codes || service.required_qualification_codes || []);
}

export default Object.freeze({
  loadQualificationEvidence,
  requiredQualificationCodesFromService,
});
