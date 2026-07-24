#!/usr/bin/env node

const baseUrl = String(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
).replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!baseUrl || !key) {
  throw new Error("Supabase URL and service-role key are required");
}

const evidenceTables = [
  ["accounting_settings", "configuration", 1000],
  ["finance_settings", "configuration", 1000],
  ["organization_profiles", "configuration", 900],
  ["legal_entities", "configuration", 900],
  ["bank_accounts", "operational", 300],
  ["journal_entries", "operational", 260],
  ["general_ledger", "operational", 250],
  ["customer_invoices", "operational", 220],
  ["vendor_invoices", "operational", 220],
  ["vendor_bills", "operational", 220],
  ["supplier_invoices", "operational", 220],
  ["customer_payments", "operational", 180],
  ["vendor_payments", "operational", 180],
  ["purchase_orders", "operational", 160],
  ["sales_orders", "operational", 160],
  ["billing_invoices", "operational", 140],
  ["organization_wallets", "operational", 120],
  ["wallets", "operational", 120],
  ["platform_wallets", "operational", 120],
];

const currencyFields = [
  "default_currency",
  "base_currency",
  "functional_currency",
  "currency",
  "currency_code",
  "ledger_currency",
  "accounting_currency",
  "transaction_currency",
  "document_currency",
  "settlement_currency",
];

function validCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function nestedCurrency(row = {}) {
  return validCurrency(
    row.metadata?.currency ||
      row.metadata?.default_currency ||
      row.metadata?.base_currency ||
      row.settings?.currency ||
      row.settings?.default_currency ||
      row.settings?.base_currency,
  );
}

function organizationCurrency(row = {}) {
  for (const field of [
    "default_currency",
    "currency",
    "base_currency",
    "functional_currency",
  ]) {
    const currency = validCurrency(row[field]);
    if (currency) return currency;
  }
  return nestedCurrency(row);
}

function organizationId(row = {}) {
  return (
    String(
      row.organization_id || row.organisation_id || row.org_id || "",
    ).trim() || null
  );
}

function rowCurrencies(row = {}) {
  const currencies = new Set();
  for (const field of currencyFields) {
    const currency = validCurrency(row[field]);
    if (currency) currencies.add(currency);
  }
  const nested = nestedCurrency(row);
  if (nested) currencies.add(nested);
  return [...currencies];
}

