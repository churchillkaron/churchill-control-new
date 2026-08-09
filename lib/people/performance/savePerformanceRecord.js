import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") return value;

  const normalized = normalizeText(value);

  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;

  return fallback;
}

function inputError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function resolveTargetStaff({
  organizationId,
  staffId,
  identity,
}) {
  const selection =
    "id,name,email,role,position,department,party_id,active";

  if (staffId) {
    const { data, error } = await supabaseAdmin
      .from("staff_accounts")
      .select(selection)
      .eq("id", staffId)
      .eq("active_organization_id", organizationId)
      .eq("active", true)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw inputError(
        "Staff account not found in this organization",
        404
      );
    }

    return data;
  }

  const normalizedIdentity = normalizeText(identity);

  if (!normalizedIdentity) {
    throw inputError("staffId or staff identity is required");
  }

  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select(selection)
    .eq("active_organization_id", organizationId)
    .eq("active", true);

  if (error) throw error;

  const matches = (data || []).filter((staff) => {
    return [staff.name, staff.email]
      .map(normalizeText)
      .filter(Boolean)
      .includes(normalizedIdentity);
  });

  if (matches.length === 0) {
    throw inputError(
      "Staff account not found in this organization",
      404
    );
  }

  if (matches.length > 1) {
    throw inputError(
      "Staff identity is ambiguous; use staffId",
      409
    );
  }

  return matches[0];
}

export async function savePerformanceRecord({
  organizationId,
  payload = {},
} = {}) {
  if (!organizationId) {
    throw inputError("organizationId required");
  }

  const legacyStaff = cleanText(payload.staff);

  const explicitStaffId = cleanText(
    payload.staffId || payload.staff_id
  );

  const staffId =
    explicitStaffId ||
    (looksLikeUuid(legacyStaff) ? legacyStaff : null);

  if (staffId && !looksLikeUuid(staffId)) {
    throw inputError("Invalid staffId");
  }

  const identity = cleanText(
    payload.staffName ||
      payload.staff_name ||
      payload.name ||
      (!looksLikeUuid(legacyStaff) ? legacyStaff : null)
  );

  const score = Number(payload.score);

  if (!Number.isFinite(score)) {
    throw inputError("A numeric score is required");
  }

  if (score < 0 || score > 100) {
    throw inputError("Score must be between 0 and 100");
  }

  const staff = await resolveTargetStaff({
    organizationId,
    staffId,
    identity,
  });

  const name = cleanText(staff.name || staff.email);

  if (!name) {
    throw inputError("Staff account has no usable display identity", 422);
  }

  const department = cleanText(
    payload.department ||
      staff.department ||
      staff.position ||
      staff.role
  );

  if (!department) {
    throw inputError("Department is required");
  }

  const record = {
    organization_id: organizationId,
    name,
    department,
    score,
    late: booleanValue(payload.late, false),
    absent: booleanValue(payload.absent, false),
  };

  const { data, error } = await supabaseAdmin
    .from("performance")
    .insert(record)
    .select(
      "id,name,department,score,late,absent,created_at,organization_id"
    )
    .single();

  if (error) throw error;

  return {
    performance: data,
    staff: {
      id: staff.id,
      partyId: staff.party_id || null,
      name,
      email: staff.email || null,
    },
  };
}

export default savePerformanceRecord;
