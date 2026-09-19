export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { createControlledDocument } from "@/lib/documents/runtime/DocumentControlRuntime";
import {
  createConversationAttachmentSet,
  loadConversationAttachmentSet,
  persistConversationAttachmentAnalysis,
} from "@/lib/platform/runtime/ConversationAttachmentRuntime";
import {
  analyzeConversationAttachments,
  AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
} from "@/lib/platform/runtime/ConversationAttachmentAnalysisRuntime";
import { attachmentLogicalObjects } from "@/lib/platform/runtime/ConversationAttachmentObjectRuntime";
import { matchAnalyzedAttachmentToBusiness } from "@/lib/platform/runtime/UniversalAttachmentBusinessMatchRuntime";
import { prepareVendorBillAttachment } from "@/lib/finance/accounts-payable/runtime/VendorBillAttachmentPreparationRuntime";
import { AccountsPayableRuntime } from "@/lib/finance/accounts-payable/runtime/AccountsPayableRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
function staffId(access) { return access?.access?.staffAccountId || access?.staff?.id || null; }
function errorStatus(message) {
  if (/permission denied|access/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/clarification|duplicate|already|required|cannot|invalid|ambiguous|receipt|purchase order/i.test(message)) return 409;
  return 500;
}
async function authorize({ request, organizationId, entityId }) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { response: NextResponse.json({ success: false, error: access.error }, { status: access.status }) };
  await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.payables.manage", fullAccess: access.permissions?.includes("*") === true });
  const entity = await resolveEntity({ organizationId: access.organizationId, entityId });
  if (!entity) return { response: NextResponse.json({ success: false, error: "Legal entity required" }, { status: 400 }) };
  return { access, entity };
}
async function analyzeSet({ organizationId, entityId, actorId, attachmentSetId }) {
  const context = { organizationId, actor: { id: actorId } };
  const loaded = await loadConversationAttachmentSet({ context, attachment_set_id: attachmentSetId });
  if (loaded.expired) throw new Error("Attachment set expired");
  if (!loaded.found) throw new Error("Attachment set not found");
  const analyzed = await analyzeConversationAttachments({ files: loaded.files || [], context: { organizationId, entityId, partyId: null } });
  await persistConversationAttachmentAnalysis({ context, attachment_set_id: attachmentSetId, files: analyzed, analysis_version: AVANTIQO_ATTACHMENT_ANALYSIS_VERSION });
  return analyzed;
}
async function prepareLogicalFile({ file, organizationId, entityId }) {
  const businessMatch = await matchAnalyzedAttachmentToBusiness({ file, organizationId, entityId });
  const candidate = object(businessMatch?.candidates?.[0]);
  if (businessMatch?.status === "UNIQUE_MATCH" && candidate.record_type === "vendor_invoice") {
    return { duplicate: true, business_match: businessMatch, prepared: null, vendor_invoice_id: candidate.record_id };
  }
  const matched = { ...file, business_match: businessMatch };
  const prepared = await prepareVendorBillAttachment({ file: matched, organizationId, entityId });
  return { duplicate: false, business_match: businessMatch, prepared, vendor_invoice_id: null };
}
function intakeStatus(result) {
  if (result.duplicate) return "DUPLICATE";
  const prepared = result.prepared || {};
  if (prepared.status === "CLARIFICATION_REQUIRED") return "CLARIFICATION_REQUIRED";
  if (prepared.touchless_stage === "READY_FOR_CREATE_AND_MATCH") return "READY_FOR_CREATE_AND_MATCH";
  if (prepared.status === "READY_FOR_REVIEW") return "READY_FOR_REVIEW";
  return "ANALYZED";
}
async function persistIntake({ organizationId, entityId, attachmentSetId, file, documentId, result, actorId }) {
  const prepared = result.prepared || {};
  const payload = prepared.import_payload || {};
  const row = {
    organization_id: organizationId,
    entity_id: entityId,
    attachment_set_id: attachmentSetId,
    logical_object_id: file.logical_object_id || "object_1",
    enterprise_document_id: documentId || null,
    source_sha256: file.sha256 || null,
    source_file_name: file.name || null,
    source_mime_type: file.mime_type || null,
    business_match_status: result.business_match?.status || null,
    preparation_status: intakeStatus(result),
    touchless_stage: prepared.touchless_stage || null,
    vendor_party_id: payload.vendor_party_id || prepared.vendor?.party_id || null,
    purchase_order_id: payload.purchase_order_id || null,
    goods_receipt_id: payload.goods_receipt_id || null,
    vendor_invoice_id: result.vendor_invoice_id || null,
    invoice_number: payload.invoice_number || null,
    invoice_date: payload.invoice_date || null,
    currency_code: payload.currency_code || null,
    ocr_confidence: Number(payload.ocr_confidence || file.analysis?.confidence || 0),
    clarification_question: prepared.clarification_question || null,
    preparation_evidence: { business_match: result.business_match || {}, prepared_candidate: prepared || {} },
    created_by: actorId || null,
    updated_at: new Date().toISOString(),
  };
  const inserted = await supabaseAdmin.from("finance_ap_intake_items").upsert(row, { onConflict: "organization_id,entity_id,source_sha256,logical_object_id" }).select("*").single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}
