import crypto from "node:crypto";

import { createSignatureRequest } from "@/lib/documents/runtime/DocumentControlRuntime";
import { resolveFinanceClientPortalGrant } from "@/lib/finance/practice/FinanceClientPortalGrant";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONSENT_VERSION = "AVANTIQO_NATIVE_ESIGN_CONSENT_V1";
const CONSENT_TEXT = "I have reviewed this exact document and agree to sign it electronically.";
const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const upper = (value) => text(value).toUpperCase();
const now = () => new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
const normalizedName = (value) => text(value, 240).replace(/\s+/g, " ").toLowerCase();
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeIpHash(headers) {
  const forwarded = text(headers?.get?.("x-forwarded-for") || "").split(",")[0].trim();
  const ip = forwarded || text(headers?.get?.("x-real-ip") || "");
  return ip ? sha256(ip) : null;
}
function uaHash(headers) {
  const ua = text(headers?.get?.("user-agent"), 1000);
  return ua ? sha256(ua) : null;
}

async function exactDocumentVersion({ organizationId, documentId, versionNumber }) {
  const [documentResult, versionResult] = await Promise.all([
    supabaseAdmin.from("enterprise_documents")
      .select("id,organization_id,entity_id,document_name,document_type,document_status,version_number,checksum_sha256,approved_at,updated_at")
      .eq("organization_id", organizationId).eq("id", documentId).maybeSingle(),
    supabaseAdmin.from("enterprise_document_versions")
      .select("enterprise_document_id,version_number,checksum_sha256,source_filename,created_at")
      .eq("organization_id", organizationId).eq("enterprise_document_id", documentId).eq("version_number", Number(versionNumber)).maybeSingle(),
  ]);
  if (documentResult.error) throw documentResult.error;
  if (versionResult.error) throw versionResult.error;
  if (!documentResult.data) throw new Error("SIGNATURE_DOCUMENT_NOT_FOUND");
  const document = documentResult.data;
  const version = versionResult.data || (Number(document.version_number) === Number(versionNumber)
    ? { version_number: Number(versionNumber), checksum_sha256: document.checksum_sha256, source_filename: document.document_name, created_at: document.updated_at }
    : null);
  if (!version) throw new Error("SIGNATURE_DOCUMENT_VERSION_NOT_FOUND");
  const checksum = text(version.checksum_sha256 || document.checksum_sha256, 128);
  if (!checksum) throw new Error("SIGNATURE_DOCUMENT_CHECKSUM_REQUIRED");
  return { document, version, checksum };
}

async function appendEvent({ request, eventType, actorType, portalGrantId = null, evidence = {}, evidenceHash = null }) {
  const { data, error } = await supabaseAdmin.from("document_signature_events").insert({
    organization_id: request.organization_id,
    entity_id: request.entity_id || null,
    signature_request_id: request.id,
    enterprise_document_id: request.enterprise_document_id,
    version_number: request.version_number,
    event_type: eventType,
    actor_type: actorType,
    portal_grant_id: portalGrantId,
    evidence_hash: evidenceHash,
    evidence,
    occurred_at: now(),
  }).select("*").single();
  if (error && String(error.code) !== "23505") throw error;
  return data || null;
}

export async function createFinanceEngagementSignatureRequest({
  accountingFirmId,
  entityId = null,
  documentId,
  actor = null,
  signerName = null,
  signerEmail = null,
  expiresAt = null,
} = {}) {
  const signature = await createSignatureRequest({
    organizationId: accountingFirmId,
    documentId,
    entityId,
    actor,
    signerName,
    signerEmail,
    expiresAt,
    provider: "avantiqo_native_esign",
  });
  const exact = await exactDocumentVersion({ organizationId: accountingFirmId, documentId, versionNumber: signature.version_number });
  const evidence = {
    ...object(signature.evidence),
    contract: "AVANTIQO_NATIVE_ESIGN_REQUEST_V1",
    signing_method: "AVANTIQO_PORTAL_SIMPLE_E_SIGNATURE",
    expected_document_checksum_sha256: exact.checksum,
    consent_version: CONSENT_VERSION,
    simple_electronic_signature: true,
    qualified_digital_signature: false,
    signature_authority_created: false,
    legal_acceptance_authority_created: false,
    binding_submission_authority_created: false,
  };
  const { data, error } = await supabaseAdmin.from("document_signature_requests").update({
    signing_method: "AVANTIQO_PORTAL_SIMPLE_E_SIGNATURE",
    consent_version: CONSENT_VERSION,
    consent_text: CONSENT_TEXT,
    evidence,
    updated_at: now(),
  }).eq("organization_id", accountingFirmId).eq("id", signature.id).select("*").single();
  if (error) throw error;
  await appendEvent({ request: data, eventType: "CREATED", actorType: "STAFF", evidence });
  return data;
}