async function request(resource) {
  const response = await fetch(`${baseUrl}/rest/v1/${resource}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text || "null");
  } catch {
    body = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function rows(resource) {
  const result = await request(resource);
  return result.ok && Array.isArray(result.body) ? result.body : [];
}

function timeValue(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function addEvidence(map, id, currency, source, kind, weight) {
  if (!id || !currency) return;
  const byCurrency = map.get(id) || new Map();
  const current = byCurrency.get(currency) || {
    currency,
    score: 0,
    rows: 0,
    configuration_sources: new Set(),
    operational_sources: new Set(),
    sources: new Set(),
  };
  current.score += weight;
  current.rows += 1;
  current.sources.add(source);
  current[`${kind}_sources`].add(source);
  byCurrency.set(currency, current);
  map.set(id, byCurrency);
}

function serializeEvidence(item) {
  return {
    currency: item.currency,
    score: item.score,
    rows: item.rows,
    configuration_sources: [...item.configuration_sources].sort(),
    operational_sources: [...item.operational_sources].sort(),
    sources: [...item.sources].sort(),
  };
}

function summarizeEvidence(evidence, id) {
  return [...(evidence.get(id)?.values() || [])]
    .map(serializeEvidence)
    .sort(
      (left, right) =>
        right.configuration_sources.length -
          left.configuration_sources.length ||
        right.score - left.score ||
        right.rows - left.rows ||
        left.currency.localeCompare(right.currency),
    );
}

function legalEntityCurrency(entities = []) {
  const currencies = [
    ...new Set(entities.map((row) => validCurrency(row.currency)).filter(Boolean)),
  ];
  return {
    currency: currencies.length === 1 ? currencies[0] : null,
    currencies,
    conflict: currencies.length > 1,
  };
}

(async () => {
  const [organizations, legalEntities, projects, missions, assets] =
    await Promise.all([
      rows("organizations?select=*&limit=1000"),
      rows(
        "legal_entities?select=organization_id,currency&not.organization_id=is.null&limit=5000",
      ),
      rows(
        "creative_projects?select=organization_id,created_at&not.organization_id=is.null&order=created_at.desc&limit=2000",
      ),
      rows(
        "creative_missions?select=organization_id,created_at&not.organization_id=is.null&order=created_at.desc&limit=2000",
      ),
      rows(
        "creative_assets?select=organization_id,created_at&not.organization_id=is.null&order=created_at.desc&limit=5000",
      ),
    ]);

  const organizationById = new Map(
    organizations
      .map((row) => [String(row.id || "").trim(), row])
      .filter(([id]) => id),
  );

  const entitiesByOrganization = new Map();
  for (const entity of legalEntities) {
    const id = organizationId(entity);
    if (!id) continue;
    const list = entitiesByOrganization.get(id) || [];
    list.push(entity);
    entitiesByOrganization.set(id, list);
  }

  const activity = new Map();
  function addActivity(records, type, baseScore) {
    records.forEach((row, index) => {
      const id = organizationId(row);
      if (!id) return;
      const current = activity.get(id) || {
        score: 0,
        projects: 0,
        missions: 0,
        assets: 0,
        latest_activity: 0,
      };
      current.score += Math.max(1, baseScore - index);
      current[type] += 1;
      current.latest_activity = Math.max(
        current.latest_activity,
        timeValue(row.created_at),
      );
      activity.set(id, current);
    });
  }
  addActivity(projects, "projects", 100000);
  addActivity(missions, "missions", 50000);
  addActivity(assets, "assets", 10000);

  const evidence = new Map();
  const tableInspection = [];
  for (const [table, kind, weight] of evidenceTables) {
    const records = await rows(`${table}?select=*&limit=5000`);
    tableInspection.push({ table, rows: records.length });
    for (const row of records) {
      const id = organizationId(row);
      for (const currency of rowCurrencies(row)) {
        addEvidence(evidence, id, currency, table, kind, weight);
      }
    }
  }

  const ids = new Set([
    ...organizationById.keys(),
    ...entitiesByOrganization.keys(),
    ...activity.keys(),
    ...evidence.keys(),
  ]);

  const candidates = [...ids]
    .map((id) => {
      const organization = organizationById.get(id) || {};
      const organizationConfiguredCurrency = organizationCurrency(organization);
      const entityResolution = legalEntityCurrency(
        entitiesByOrganization.get(id) || [],
      );
      const currencyEvidence = summarizeEvidence(evidence, id);
      const creative = activity.get(id) || {
        score: 0,
        projects: 0,
        missions: 0,
        assets: 0,
        latest_activity: 0,
      };
      const configuredCurrency =
        organizationConfiguredCurrency || entityResolution.currency;
      const currencySource = organizationConfiguredCurrency
        ? "organizations"
        : entityResolution.currency
          ? "legal_entities"
          : null;
      const topEvidence = currencyEvidence[0] || {
        score: 0,
        rows: 0,
        sources: [],
      };

      return {
        organization_id: id,
        organization_name:
          organization.name ||
          organization.legal_name ||
          organization.display_name ||
          null,
        configured_currency: configuredCurrency,
        organization_currency: organizationConfiguredCurrency,
        legal_entity_currency: entityResolution.currency,
        legal_entity_currencies: entityResolution.currencies,
        currency_source: currencySource,
        runtime_ready: Boolean(configuredCurrency) && !entityResolution.conflict,
        currency_conflict: entityResolution.conflict,
        evidence_score: topEvidence.score,
        evidence_rows: topEvidence.rows,
        currency_evidence: currencyEvidence,
        ...creative,
      };
    })
    .sort(
      (left, right) =>
        Number(right.runtime_ready) - Number(left.runtime_ready) ||
        right.score - left.score ||
        right.latest_activity - left.latest_activity ||
        right.evidence_score - left.evidence_score ||
        right.evidence_rows - left.evidence_rows ||
        right.assets - left.assets ||
        String(left.organization_name || left.organization_id).localeCompare(
          String(right.organization_name || right.organization_id),
        ),
    );

  const selected =
    candidates.find(
      (candidate) =>
        candidate.runtime_ready &&
        (candidate.projects || candidate.missions || candidate.assets),
    ) || candidates.find((candidate) => candidate.runtime_ready) || null;

  const result = {
    selected,
    candidates,
    inspected: {
      organizations: organizations.length,
      legal_entities: legalEntities.length,
      creative_projects: projects.length,
      creative_missions: missions.length,
      creative_assets: assets.length,
      evidence_tables: tableInspection,
    },
    repair: selected
      ? {
          attempted: false,
          success: true,
          reason:
            selected.currency_source === "organizations"
              ? "RUNTIME_CURRENCY_RESOLVED_FROM_ORGANIZATION"
              : "RUNTIME_CURRENCY_RESOLVED_FROM_LEGAL_ENTITY",
        }
      : {
          attempted: false,
          success: false,
          reason: "NO_RUNTIME_RESOLVABLE_ORGANIZATION_CURRENCY",
        },
  };

  process.stdout.write(JSON.stringify(result, null, 2));
})().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exit(1);
});
