import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TAX_TYPES = new Set(["VAT", "WITHHOLDING", "OTHER"]);

function requireOrganizationId(organizationId) {
  if (!organizationId) throw new Error("organizationId required");
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("Tax rate must be zero or greater");
  }
  return rate;
}

function inferTaxType(values = {}, taxCode, taxName) {
  const explicit = clean(values.tax_type ?? values.type).toUpperCase();
  if (explicit) {
    if (!TAX_TYPES.has(explicit)) throw new Error("Tax Type is not supported");
    return explicit;
  }

  if (taxCode.includes("VAT") || taxName.toUpperCase().includes("VAT")) return "VAT";
  if (taxCode.startsWith("WHT") || taxName.toUpperCase().includes("WITHHOLD")) return "WITHHOLDING";
  return "OTHER";
}

function normalizeRule(values = {}) {
  const taxCode = clean(values.code ?? values.tax_code).toUpperCase();
  const taxName = clean(values.name ?? values.tax_name);
  const taxRegime = clean(values.regime ?? values.tax_regime).toUpperCase();
  const accountingStandard = clean(values.standard ?? values.accounting_standard).toUpperCase();
  const effectiveFrom = values.effective_from || null;
  const effectiveTo = values.effective_to || null;

  if (!taxCode) throw new Error("Tax code required");
  if (!taxName) throw new Error("Tax name required");
  if (!taxRegime) throw new Error("Tax regime required");
  if (!accountingStandard) throw new Error("Accounting standard required");
  if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom) {
    throw new Error("Effective To cannot be before Effective From");
  }

  return {
    tax_code: taxCode,
    tax_name: taxName,
    tax_type: inferTaxType(values, taxCode, taxName),
    tax_rate: normalizeRate(values.rate ?? values.tax_rate),
    tax_regime: taxRegime,
    accounting_standard: accountingStandard,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    is_active: values.is_active ?? true,
  };
}

async function getTaxCode({ organizationId, taxCodeId }) {
  requireOrganizationId(organizationId);
  if (!taxCodeId) throw new Error("taxCodeId required");

  const { data, error } = await supabaseAdmin
    .from("tax_rules")
    .select("*")
    .eq("id", taxCodeId)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .maybeSingle();

  if (error) throw error;

  return data
    ? {
        ...data,
        inherited: !data.organization_id,
        read_only: !data.organization_id,
      }
    : null;
}

export const TaxCodeRepository = {
  async list({ organizationId }) {
    requireOrganizationId(organizationId);

    const { data, error } = await supabaseAdmin
      .from("tax_rules")
      .select("*")
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .order("tax_name", { ascending: true });

    if (error) throw error;

    const organizationRules = new Map();
    const globalRules = [];

    for (const row of data || []) {
      const key = [
        clean(row.tax_regime).toUpperCase(),
        clean(row.accounting_standard).toUpperCase(),
        clean(row.tax_code).toUpperCase(),
        row.effective_from || "",
      ].join("|");

      if (row.organization_id) {
        organizationRules.set(key, row);
      } else {
        globalRules.push({ ...row, inherited: true, read_only: true });
      }
    }

    return [
      ...organizationRules.values(),
      ...globalRules.filter((row) => {
        const key = [
          clean(row.tax_regime).toUpperCase(),
          clean(row.accounting_standard).toUpperCase(),
          clean(row.tax_code).toUpperCase(),
          row.effective_from || "",
        ].join("|");
        return !organizationRules.has(key);
      }),
    ];
  },

  get: getTaxCode,

  async upsert({ organizationId, values }) {
    requireOrganizationId(organizationId);

    const normalized = normalizeRule(values);
    let id = values.id || null;

    if (id) {
      const existing = await getTaxCode({ organizationId, taxCodeId: id });
      if (!existing) throw new Error("Tax code not found");
      if (!existing.organization_id) id = null;
    }

    const record = {
      ...(id ? { id } : {}),
      organization_id: organizationId,
      ...normalized,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("tax_rules")
      .upsert(record)
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