async function resolveCandidateFromIntake({ intake, actorId }) {
  const analyzed = await analyzeSet({ organizationId: intake.organization_id, entityId: intake.entity_id, actorId, attachmentSetId: intake.attachment_set_id });
  const logical = analyzed.flatMap((file) => attachmentLogicalObjects(file));
  const file = logical.find((row) => text(row.logical_object_id) === text(intake.logical_object_id) && (!intake.source_sha256 || row.sha256 === intake.source_sha256));
  if (!file) throw new Error("AP intake source object not found");
  return { file, result: await prepareLogicalFile({ file, organizationId: intake.organization_id, entityId: intake.entity_id }) };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"), 160);
    const entityId = text(url.searchParams.get("entityId") || url.searchParams.get("entity_id"), 160);
    const auth = await authorize({ request, organizationId, entityId });
    if (auth.response) return auth.response;
    const result = await supabaseAdmin.from("finance_ap_intake_items").select("*").eq("organization_id", auth.access.organizationId).eq("entity_id", auth.entity.id).order("created_at", { ascending: false }).limit(200);
    if (result.error) throw result.error;
    return NextResponse.json({ success: true, rows: result.data || [] });
  } catch (error) {
    const message = error?.message || "Unable to load AP intake";
    return NextResponse.json({ success: false, error: message }, { status: errorStatus(message) });
  }
}

