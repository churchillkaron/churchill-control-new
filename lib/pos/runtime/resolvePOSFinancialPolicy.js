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

function contextValues(organization = {}, settings = {}) {
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

async function loadTaxRules({ organizationId, organization, settings }) {
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

  const values = contextValues(organization, settings);
  const rules = (legacyResult.data || []).filter((rule) =>
    ruleMatchesContext(rule, organizationId, values)
  );

  return {
    rules,
    scope: values.size ? "JURISDICTION" : "GLOBAL_REFERENCE",
    warning:
      "tax_rules uses the legacy reference schema; tax was resolved from organization jurisdiction context",
  };
}

export async function resolvePOSFinancialPolicy({
  organizationId,
  transactionDate = new Date().toISOString(),
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const [settingsResult, organizationResult] = await Promise.all([
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
  ]);

  if (settingsResult.error && settingsResult.error.code !== "PGRST116") {
    throw settingsResult.error;
  }

  if (organizationResult.error && organizationResult.error.code !== "PGRST116") {
    throw organizationResult.error;
  }

  const settings = settingsPayload(settingsResult.data);
  const organization = organizationResult.data || { id: organizationId };
  const taxResolution = await loadTaxRules({
    organizationId,
    organization,
    settings,
  });
  const effectiveTaxes = (taxResolution.rules || []).filter((rule) =>
    isEffective(rule, transactionDate)
  );

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

  const defaultTax =
    effectiveTaxes.find(
      (rule) => configuredTaxRuleId && String(rule.id) === configuredTaxRuleId
    ) ||
    effectiveTaxes.find(
      (rule) =>
        configuredTaxCode &&
        normalizeToken(rule.tax_code || rule.code) === configuredTaxCode
    ) ||
    effectiveTaxes.find(
      (rule) =>
        rule.is_default === true ||
        rule.default === true ||
        normalizeToken(rule.applies_to) === "pos" ||
        normalizeToken(rule.tax_regime) === "pos"
    ) ||
    effectiveTaxes[0] ||
    null;

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
      settings.tax_inclusive === true,
    resolutionScope: taxResolution.scope,
    warning: taxResolution.warning,
  };
}
