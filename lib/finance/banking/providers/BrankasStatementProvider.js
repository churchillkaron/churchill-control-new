import crypto from "node:crypto";

function text(value) { return String(value ?? "").trim(); }
function dateFromProvider(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) return new Date(Number(value.seconds) * 1000).toISOString().slice(0, 10);
  return null;
}
function amount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Math.abs(value);
  if (typeof value === "string") return Math.abs(Number(value) || 0);
  if (typeof value === "object") {
    if (value.decimal && value.decimal.num !== undefined) {
      const places = Number(value.decimal.places || 0); return Math.abs(Number(value.decimal.num || 0) / (10 ** places));
    }
    return Math.abs(Number(value.num || 0));
  }
  return 0;
}
function currency(value) { return text(value?.cur || value?.currency || value?.currency_code).toUpperCase() || null; }
function providerBaseUrl(config = {}) { return text(config.base_url || process.env.BRANKAS_STATEMENT_BASE_URL || "https://statement.sandbox.bnk.to").replace(/\/$/, ""); }

async function request({ secret, path, method = "GET", body, config = {} }) {
  const key = text(secret?.api_key || secret?.key || secret);
  if (!key) throw new Error("BRANKAS_API_KEY_UNAVAILABLE");
  const response = await fetch(`${providerBaseUrl(config)}${path}`, {
    method,
    headers: { "x-api-key": key, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const raw = await response.text();
  let payload = null; try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `BRANKAS_HTTP_${response.status}`);
    error.code = `BRANKAS_HTTP_${response.status}`; error.status = response.status; error.payload = payload; throw error;
  }
  return payload || {};
}

export const BrankasStatementProvider = {
  id: "brankas_statement",
  displayName: "Brankas Statement",
  supportsCountry(countryCode) { return ["TH", "ID", "PH", "VN"].includes(text(countryCode).toUpperCase()); },
  async fetchStatement({ secret, statementId, config = {} }) {
    const payload = await request({ secret, path: "/v1/statements", method: "GET", config });
    const statements = Array.isArray(payload?.statements) ? payload.statements : [];
    const exact = statements.find((row) => text(row?.statement_id) === text(statementId));
    if (!exact) throw new Error(`BRANKAS_STATEMENT_NOT_FOUND:${text(statementId)}`);
    return exact;
  },
  async createConsentSession({ secret, countryCode, bankCodes = [], externalId, redirectUri, organizationDisplayName, config = {} }) {
    const payload = await request({ secret, path: "/v1/statement-init", method: "POST", config, body: {
      country: text(countryCode).toUpperCase(), bank_codes: bankCodes.filter(Boolean), external_id: text(externalId), app_redirect_uri: text(redirectUri), organization_display_name: text(organizationDisplayName) || "Avantiqo",
    }});
    return { external_connection_id: payload.statement_id || null, redirect_url: payload.redirect_uri || null, provider_request_id: payload.request_id || null, consent_granted_at: payload.time_consent_granted || null, raw: payload };
  },
  normalizeStatement(statement, { externalAccountId = null } = {}) {
    const statementId = text(statement?.statement_id || statement?.id);
    const accounts = Array.isArray(statement?.account_statements) ? statement.account_statements : [];
    const selected = accounts.find((row) => !externalAccountId || text(row?.account?.account_id) === text(externalAccountId)) || accounts[0] || null;
    if (!selected) throw new Error("BRANKAS_STATEMENT_ACCOUNT_UNAVAILABLE");
    const account = selected.account || {};
    const transactions = Array.isArray(selected.transactions) ? selected.transactions : [];
    const normalized = transactions.map((row, index) => {
      const type = text(row?.type).toUpperCase();
      const direction = type.includes("CREDIT") || type === "IN" ? "IN" : type.includes("DEBIT") || type === "OUT" ? "OUT" : null;
      if (!direction) throw new Error(`BRANKAS_TRANSACTION_DIRECTION_UNSUPPORTED:${text(row?.transaction_id) || index + 1}`);
      const value = amount(row?.amount);
      if (!(value > 0)) throw new Error(`BRANKAS_TRANSACTION_AMOUNT_INVALID:${text(row?.transaction_id) || index + 1}`);
      return {
        provider_transaction_id: text(row?.transaction_id || row?.account_transaction_hash) || crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex"),
        transaction_date: dateFromProvider(row?.date) || dateFromProvider(statement?.end_date),
        description: text(row?.descriptor || row?.merchant_name || row?.description) || null,
        amount: value,
        direction,
        reference_number: text(row?.account_transaction_hash || row?.transaction_id || row?.match_id) || null,
        running_balance: amount(row?.balance) || null,
      };
    });
    const startDate = dateFromProvider(statement?.start_date) || normalized.map((row) => row.transaction_date).filter(Boolean).sort()[0] || null;
    const endDate = dateFromProvider(statement?.end_date) || normalized.map((row) => row.transaction_date).filter(Boolean).sort().at(-1) || null;
    const closing = amount(account?.balance);
    const credits = normalized.filter((row) => row.direction === "IN").reduce((sum, row) => sum + row.amount, 0);
    const debits = normalized.filter((row) => row.direction === "OUT").reduce((sum, row) => sum + row.amount, 0);
    const opening = Number((closing - credits + debits).toFixed(6));
    return {
      provider_name: "brankas_statement", external_statement_id: statementId, external_account_id: text(account?.account_id) || null, bank_code: text(account?.bank_code || statement?.bank_code) || null,
      statement_number: `BRANKAS:${statementId || crypto.createHash("sha256").update(JSON.stringify(statement)).digest("hex").slice(0, 24)}`,
      statement_start_date: startDate, statement_end_date: endDate, opening_balance: opening, closing_balance: closing,
      currency_code: currency(account?.balance) || currency(transactions[0]?.amount), transactions: normalized,
      cursor: text(statement?.update || statement?.end_date?.seconds || statement?.end_date) || statementId || null,
      raw_status: text(statement?.status) || null,
    };
  },
  eventId(payload) { return text(payload?.event_id || payload?.notification_id || payload?.id || payload?.statement_id) || crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex"); },
  payloadHash(payload) { return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex"); },
};

export default BrankasStatementProvider;
