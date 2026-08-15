import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeRate(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return numeric > 1 ? numeric / 100 : numeric;
}

function normalizeToken(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isEffective(rule, transactionDate) {
  const date = transactionDate.slice(0, 10);

  if (rule.effective_from && rule.effective_from > date) {
    return false;
  }

  if (rule.effective_to && rule.effective_to < date) {
    return false;
  }

  return rule.is_active !== false;
}

function settingsPayload(row) {
  const nested =
    row?.settings && typeof row.settings === "object" ? row.settings : {};

  return {
    ...(row || {}),
    ...nested,
  };
}

function missingColumn(error, column) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42703" ||
    message.includes(`column tax_rules.${column}`) ||
    message.includes(`column \"${column}\" does not exist`)
  );
}

function contextValues(organization = {}, settings = {}, accountingProfile = {}) {
  const values = [
    organization.tax_jurisdiction_id,
    organization.jurisdiction_id,
    organization.tax_jurisdiction,
    organization.jurisdiction,
    organization.country_code,
    organization.country,
    organization.tax_country_code,
    organization.tax_country,
    settings.tax_jurisdiction_id,
    settings.jurisdiction_id,
    settings.tax_jurisdiction,
    settings.jurisdiction,
    settings.country_code,
    settings.country,
    accountingProfile.tax_regime,
  ]
    .map(normalizeToken)
    .filter(Boolean);

  return new Set(values);
}

function ruleScopeValues(rule = {}) {
  return [
    rule.tax_jurisdiction_id,
    rule.jurisdiction_id,
    rule.tax_jurisdiction,
    rule.jurisdiction,
    rule.country_code,
    rule.country,
    rule.tax_country_code,
    rule.tax_country,
    rule.tax_regime,
  ]
    .map(normalizeToken)
    .filter(Boolean);
}

function ruleMatchesContext(rule, organizationId, values) {
  if (rule.organization_id) {
    return String(rule.organization_id) === String(organizationId);
  }

  const scopes = ruleScopeValues(rule);

  if (!scopes.length) {
    return true;
  }

  return scopes.some((scope) => values.has(scope));
}

async function resolveLegalEntity({ organizationId, entityId }) {
  let query = supabaseAdmin
    .from("legal_entities")
    .select("id, organization_id, country, currency, is_default_accounting_entity")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (entityId) {
    const explicitResult = await query.eq("id", entityId).maybeSingle();

    if (explicitResult.error && explicitResult.error.code !== "PGRST116") {
      throw explicitResult.error;
    }

    if (explicitResult.data) {
      return explicitResult.data;
    }
  }

  const defaultResult = await supabaseAdmin
    .from("legal_entities")
    .select("id, organization_id, country, currency, is_default_accounting_entity")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("is_default_accounting_entity", true)
    .limit(1)
    .maybeSingle();

  if (defaultResult.error && defaultResult.error.code !== "PGRST116") {
    throw defaultResult.error;
  }

  if (defaultResult.data) {
    return defaultResult.data;
  }

  const onlyResult = await supabaseAdmin
    .from("legal_entities")
    .select("id, organization_id, country, currency, is_default_accounting_entity")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .limit(2);

  if (onlyResult.error) {
    throw onlyResult.error;
  }

  return onlyResult.data?.length === 1 ? onlyResult.data[0] : null;
}

async function loadAccountingProfile(organizationId) {
  const result = await supabaseAdmin
    .from("organization_accounting_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (result.error && result.error.code !== "PGRST116") {
    throw result.error;
  }

  return result.data || null;
}

