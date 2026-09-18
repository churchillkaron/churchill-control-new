export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { linkControlledDocument } from "@/lib/documents/runtime/DocumentControlRuntime";
import { createFinanceEngagementSignatureRequest } from "@/lib/finance/practice/FinancePortalSignatureRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadCompletePracticeRows, loadCompletePracticeRowsByIds } from "@/lib/finance/practice/FinancePracticePopulation";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.configuration.manage"];
function clean(value) { return String(value ?? "").trim(); }
function jsonError(error, status = 400) { return NextResponse.json({ success: false, error }, { status }); }
async function requireView(access) { await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.view", fullAccess: access.permissions?.includes("*") === true }); }
async function requireManage(access) {
  if (access.permissions?.includes("*") === true) return;
  let lastError = null;
  for (const permissionKey of MANAGE_PERMISSIONS) {
    try { await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey, fullAccess: false }); return; }
    catch (error) { lastError = error; }
  }
  throw lastError || new Error("Finance onboarding permission denied");
}

function readiness({ engagement, link, document, signatures, billingProfile }) {
  if (!engagement.entity_id) return { state: "NEEDS_ENTITY", next_action: "Set the client legal entity before accounting work starts." };
  if (!link || !document) return { state: "NEEDS_ENGAGEMENT_LETTER", next_action: "Link the approved engagement letter or contract." };
  if (!document.approved_at && !["approved", "active"].includes(clean(document.document_status).toLowerCase())) return { state: "NEEDS_DOCUMENT_APPROVAL", next_action: "Approve the current engagement document version." };
  if (!signatures.length) return { state: "NEEDS_SIGNATURE_REQUEST", next_action: "Choose the real signer and request signature." };
  if (signatures.some((row) => row.status === "DECLINED")) return { state: "SIGNATURE_DECLINED", next_action: "Resolve the declined engagement signature before starting recurring work." };
  if (!signatures.some((row) => row.status === "SIGNED")) return { state: "AWAITING_SIGNATURE", next_action: "Wait for the engagement signature or follow up deliberately." };
  if (!billingProfile) return { state: "NEEDS_BILLING_POLICY", next_action: "Set the engagement billing method and commercial terms." };
  return { state: "READY", next_action: "Engagement setup is complete. Recurring accounting work can proceed." };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireView(access);

    const engagements = await loadCompletePracticeRows({
      label: "Accounting practice onboarding engagements",
      buildQuery: (from, to) => supabaseAdmin.from("accounting_engagements")
        .select("id,organization_id,entity_id,service_package,status,renewal_date,year_end_date")
        .eq("accounting_firm_id", access.organizationId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    });
    const engagementIds = engagements.map((row) => row.id);
    const clientIds = [...new Set(engagements.map((row) => row.organization_id).filter(Boolean))];

    const [organizations, links, documents, billingProfiles] = await Promise.all([
      clientIds.length ? loadCompletePracticeRowsByIds({
        ids: clientIds,
        label: "Accounting practice onboarding client organizations",
        buildQuery: (batch, from, to) => supabaseAdmin.from("organizations").select("id,name").in("id", batch).order("id", { ascending: true }).range(from, to),
      }) : Promise.resolve([]),
      engagementIds.length ? loadCompletePracticeRowsByIds({
        ids: engagementIds,
        label: "Accounting practice engagement contract links",
        buildQuery: (batch, from, to) => supabaseAdmin.from("enterprise_document_links")
          .select("id,enterprise_document_id,reference_id,relation_type,created_at")
          .eq("organization_id", access.organizationId)
          .eq("reference_type", "ACCOUNTING_ENGAGEMENT")
          .eq("relation_type", "CONTRACT")
          .in("reference_id", batch)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      }) : Promise.resolve([]),
      loadCompletePracticeRows({
        label: "Accounting practice controlled engagement documents",
        buildQuery: (from, to) => supabaseAdmin.from("enterprise_documents")
          .select("id,entity_id,document_name,document_type,document_status,version_number,approved_at,updated_at")
          .eq("organization_id", access.organizationId)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      }),
      loadCompletePracticeRows({
        label: "Accounting practice billing profiles",
        buildQuery: (from, to) => supabaseAdmin.from("accounting_practice_billing_profiles")
          .select("id,engagement_id,billing_method,currency_code,default_hourly_rate,fixed_fee_amount,status")
          .eq("accounting_firm_id", access.organizationId)
          .eq("status", "ACTIVE")
          .order("id", { ascending: true })
          .range(from, to),
      }),
    ]);

    const documentIds = [...new Set(links.map((row) => row.enterprise_document_id).filter(Boolean))];
    const signatures = documentIds.length ? await loadCompletePracticeRowsByIds({
      ids: documentIds,
      label: "Accounting practice engagement signatures",
      buildQuery: (batch, from, to) => supabaseAdmin.from("document_signature_requests")
        .select("id,enterprise_document_id,signer_name,signer_email,status,requested_at,expires_at,signed_at,declined_at,provider")
        .eq("organization_id", access.organizationId)
        .in("enterprise_document_id", batch)
        .order("requested_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    }) : [];

    const orgMap = new Map(organizations.map((row) => [row.id, row]));
    const linkMap = new Map();
    for (const link of links) if (!linkMap.has(link.reference_id)) linkMap.set(link.reference_id, link);
    const documentMap = new Map(documents.map((row) => [row.id, row]));
    const signaturesByDocument = new Map();
    for (const signature of signatures) { const rows = signaturesByDocument.get(signature.enterprise_document_id) || []; rows.push(signature); signaturesByDocument.set(signature.enterprise_document_id, rows); }
    const billingMap = new Map(billingProfiles.map((row) => [row.engagement_id, row]));

    const rows = engagements.map((engagement) => {
      const link = linkMap.get(engagement.id) || null;
      const document = link ? documentMap.get(link.enterprise_document_id) || null : null;
      const signatureRows = document ? signaturesByDocument.get(document.id) || [] : [];
      const billingProfile = billingMap.get(engagement.id) || null;
      return {
        ...engagement,
        client_name: orgMap.get(engagement.organization_id)?.name || "Client organization",
        engagement_document: document,
        signatures: signatureRows,
        billing_profile: billingProfile,
        readiness: readiness({ engagement, link, document, signatures: signatureRows, billingProfile }),
      };
    });
    const approvedDocuments = documents.filter((document) => document.approved_at || ["approved", "active"].includes(clean(document.document_status).toLowerCase()));
    return NextResponse.json({ success: true, engagements: rows, approved_documents: approvedDocuments, summary: { total: rows.length, ready: rows.filter((row) => row.readiness.state === "READY").length, attention: rows.filter((row) => row.readiness.state !== "READY").length }, generated_at: new Date().toISOString() });
  } catch (error) {
    return jsonError(error?.message || "Unable to load practice onboarding", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);
    const engagementId = clean(body.engagementId || body.engagement_id);
    const { data: engagement, error: engagementError } = await supabaseAdmin.from("accounting_engagements").select("id,organization_id,entity_id").eq("id", engagementId).eq("accounting_firm_id", access.organizationId).maybeSingle();
    if (engagementError) throw engagementError;
    if (!engagement) return jsonError("Accounting engagement not found", 404);
    const action = clean(body.action).toLowerCase();

    if (action === "link_engagement_document") {
      const documentId = clean(body.documentId || body.document_id);
      if (!documentId) return jsonError("Controlled engagement document is required", 400);
      const link = await linkControlledDocument({ organizationId: access.organizationId, documentId, entityId: engagement.entity_id || null, actor: access, referenceType: "ACCOUNTING_ENGAGEMENT", referenceId: engagement.id, relationType: "CONTRACT" });
      return NextResponse.json({ success: true, link });
    }

    if (action === "request_signature") {
      const { data: link, error: linkError } = await supabaseAdmin.from("enterprise_document_links").select("enterprise_document_id").eq("organization_id", access.organizationId).eq("reference_type", "ACCOUNTING_ENGAGEMENT").eq("reference_id", engagement.id).eq("relation_type", "CONTRACT").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (linkError) throw linkError;
      if (!link) return jsonError("Link the engagement document before requesting signature", 409);
      const signerName = clean(body.signerName || body.signer_name);
      const signerEmail = clean(body.signerEmail || body.signer_email);
      if (!signerName && !signerEmail) return jsonError("Signer name or email is required; Avantiqo will not guess the client signer", 400);
      const signature = await createFinanceEngagementSignatureRequest({ accountingFirmId: access.organizationId, documentId: link.enterprise_document_id, entityId: engagement.entity_id || null, actor: access, signerName: signerName || null, signerEmail: signerEmail || null, expiresAt: body.expiresAt || body.expires_at || null });
      return NextResponse.json({ success: true, signature }, { status: 201 });
    }

    return jsonError("Unsupported onboarding action", 400);
  } catch (error) { return jsonError(error?.message || "Unable to update practice onboarding", error?.status || 500); }
}
