#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const baseUrl = String(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
).replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const outputDir = process.env.CREATIVE_SMOKE_OUTPUT_DIR || "/tmp";

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
    const value = validCurrency(row[field]);
    if (value) return value;
  }
  return nestedCurrency(row);
}

function organizationId(row = {}) {
  return String(
    row.organization_id || row.organisation_id || row.org_id || "",
  ).trim() || null;
}

function rowCurrencies(row = {}) {
  const currencies = new Set();
  for (const field of currencyFields) {
    const value = validCurrency(row[field]);
    if (value) currencies.add(value);
  }
  const nested = nestedCurrency(row);
  if (nested) currencies.add(nested);
  return [...currencies];
}

async function request(resource, options = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${resource}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text || "null");
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, body };
}

async function rows(resource) {
  const result = await request(resource);
  return result.ok && Array.isArray(result.body) ? result.body : [];
}

function timeValue(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function evidenceFor(map, organizationId, currency, source, kind, weight) {
  if (!organizationId || !currency) return;
  const byCurrency = map.get(organizationId) || new Map();
  const item = byCurrency.get(currency) || {
    currency,
    score: 0,
    rows: 0,
    configuration_sources: new Set(),
    operational_sources: new Set(),
    sources: new Set(),
  };
  item.score += weight;
  item.rows += 1;
  item.sources.add(source);
  item[`${kind}_sources`].add(source);
  byCurrency.set(currency, item);
  map.set(organizationId, byCurrency);
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

function inferCurrency(evidence, organizationId) {
  const values = [...(evidence.get(organizationId)?.values() || [])]
    .map(serializeEvidence)
    .sort(
      (a, b) =>
        b.configuration_sources.length - a.configuration_sources.length ||
        b.score - a.score ||
        b.rows - a.rows ||
        a.currency.localeCompare(b.currency),
    );

  const configured = values.filter(
    (value) => value.configuration_sources.length > 0,
  );

  if (configured.length === 1) {
    return {
      currency: configured[0].currency,
      confidence: "CONFIGURATION_EVIDENCE",
      reason: "ONE_CONFIGURED_CURRENCY",
      evidence: values,
    };
  }
  if (configured.length > 1) {
    return {
      currency: null,
      confidence: "CONFLICT",
      reason: "MULTIPLE_CONFIGURED_CURRENCIES",
      evidence: values,
    };
  }
  if (values.length === 1) {
    const strong = values[0].sources.length >= 2 || values[0].rows >= 2;
    return {
      currency: values[0].currency,
      confidence: strong
        ? "CONSISTENT_OPERATIONAL_EVIDENCE"
        : "SINGLE_OPERATIONAL_EVIDENCE",
      reason: "ONE_OPERATIONAL_CURRENCY",
      evidence: values,
    };
  }
  return {
    currency: null,
    confidence: values.length ? "CONFLICT" : "NONE",
    reason: values.length
      ? "MULTIPLE_OPERATIONAL_CURRENCIES"
      : "NO_CURRENCY_EVIDENCE",
    evidence: values,
  };
}

function currencyPatch(organization, currency) {
  for (const field of [
    "default_currency",
    "currency",
    "base_currency",
    "functional_currency",
  ]) {
    if (Object.prototype.hasOwnProperty.call(organization, field)) {
      return { target: field, payload: { [field]: currency } };
    }
  }

  if (Object.prototype.hasOwnProperty.call(organization, "metadata")) {
    return {
      target: "metadata.currency",
      payload: {
        metadata: {
          ...(organization.metadata && typeof organization.metadata === "object"
            ? organization.metadata
            : {}),
          currency,
          currency_configuration_source:
            "EXISTING_ORGANIZATION_DATA_EVIDENCE",
        },
      },
    };
  }

  if (Object.prototype.hasOwnProperty.call(organization, "settings")) {
    return {
      target: "settings.currency",
      payload: {
        settings: {
          ...(organization.settings && typeof organization.settings === "object"
            ? organization.settings
            : {}),
          currency,
          currency_configuration_source:
            "EXISTING_ORGANIZATION_DATA_EVIDENCE",
        },
      },
    };
  }

  return null;
}

(async () => {
  const [organizations, projects, missions, assets] = await Promise.all([
    rows("organizations?select=*&limit=1000"),
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
        evidenceFor(evidence, id, currency, table, kind, weight);
      }
    }
  }

  const ids = new Set([
    ...organizationById.keys(),
    ...activity.keys(),
    ...evidence.keys(),
  ]);

  const candidates = [...ids]
    .map((id) => {
      const organization = organizationById.get(id) || {};
      const configured = organizationCurrency(organization);
      const inference = inferCurrency(evidence, id);
      const creative = activity.get(id) || {
        score: 0,
        projects: 0,
        missions: 0,
        assets: 0,
        latest_activity: 0,
      };
      const eligible = Boolean(configured) || [
        "CONFIGURATION_EVIDENCE",
        "CONSISTENT_OPERATIONAL_EVIDENCE",
      ].includes(inference.confidence);
      return {
        organization_id: id,
        organization_name:
          organization.name ||
          organization.legal_name ||
          organization.display_name ||
          null,
        configured_currency: configured,
        inferred_currency: inference.currency,
        inference_confidence: inference.confidence,
        inference_reason: inference.reason,
        currency_evidence: inference.evidence,
        eligible,
        ...creative,
      };
    })
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        b.score - a.score ||
        b.latest_activity - a.latest_activity ||
        b.assets - a.assets ||
        a.organization_id.localeCompare(b.organization_id),
    );

  const selected =
    candidates.find(
      (candidate) =>
        candidate.eligible &&
        (candidate.projects || candidate.missions || candidate.assets),
    ) || candidates.find((candidate) => candidate.eligible) || null;

  const result = {
    selected,
    candidates,
    inspected: {
      organizations: organizations.length,
      creative_projects: projects.length,
      creative_missions: missions.length,
      creative_assets: assets.length,
      evidence_tables: tableInspection,
    },
    repair: null,
  };

  if (!selected) {
    process.stdout.write(JSON.stringify(result, null, 2));
    return;
  }

  const organization = organizationById.get(selected.organization_id) || {};
  if (selected.configured_currency) {
    selected.currency_source = "existing_organization_configuration";
    result.repair = {
      attempted: false,
      success: true,
      reason: "CURRENCY_ALREADY_CONFIGURED",
    };
    process.stdout.write(JSON.stringify(result, null, 2));
    return;
  }

  const currency = validCurrency(selected.inferred_currency);
  const patch = currencyPatch(organization, currency);
  const backupPath = path.join(
    outputDir,
    `organization-${selected.organization_id}-before-currency-repair.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(organization, null, 2));

  if (!patch) {
    result.repair = {
      attempted: false,
      success: false,
      reason: "NO_SUPPORTED_CURRENCY_CONFIGURATION_FIELD",
      backup_path: backupPath,
    };
    process.stdout.write(JSON.stringify(result, null, 2));
    return;
  }

  const repair = await request(
    `organizations?id=eq.${encodeURIComponent(selected.organization_id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch.payload),
    },
  );

  const repaired =
    repair.ok && Array.isArray(repair.body) ? repair.body[0] || {} : {};
  const verifiedCurrency = organizationCurrency(repaired);

  result.repair = {
    attempted: true,
    success: repair.ok && verifiedCurrency === currency,
    status: repair.status,
    target: patch.target,
    currency,
    backup_path: backupPath,
    response: repair.body,
  };

  if (result.repair.success) {
    selected.configured_currency = verifiedCurrency;
    selected.currency_source = patch.target;
  }

  process.stdout.write(JSON.stringify(result, null, 2));
})().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exit(1);
});