export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const organizationId = text(form.get("organizationId") || form.get("organization_id"), 160);
      const entityId = text(form.get("entityId") || form.get("entity_id"), 160);
      const auth = await authorize({ request, organizationId, entityId });
      if (auth.response) return auth.response;
      const actorId = staffId(auth.access);
      const files = form.getAll("files").filter((item) => item && typeof item.arrayBuffer === "function").slice(0, 20);
      if (!files.length) return NextResponse.json({ success: false, error: "Supplier invoice file required" }, { status: 400 });
      const attachmentSet = await createConversationAttachmentSet({ context: { organizationId: auth.access.organizationId, actor: { id: auth.access.user?.id || null } }, files });
      const documents = [];
      for (const file of files) {
        documents.push(await createControlledDocument({ organizationId: auth.access.organizationId, entityId: auth.entity.id, actor: auth.access, file, documentName: file.name, documentType: "SUPPLIER_INVOICE_SOURCE", classification: "CONFIDENTIAL", referenceType: "finance_ap_intake", tags: ["finance","accounts-payable","supplier-invoice","ap-intake"], metadata: { upload_source: "finance_ap_intake", authorization_effect: "NONE" } }));
      }
      const analyzed = await analyzeSet({ organizationId: auth.access.organizationId, entityId: auth.entity.id, actorId: auth.access.user?.id || null, attachmentSetId: attachmentSet.attachment_set_id });
      const documentByFileId = new Map((attachmentSet.files || []).map((row, index) => [row.id, documents[index]?.id || documents[index]?.document?.id || null]));
      const logical = analyzed.flatMap((file) => attachmentLogicalObjects(file));
      const rows = [];
      for (const file of logical) {
        const result = await prepareLogicalFile({ file, organizationId: auth.access.organizationId, entityId: auth.entity.id });
        rows.push(await persistIntake({ organizationId: auth.access.organizationId, entityId: auth.entity.id, attachmentSetId: attachmentSet.attachment_set_id, file, documentId: documentByFileId.get(file.id) || null, result, actorId }));
      }
      return NextResponse.json({ success: true, attachment_set_id: attachmentSet.attachment_set_id, rows, authorization_effect: "NONE" }, { status: 201 });
    }

    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id, 160);
    const entityId = text(body.entityId || body.entity_id, 160);
    const intakeId = text(body.intakeId || body.intake_id, 160);
    const auth = await authorize({ request, organizationId, entityId });
    if (auth.response) return auth.response;
    const actorId = staffId(auth.access);
    if (!actorId) throw new Error("Authenticated staff account required for AP confirmation");
    const found = await supabaseAdmin.from("finance_ap_intake_items").select("*").eq("organization_id", auth.access.organizationId).eq("entity_id", auth.entity.id).eq("id", intakeId).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) throw new Error("AP intake item not found");
    if (["CREATED","DUPLICATE"].includes(found.data.preparation_status)) return NextResponse.json({ success: true, replay: true, intake: found.data });
    const { result } = await resolveCandidateFromIntake({ intake: found.data, actorId: auth.access.user?.id || actorId });
    if (result.duplicate) {
      const updated = await supabaseAdmin.from("finance_ap_intake_items").update({ preparation_status: "DUPLICATE", vendor_invoice_id: result.vendor_invoice_id, updated_at: new Date().toISOString() }).eq("id", intakeId).select("*").single();
      if (updated.error) throw updated.error;
      return NextResponse.json({ success: true, replay: true, duplicate: true, intake: updated.data });
    }
    const prepared = result.prepared || {};
    if (prepared.status !== "READY_FOR_REVIEW") {
      const updated = await persistIntake({ organizationId: auth.access.organizationId, entityId: auth.entity.id, attachmentSetId: found.data.attachment_set_id, file: { logical_object_id: found.data.logical_object_id, sha256: found.data.source_sha256, name: found.data.source_file_name, mime_type: found.data.source_mime_type, analysis: { confidence: found.data.ocr_confidence } }, documentId: found.data.enterprise_document_id, result, actorId });
      return NextResponse.json({ success: false, error: prepared.clarification_question || "Supplier invoice requires review before creation", intake: updated }, { status: 409 });
    }
    const payload = prepared.import_payload;
    const identity = [auth.access.organizationId, auth.entity.id, payload.vendor_party_id, payload.invoice_number, payload.invoice_date, payload.source_attachment_sha256 || found.data.source_sha256 || intakeId].join("|");
    const idempotencyKey = `finance-ap-intake-v1:${crypto.createHash("sha256").update(identity).digest("hex")}`;
    await supabaseAdmin.from("finance_ap_intake_items").update({ preparation_status: "CREATING", updated_at: new Date().toISOString() }).eq("id", intakeId);
    const created = await AccountsPayableRuntime.runAll({ organizationId: auth.access.organizationId, entityId: auth.entity.id, vendorPartyId: payload.vendor_party_id, purchaseOrderId: payload.purchase_order_id || null, goodsReceiptId: payload.goods_receipt_id || null, documentId: found.data.enterprise_document_id || null, invoiceNumber: payload.invoice_number, invoiceDate: payload.invoice_date, dueDate: payload.due_date || null, currencyCode: payload.currency_code, exchangeRate: payload.exchange_rate ?? 1, lines: payload.lines, source: "finance_ap_intake", aiExtracted: true, ocrConfidence: Number(payload.ocr_confidence || 0), createdBy: actorId, idempotencyKey });
    const invoice = created?.invoice?.invoice || created?.invoice?.data?.invoice || created?.invoice?.result?.invoice || created?.invoice?.vendor_invoice || created?.invoice || null;
    const vendorInvoiceId = invoice?.id || null;
    const updated = await supabaseAdmin.from("finance_ap_intake_items").update({ preparation_status: "CREATED", touchless_stage: created.touchless_stage, vendor_invoice_id: vendorInvoiceId, confirmed_by: actorId, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(), preparation_evidence: { ...(found.data.preparation_evidence || {}), formal_match: created.match || null, approval_required: true, auto_approved: false } }).eq("id", intakeId).select("*").single();
    if (updated.error) throw updated.error;
    return NextResponse.json({ success: true, intake: updated.data, result: created });
  } catch (error) {
    const message = error?.message || "AP intake failed";
    return NextResponse.json({ success: false, error: message, code: error?.code || null }, { status: errorStatus(message) });
  }
}