async function resolvePortalSignature({ portalToken, signatureRequestId, markViewed = false, headers = null }) {
  const grant = await resolveFinanceClientPortalGrant(portalToken, { markViewed: true });
  if (!grant) {
    const error = new Error("This accounting client portal link is invalid or expired");
    error.status = 404; throw error;
  }
  const { data: request, error } = await supabaseAdmin.from("document_signature_requests").select("*")
    .eq("organization_id", grant.accounting_firm_id).eq("id", signatureRequestId).maybeSingle();
  if (error) throw error;
  if (!request) { const e = new Error("Signature request not found"); e.status = 404; throw e; }
  if (request.signer_email && text(request.signer_email).toLowerCase() !== text(grant.client_email).toLowerCase()) {
    const e = new Error("Signature request is outside this portal identity"); e.status = 404; throw e;
  }
  const { data: link, error: linkError } = await supabaseAdmin.from("enterprise_document_links")
    .select("enterprise_document_id")
    .eq("organization_id", grant.accounting_firm_id)
    .eq("enterprise_document_id", request.enterprise_document_id)
    .eq("reference_type", "ACCOUNTING_ENGAGEMENT")
    .eq("reference_id", grant.engagement_id)
    .eq("relation_type", "CONTRACT")
    .limit(1).maybeSingle();
  if (linkError) throw linkError;
  if (!link) { const e = new Error("Signature request is outside this accounting engagement"); e.status = 404; throw e; }

  if (request.expires_at && Date.parse(request.expires_at) <= Date.now() && !["SIGNED","DECLINED","CANCELLED","EXPIRED"].includes(upper(request.status))) {
    const expiredAt = now();
    const { data: expired, error: expireError } = await supabaseAdmin.from("document_signature_requests").update({ status: "EXPIRED", updated_at: expiredAt }).eq("id", request.id).in("status", ["PENDING","SENT","VIEWED"]).select("*").maybeSingle();
    if (expireError) throw expireError;
    if (expired) await appendEvent({ request: expired, eventType: "EXPIRED", actorType: "SYSTEM", portalGrantId: grant.id, evidence: { reason: "expires_at_elapsed" } });
    const e = new Error("Signature request has expired"); e.status = 410; throw e;
  }

  const exact = await exactDocumentVersion({ organizationId: grant.accounting_firm_id, documentId: request.enterprise_document_id, versionNumber: request.version_number });
  const expectedChecksum = text(request.evidence?.expected_document_checksum_sha256, 128);
  if (expectedChecksum && expectedChecksum !== exact.checksum) {
    const e = new Error("Signature document checksum no longer matches the request evidence"); e.status = 409; throw e;
  }

  let effectiveRequest = request;
  if (markViewed && ["PENDING","SENT"].includes(upper(request.status))) {
    const viewedAt = now();
    const { data: viewed, error: viewedError } = await supabaseAdmin.from("document_signature_requests").update({ status: "VIEWED", viewed_at: viewedAt, updated_at: viewedAt, evidence: { ...object(request.evidence), first_viewed_at: viewedAt, viewed_via: "ACCOUNTING_CLIENT_PORTAL" } }).eq("id", request.id).in("status", ["PENDING","SENT"]).select("*").maybeSingle();
    if (viewedError) throw viewedError;
    if (viewed) {
      effectiveRequest = viewed;
      await appendEvent({ request: viewed, eventType: "VIEWED", actorType: "SIGNER", portalGrantId: grant.id, evidence: { ip_hash: safeIpHash(headers), user_agent_hash: uaHash(headers), document_checksum_sha256: exact.checksum } });
    }
  }
  return { grant, request: effectiveRequest, document: exact.document, version: exact.version, checksum: exact.checksum };
}

export async function getFinancePortalSignature({ portalToken, signatureRequestId, headers = null } = {}) {
  const context = await resolvePortalSignature({ portalToken, signatureRequestId, markViewed: true, headers });
  return {
    signature: {
      id: context.request.id,
      status: context.request.status,
      signer_name: context.request.signer_name,
      signer_email: context.request.signer_email,
      requested_at: context.request.requested_at,
      expires_at: context.request.expires_at,
      signed_at: context.request.signed_at,
      declined_at: context.request.declined_at,
      signed_name: context.request.signed_name,
      signing_method: context.request.signing_method || "AVANTIQO_PORTAL_SIMPLE_E_SIGNATURE",
      consent_version: context.request.consent_version || CONSENT_VERSION,
      consent_text: context.request.consent_text || CONSENT_TEXT,
    },
    document: {
      id: context.document.id,
      name: context.document.document_name,
      type: context.document.document_type,
      version_number: context.request.version_number,
      checksum_sha256: context.checksum,
      open_path: `documents/${context.document.id}`,
    },
    assurance: {
      simple_electronic_signature: true,
      qualified_digital_signature: false,
      certificate_based_signature: false,
      legal_effect_depends_on_applicable_law: true,
    },
  };
}

