import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(organizationId) {
  if (!organizationId) throw new Error("organizationId required");
}

function requiredText(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${field} must be a valid date`);
  }
  return normalized;
}

function normalizeValues(values = {}) {
  const rate = Number(values.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error("rate must be between 0 and 100");
  }

  const effectiveFrom = optionalDate(values.effective_from, "effective_from");
  const effectiveTo = optionalDate(values.effective_to, "effective_to");

  if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
    throw new Error("effective_from cannot be after effective_to");
  }

  return {
    id: values.id || undefined,
    tax_code: requiredText(values.code, "code").toUpperCase(),
    tax_name: requiredText(values.name, "name"),
    tax_rate: rate,
    tax_regime: values.regime ? String(values.regime).trim() : null,
    accounting_standard: values.standard
      ? String(values.standard).trim()
      : null,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    is_active: values.is_active ?? true,
  };
}

export const TaxCodeRepository = {
  async list({ organizationId }) {
    requireOrganizationId(organizationId);

    const { data, error } = await supabaseAdmin
      .from("tax_rules")
      .select("*")
      .eq("organization_id", organizationId)
      .order("tax_name", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async get({ organizationId, taxCodeId }) {
    requireOrganizationId(organizationId);
    if (!taxCodeId) throw new Error("taxCodeId required");

    const { data, error } = await supabaseAdmin
      .from("tax_rules")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", taxCodeId)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  },

  async upsert({ organizationId, values }) {
    requireOrganizationId(organizationId);

    const normalized = normalizeValues(values);

    const { data: overlap, error: overlapError } = await supabaseAdmin
      .from("tax_rules")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("tax_code", normalized.tax_code)
      .lte("effective_from", normalized.effective_to || "9999-12-31")
      .or(`effective_to.is.null,effective_to.gte.${normalized.effective_from || "0001-01-01"}`)
      .limit(1);

    if (overlapError) throw overlapError;

    const conflicting = (overlap || []).find(row => row.id !== normalized.id);
    if (conflicting) {
      throw new Error("Tax code effective period overlaps an existing rule");
    }

    const { data, error } = await supabaseAdmin
      .from("tax_rules")
      .upsert({
        ...normalized,
        organization_id: organizationId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

export async function upsertTaxCode({
  organization_id,
  values,
}) {
  return TaxCodeRepository.upsert({
    organizationId: organization_id,
    values,
  });
}
