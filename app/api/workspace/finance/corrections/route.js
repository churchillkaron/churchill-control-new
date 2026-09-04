export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { listFinanceEvidenceDocuments } from "@/lib/finance/practice/FinanceEvidenceDocumentRuntime";
import {
  createFinanceCorrection,
  decideFinanceCorrection,
  listCorrectionAccounts,
  listFinanceCorrections,
  postFinanceCorrection,
  recheckFinanceCorrection,
  saveFinanceCorrection,
} from "@/lib/finance/corrections/FinanceCorrectionRuntime";

function clean(value) { return String(value ?? "").trim(); }
function jsonError(message, status = 400) { return NextResponse.json({ success: false, error: message }, { status }); }
function statusFor(message) {
  if (/permission denied/i.test(message || "")) return 403;
  if (/segregation of duties/i.test(message || "")) return 409;
  if (/not found/i.test(message || "")) return 404;
  if (/must|requires|required|cannot|only|no longer|invalid|unbalanced|inactive|out-of-scope|engagement|cleared|already exists|pending document approval/i.test(message || "")) return 409;
  return 500;
}
async function requirePermission(access, key) {
  await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: key, fullAccess: access.permissions?.includes("*") === true });
}
async function assertClientScope(accountingFirmId, clientOrganizationId) {
  if (!clientOrganizationId || clientOrganizationId === accountingFirmId) return;
  const { data, error } = await supabaseAdmin.from("accounting_engagements")
    .select("id,status")
    .eq("accounting_firm_id", accountingFirmId)
    .eq("organization_id", clientOrganizationId)
    .neq("status", "CANCELLED")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Client organization is outside the accounting firm's engagement scope");
}
async function audit(access, action, entityId, metadata) {
  if (!entityId) return null;
  const { error } = await supabaseAdmin.from("organization_audit_logs").insert({
    organization_id: access.organizationId,
    entity_type: "accounting_correction",
    entity_id: String(entityId),
    action,
    metadata,
    actor_email: access.user?.email || null,
  });
  if (error) throw error;
  return null;
}
async function auditAfterAction(access, action, entityId, metadata) {
  try {
    await audit(access, action, entityId, metadata);
    return null;
  } catch (error) {
    console.error("FINANCE_CORRECTION_AUDIT_WRITE_FAILED", {
      action,
      entityId,
      error: error?.message || String(error),
    });
    return "Accounting action completed, but its secondary audit-log write needs recovery";
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const clientOrganizationId = clean(url.searchParams.get("clientOrganizationId") || url.searchParams.get("client_organization_id"));
    const entityId = clean(url.searchParams.get("entityId") || url.searchParams.get("entity_id"));
    const periodId = clean(url.searchParams.get("periodId") || url.searchParams.get("period_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requirePermission(access, "finance.accounting.view");
    const clientOrg = clientOrganizationId || access.organizationId;
    await assertClientScope(access.organizationId, clientOrg);

    const [corrections, accounts, documents] = await Promise.all([
      listFinanceCorrections({ organizationId: access.organizationId, entityId: entityId || null, periodId: periodId || null }),
      entityId ? listCorrectionAccounts({ organizationId: clientOrg, entityId }) : Promise.resolve([]),
      listFinanceEvidenceDocuments({ organizationId: clientOrg, entityId: entityId || null, limit: 500 }),
    ]);
    return NextResponse.json({ success: true, corrections, accounts, documents, generated_at: new Date().toISOString() });
  } catch (error) {
    const message = error?.message || "Unable to load accounting corrections";
    return jsonError(message, statusFor(message));
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const action = clean(body.action).toLowerCase();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    const actorId = access.user?.id || null;

    let result;
    if (action === "create") {
      await requirePermission(access, "finance.journals.create");
      const clientOrganizationId = clean(body.clientOrganizationId || body.client_organization_id) || access.organizationId;
      await assertClientScope(access.organizationId, clientOrganizationId);
      result = await createFinanceCorrection({ accountingFirmId: access.organizationId, clientOrganizationId, entityId: clean(body.entityId || body.entity_id), periodId: clean(body.periodId || body.period_id), accountId: clean(body.accountId || body.account_id), requestedBy: actorId, currency: clean(body.currencyCode || body.currency_code) || null });
    } else if (action === "save" || action === "submit") {
      await requirePermission(access, "finance.journals.create");
      result = await saveFinanceCorrection({ accountingFirmId: access.organizationId, correctionId: clean(body.correctionId || body.correction_id), actorId, resolutionMode: body.resolutionMode || body.resolution_mode, treatment: body.treatment, journalDraft: body.journalDraft || body.journal_draft, documentIds: body.documentIds || body.document_ids, submit: action === "submit" });
    } else if (action === "approve" || action === "reject") {
      await requirePermission(access, "finance.accounting.manage");
      result = await decideFinanceCorrection({ accountingFirmId: access.organizationId, correctionId: clean(body.correctionId || body.correction_id), actorId, approve: action === "approve", note: body.note });
    } else if (action === "post") {
      await requirePermission(access, "finance.journals.post");
      result = await postFinanceCorrection({ accountingFirmId: access.organizationId, correctionId: clean(body.correctionId || body.correction_id), actorId });
    } else if (action === "recheck") {
      await requirePermission(access, "finance.accounting.view");
      result = await recheckFinanceCorrection({ accountingFirmId: access.organizationId, correctionId: clean(body.correctionId || body.correction_id) });
    } else {
      return jsonError("Unsupported correction action", 400);
    }

    const correctionId = result?.correction?.id || result?.id || body.correctionId || null;
    const correctionStatus = result?.correction?.status || result?.status || null;
    const auditWarning = await auditAfterAction(
      access,
      `ACCOUNTING_CORRECTION_${action.toUpperCase()}`,
      correctionId,
      { action, status: correctionStatus },
    );
    return NextResponse.json({
      success: true,
      result,
      audit_warning: auditWarning,
      outcome: {
        action,
        correction_id: correctionId,
        status: correctionStatus,
        completed: true,
      },
    });
  } catch (error) {
    const message = error?.message || "Unable to update accounting correction";
    return jsonError(message, statusFor(message));
  }
}