async function loadFinanceTaxAssignment({
  organizationId,
  entityId,
  transactionType,
  transactionDate,
}) {
  if (!entityId) {
    return null;
  }

  const date = transactionDate.slice(0, 10);
  const result = await supabaseAdmin
    .from("finance_tax_rule_assignments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("transaction_type", transactionType)
    .eq("status", "ACTIVE")
    .order("is_default", { ascending: false })
    .order("priority", { ascending: false });

  if (result.error) {
    if (result.error.code === "42P01" || result.error.code === "PGRST205") {
      return null;
    }

    throw result.error;
  }

  return (
    (result.data || []).find((assignment) => {
      if (assignment.effective_from && assignment.effective_from > date) {
        return false;
      }

      if (assignment.effective_to && assignment.effective_to < date) {
        return false;
      }

      return true;
    }) || null
  );
}

async function loadTaxRuleById(taxRuleId) {
  if (!taxRuleId) {
    return null;
  }

  const result = await supabaseAdmin
    .from("tax_rules")
    .select("*")
    .eq("id", taxRuleId)
    .maybeSingle();

  if (result.error && result.error.code !== "PGRST116") {
    throw result.error;
  }

  return result.data || null;
}

async function loadLegacyTaxRules({
  organizationId,
  organization,
  settings,
  accountingProfile,
}) {
  const scopedResult = await supabaseAdmin
    .from("tax_rules")
    .select("*")
    .eq("organization_id", organizationId);

  if (!scopedResult.error) {
    return {
      rules: scopedResult.data || [],
      scope: "ORGANIZATION",
      warning: null,
    };
  }

  if (!missingColumn(scopedResult.error, "organization_id")) {
    throw scopedResult.error;
  }

  const legacyResult = await supabaseAdmin
    .from("tax_rules")
    .select("*");

  if (legacyResult.error) {
    throw legacyResult.error;
  }

  const values = contextValues(
    organization,
    settings,
    accountingProfile || {}
  );
  const rules = (legacyResult.data || []).filter((rule) =>
    ruleMatchesContext(rule, organizationId, values)
  );

  return {
    rules,
    scope: values.size ? "JURISDICTION" : "UNRESOLVED",
    warning:
      "Legacy tax_rules schema detected; only explicitly configured POS tax rules are eligible as fallback",
  };
}

export async function resolvePOSFinancialPolicy({
  organizationId,
  entityId = null,
  transactionType = "CUSTOMER_INVOICE",
  transactionDate = new Date().toISOString(),
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const [settingsResult, organizationResult, accountingProfile, legalEntity] =
    await Promise.all([
      supabaseAdmin
        .from("operational_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("domain", "POS")
        .maybeSingle(),
      supabaseAdmin
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
        .maybeSingle(),
      loadAccountingProfile(organizationId),
      resolveLegalEntity({ organizationId, entityId }),
    ]);

  if (settingsResult.error && settingsResult.error.code !== "PGRST116") {
    throw settingsResult.error;
  }

  if (organizationResult.error && organizationResult.error.code !== "PGRST116") {
    throw organizationResult.error;
  }

  const settings = settingsPayload(settingsResult.data);
  const organization = organizationResult.data || { id: organizationId };
  const financeAssignment = await loadFinanceTaxAssignment({
    organizationId,
    entityId: legalEntity?.id || null,
    transactionType,
    transactionDate,
  });
  const financeTaxRule = await loadTaxRuleById(financeAssignment?.tax_rule_id);

  const configuredTaxCode = normalizeToken(
    settings.default_tax_code ||
      settings.tax_code ||
      organization.default_tax_code ||
      organization.tax_code
  );
  const configuredTaxRuleId = String(
    settings.default_tax_rule_id ||
      settings.tax_rule_id ||
      organization.default_tax_rule_id ||
      organization.tax_rule_id ||
      ""
  ).trim();

  let defaultTax = null;
  let resolutionScope = "NONE";
  let warning = null;

  if (financeTaxRule && isEffective(financeTaxRule, transactionDate)) {
    defaultTax = financeTaxRule;
    resolutionScope = "FINANCE_ENTITY_ASSIGNMENT";
  } else if (configuredTaxRuleId || configuredTaxCode) {
    const taxResolution = await loadLegacyTaxRules({
      organizationId,
      organization: {
        ...organization,
        country: organization.country || legalEntity?.country || null,
      },
      settings,
      accountingProfile,
    });
    const effectiveTaxes = (taxResolution.rules || []).filter((rule) =>
      isEffective(rule, transactionDate)
    );

    defaultTax =
      effectiveTaxes.find(
        (rule) => configuredTaxRuleId && String(rule.id) === configuredTaxRuleId
      ) ||
      effectiveTaxes.find(
        (rule) =>
          configuredTaxCode &&
          normalizeToken(rule.tax_code || rule.code) === configuredTaxCode
      ) ||
      null;

    resolutionScope = defaultTax ? taxResolution.scope : "UNRESOLVED";
    warning = taxResolution.warning;
  } else if (accountingProfile?.vat_registered === true) {
    const error = new Error(
      "POS tax configuration required: VAT-registered organization has no active Finance tax assignment"
    );
    error.status = 409;
    throw error;
  }

  const serviceChargeEnabled =
    settings.service_charge_enabled === true ||
    settings.enable_service_charge === true;

  const serviceChargeRate = serviceChargeEnabled
    ? normalizeRate(
        settings.service_charge_rate ??
          settings.service_charge_percent ??
          settings.service_charge_percentage
      )
    : 0;

  return {
    serviceChargeRate,
    taxRate: normalizeRate(defaultTax?.tax_rate ?? defaultTax?.rate),
    taxCodeId: defaultTax?.id || null,
    taxCode: defaultTax?.tax_code || defaultTax?.code || null,
    pricesIncludeTax:
      settings.prices_include_tax === true ||
      settings.tax_inclusive === true ||
      normalizeToken(financeAssignment?.price_mode) === "inclusive",
    entityId: legalEntity?.id || null,
    transactionType,
    taxAssignmentId: financeAssignment?.id || null,
    resolutionScope,
    warning,
  };
}
