export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { linkControlledDocument } from "@/lib/documents/runtime/DocumentControlRuntime";
import { createFinanceEngagementSignatureRequest } from "@/lib/finance/practice/FinancePortalSignatureRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadCompletePracticeRows, loadCompletePracticeRowsByIds } from "@/lib/finance/practice/FinancePracticePopulation";
import { evaluatePracticeEngagementReadiness } from "@/lib/finance/practice/FinancePracticeOnboardingReadiness";

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

    const [organizations, clientEntities, links, documents, billingProfiles] = await Promise.all([
      clientIds.length ? loadCompletePracticeRowsByIds({
        ids: clientIds,
        label: "Accounting practice onboarding client organizations",
        buildQuery: (batch, from, to) => supabaseAdmin.from("organizations").select("id,name").in("id", batch).order("id", { ascending: true }).range(from, to),
      }) : Promise.resolve([]),
      clientIds.length ? loadCompletePracticeRowsByIds({
        ids: clientIds,
        label: "Accounting practice onboarding client legal entities",
        buildQuery: (batch, from, to) => supabaseAdmin.from("legal_entities")
          .select("id,organization_id,code,legal_name,display_name,country,currency,is_active,is_default_accounting_entity")
          .in("organization_id", batch)
          .eq("is_active", true)
          .order("is_default_accounting_entity", { ascending: false })
          .order("legal_name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
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
    const entitiesByOrganization = new Map();
    for (const entity of clientEntities) {
      const rows = entitiesByOrganization.get(entity.organization_id) || [];
      rows.push(entity);
      entitiesByOrganization.set(entity.organization_id, rows);
    }
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
        legal_entities: entitiesByOrganization.get(engagement.organization_id) || [],
        engagement_document: document,
        signatures: signatureRows,
        billing_profile: billingProfile,
        readiness: evaluatePracticeEngagementReadiness({ engagement, link, document, signatures: signatureRows, billingProfile }),
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

    if (action === "set_entity") {
      const entityId = clean(body.entityId || body.entity_id);
      if (!entityId) return jsonError("Client legal entity is required", 400);
      const { data: entity, error: entityError } = await supabaseAdmin.from("legal_entities")
        .select("id,organization_id,is_active")
        .eq("id", entityId)
        .eq("organization_id", engagement.organization_id)
        .eq("is_active", true)
        .maybeSingle();
      if (entityError) throw entityError;
      if (!entity) return jsonError("Selected legal entity is not active in this client organization", 409);
      const { data: updated, error: updateError } = await supabaseAdmin.from("accounting_engagements")
        .update({ entity_id: entity.id, updated_at: new Date().toISOString() })
        .eq("id", engagement.id)
        .eq("accounting_firm_id", access.organizationId)
        .eq("organization_id", engagement.organization_id)
        .select("id,organization_id,entity_id")
        .single();
      if (updateError) throw updateError;
      return NextResponse.json({ success: true, engagement: updated });
    }

    if (action === "link_engagement_document") {
      if (!engagement.entity_id) return jsonError("Set the client legal entity before linking the engagement document", 409);
      const documentId = clean(body.documentId || body.document_id);
      if (!documentId) return jsonError("Controlled engagement document is required", 400);
      const link = await linkControlledDocument({ organizationId: access.organizationId, documentId, entityId: engagement.entity_id || null, actor: access, referenceType: "ACCOUNTING_ENGAGEMENT", referenceId: engagement.id, relationType: "CONTRACT" });
      return NextResponse.json({ success: true, link });
    }

    if (action === "request_signature") {
      if (!engagement.entity_id) return jsonError("Set the client legal entity before requesting signature", 409);
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
