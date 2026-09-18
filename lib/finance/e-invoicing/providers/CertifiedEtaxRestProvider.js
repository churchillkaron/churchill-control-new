import crypto from "node:crypto";

function text(value) { return String(value ?? "").trim(); }
function joinUrl(baseUrl, path) {
  const base = text(baseUrl).replace(/\/$/, "");
  const part = text(path);
  if (!base || !part) throw new Error("E_INVOICE_PROVIDER_ENDPOINT_NOT_CONFIGURED");
  return /^https?:\/\//i.test(part) ? part : `${base}${part.startsWith("/") ? "" : "/"}${part}`;
}
async function jsonResponse(response) {
  const raw = await response.text();
  let body; try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || `E_INVOICE_PROVIDER_HTTP_${response.status}`);
    error.code = `E_INVOICE_PROVIDER_HTTP_${response.status}`; error.status = response.status; error.body = body; throw error;
  }
  return body || {};
}
function secretObject(secret) { if (secret && typeof secret === "object") return secret; const raw=text(secret); try { return JSON.parse(raw); } catch { return { api_key: raw }; } }

async function providerToken({ secret, config }) {
  const credentials = secretObject(secret);
  if (text(credentials.access_token)) return text(credentials.access_token);
  if (text(credentials.api_key) && !text(config.auth_path)) return null;
  const authUrl = joinUrl(config.base_url, config.auth_path);
  const authBody = config.auth_body_template && typeof config.auth_body_template === "object"
    ? JSON.parse(JSON.stringify(config.auth_body_template).replace(/\{\{username\}\}/g, text(credentials.username)).replace(/\{\{password\}\}/g, text(credentials.password)).replace(/\{\{api_key\}\}/g, text(credentials.api_key)))
    : { username: credentials.username, password: credentials.password, api_key: credentials.api_key };
  const response = await fetch(authUrl, { method: text(config.auth_method || "POST").toUpperCase(), headers: { "Content-Type": "application/json" }, body: JSON.stringify(authBody), cache: "no-store" });
  const body = await jsonResponse(response);
  const token = text(body.access_token || body.token || body.data?.access_token || body.data?.token);
  if (!token) throw new Error("E_INVOICE_PROVIDER_TOKEN_MISSING");
  return token;
}
function authHeaders({ secret, config, token }) {
  const credentials = secretObject(secret);
  const headers = { "Content-Type": "application/json", "Accept": "application/json" };
  if (token) headers.Authorization = `${text(config.auth_scheme || "Bearer")} ${token}`;
  else if (text(credentials.api_key)) headers[text(config.api_key_header || "x-api-key")] = text(credentials.api_key);
  if (text(config.server_key)) headers[text(config.server_key_header || "x-server-key")] = text(config.server_key);
  return headers;
}
function mappedStatus(body) {
  const raw = text(body?.status || body?.document_status || body?.data?.status || body?.result?.status).toUpperCase();
  if (["ACCEPT","ACCEPTED","SUCCESS","APPROVED","COMPLETE","COMPLETED"].includes(raw)) return "ACCEPTED";
  if (["REJECT","REJECTED","DECLINED","INVALID"].includes(raw)) return "REJECTED";
  if (["FAILED","ERROR"].includes(raw)) return "FAILED";
  return "SUBMITTED";
}

const CertifiedEtaxRestProvider = {
  id: "certified_etax_rest",
  displayName: "Certified e-Tax Provider",
  async submit({ secret, config = {}, transmission, xml }) {
    const token = await providerToken({ secret, config });
    const url = joinUrl(config.base_url, config.upload_path);
    const payload = {
      document_type: transmission.document_type,
      document_number: transmission.invoice_number,
      sender_identifier: transmission.sender_identifier,
      standard_code: transmission.standard_code,
      standard_version: transmission.standard_version,
      xml_base64: Buffer.from(xml, "utf8").toString("base64"),
      callback_url: transmission.callback_url || undefined,
      idempotency_key: transmission.idempotency_key,
    };
    const response = await fetch(url, { method: text(config.upload_method || "POST").toUpperCase(), headers: authHeaders({ secret, config, token }), body: JSON.stringify(payload), cache: "no-store" });
    const body = await jsonResponse(response);
    return {
      status: mappedStatus(body),
      provider_tracking_id: text(body.tracking_id || body.document_id || body.job_id || body.data?.tracking_id || body.data?.document_id) || null,
      provider_reference: text(body.reference || body.reference_id || body.data?.reference) || null,
      authority_reference: text(body.authority_reference || body.rd_reference || body.data?.authority_reference) || null,
      provider_status_code: text(body.code || body.status_code || body.data?.code) || null,
      provider_status_message: text(body.message || body.status_message || body.data?.message) || null,
      evidence: body,
    };
  },
  async status({ secret, config = {}, providerTrackingId }) {
    if (!text(providerTrackingId)) throw new Error("E_INVOICE_PROVIDER_TRACKING_ID_REQUIRED");
    const token = await providerToken({ secret, config });
    const pathTemplate = text(config.status_path);
    if (!pathTemplate) throw new Error("E_INVOICE_PROVIDER_STATUS_ENDPOINT_NOT_CONFIGURED");
    const path = pathTemplate.replace(/\{\{tracking_id\}\}/g, encodeURIComponent(text(providerTrackingId)));
    const response = await fetch(joinUrl(config.base_url, path), { method: text(config.status_method || "GET").toUpperCase(), headers: authHeaders({ secret, config, token }), cache: "no-store" });
    const body = await jsonResponse(response);
    return {
      status: mappedStatus(body),
      authority_reference: text(body.authority_reference || body.rd_reference || body.data?.authority_reference) || null,
      provider_status_code: text(body.code || body.status_code || body.data?.code) || null,
      provider_status_message: text(body.message || body.status_message || body.data?.message) || null,
      evidence: body,
    };
  },
  eventId(payload) { return text(payload?.event_id || payload?.id || payload?.tracking_id || payload?.document_id) || crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex"); },
  payloadHash(payload) { return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex"); },
  mapCallback(payload) {
    return { status: mappedStatus(payload), provider_tracking_id: text(payload?.tracking_id || payload?.document_id || payload?.data?.tracking_id) || null, authority_reference: text(payload?.authority_reference || payload?.rd_reference || payload?.data?.authority_reference) || null, provider_status_code: text(payload?.code || payload?.status_code || payload?.data?.code) || null, provider_status_message: text(payload?.message || payload?.status_message || payload?.data?.message) || null, evidence: payload || {} };
  },
};
export default CertifiedEtaxRestProvider;