export async function executeFinancePortalSignature({ portalToken, signatureRequestId, action, signerName = null, consent = false, headers = null } = {}) {
  const context = await resolvePortalSignature({ portalToken, signatureRequestId, markViewed: true, headers });
  const current = upper(context.request.status);
  const normalizedAction = text(action).toLowerCase();
  if (normalizedAction === "sign" && current === "SIGNED") return { success: true, replay: true, status: "SIGNED" };
  if (normalizedAction === "decline" && current === "DECLINED") return { success: true, replay: true, status: "DECLINED" };
  if (!["PENDING","SENT","VIEWED"].includes(current)) {
    const e = new Error(`Signature request cannot be changed from ${current || "UNKNOWN"}`); e.status = 409; throw e;
  }

  const occurredAt = now();
  const ipHash = safeIpHash(headers);
  const userAgentHash = uaHash(headers);
  if (normalizedAction === "sign") {
    const typedName = text(signerName, 240);
    if (!typedName) { const e = new Error("Type your full name to sign"); e.status = 400; throw e; }
    if (context.request.signer_name && normalizedName(typedName) !== normalizedName(context.request.signer_name)) {
      const e = new Error("Typed signer name does not match this signature request"); e.status = 409; throw e;
    }
    if (consent !== true) { const e = new Error("Electronic signature consent is required"); e.status = 400; throw e; }
    const facts = {
      contract: "AVANTIQO_NATIVE_ESIGN_EVIDENCE_V1",
      signature_request_id: context.request.id,
      portal_grant_id: context.grant.id,
      enterprise_document_id: context.document.id,
      version_number: context.request.version_number,
      document_checksum_sha256: context.checksum,
      signer_name: typedName,
      signer_email: context.grant.client_email || context.request.signer_email || null,
      signed_at: occurredAt,
      consent_version: CONSENT_VERSION,
      consent_text: CONSENT_TEXT,
      ip_hash: ipHash,
      user_agent_hash: userAgentHash,
      signing_method: "AVANTIQO_PORTAL_SIMPLE_E_SIGNATURE",
      simple_electronic_signature: true,
      qualified_digital_signature: false,
      certificate_based_signature: false,
      legal_effect_depends_on_applicable_law: true,
      signature_authority_created: true,
      legal_acceptance_authority_created: false,
      binding_submission_authority_created: false,
    };
    const evidenceHash = sha256(JSON.stringify(facts));
    const { data, error } = await supabaseAdmin.from("document_signature_requests").update({
      status: "SIGNED",
      signed_at: occurredAt,
      signed_name: typedName,
      signing_method: "AVANTIQO_PORTAL_SIMPLE_E_SIGNATURE",
      signed_document_checksum_sha256: context.checksum,
      signature_evidence_hash: evidenceHash,
      consent_version: CONSENT_VERSION,
      consent_text: CONSENT_TEXT,
      evidence: { ...object(context.request.evidence), ...facts, evidence_hash: evidenceHash },
      updated_at: occurredAt,
    }).eq("id", context.request.id).in("status", ["PENDING","SENT","VIEWED"]).select("*").maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Signature request changed before signing completed"); e.status = 409; throw e; }
    await appendEvent({ request: data, eventType: "SIGNED", actorType: "SIGNER", portalGrantId: context.grant.id, evidence: facts, evidenceHash });
    await supabaseAdmin.from("enterprise_document_access_logs").insert({ organization_id: data.organization_id, enterprise_document_id: data.enterprise_document_id, accessed_by: null, access_type: "SIGNATURE_SIGNED", metadata: { signature_request_id: data.id, version_number: data.version_number, evidence_hash: evidenceHash, portal_grant_id: context.grant.id }, accessed_at: occurredAt });
    return { success: true, replay: false, status: "SIGNED", signature: data };
  }

  if (normalizedAction === "decline") {
    const facts = {
      contract: "AVANTIQO_NATIVE_ESIGN_DECLINE_EVIDENCE_V1",
      signature_request_id: context.request.id,
      portal_grant_id: context.grant.id,
      enterprise_document_id: context.document.id,
      version_number: context.request.version_number,
      document_checksum_sha256: context.checksum,
      signer_email: context.grant.client_email || context.request.signer_email || null,
      declined_at: occurredAt,
      ip_hash: ipHash,
      user_agent_hash: userAgentHash,
      signer_decline_evidence: true,
    };
    const evidenceHash = sha256(JSON.stringify(facts));
    const { data, error } = await supabaseAdmin.from("document_signature_requests").update({ status: "DECLINED", declined_at: occurredAt, evidence: { ...object(context.request.evidence), ...facts, evidence_hash: evidenceHash }, updated_at: occurredAt }).eq("id", context.request.id).in("status", ["PENDING","SENT","VIEWED"]).select("*").maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Signature request changed before decline completed"); e.status = 409; throw e; }
    await appendEvent({ request: data, eventType: "DECLINED", actorType: "SIGNER", portalGrantId: context.grant.id, evidence: facts, evidenceHash });
    return { success: true, replay: false, status: "DECLINED", signature: data };
  }
  const e = new Error("Unsupported signature action"); e.status = 400; throw e;
}
