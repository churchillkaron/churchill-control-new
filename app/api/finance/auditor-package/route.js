export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  generateFinanceAuditorPackage,
  getFinanceAuditorPackageDownload,
  getFinanceAuditorPackageReadiness,
  issueFinanceAuditorPackageGrant,
  listFinanceAuditorPackages,
  revokeFinanceAuditorPackageGrant,
} from "@/lib/finance/auditor/FinanceAuditorPackageRuntime";

const clean = (value) => String(value ?? "").trim();
const staffId = (access) => access?.access?.staffAccountId || access?.staff?.id || null;
async function scope(request, source = {}) {
  const url = new URL(request.url);
  const organizationId = clean(source.organizationId || source.organization_id || url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
  const entityId = clean(source.entityId || source.entity_id || url.searchParams.get("entityId") || url.searchParams.get("entity_id"));
  const periodId = clean(source.periodId || source.period_id || url.searchParams.get("periodId") || url.searchParams.get("period_id"));
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { response: NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 }) };
  return { access, organizationId: access.organizationId, entityId, periodId };
}
async function viewPermission(ctx) {
  await checkFinancePermission({ organizationId: ctx.organizationId, userId: ctx.access.user?.id, permissionKey: "finance.reports.view", fullAccess: ctx.access.permissions?.includes("*") === true });
}
async function managePermission(ctx) {
  if (ctx.access.permissions?.includes("*") === true) return;
  let error = null;
  for (const permissionKey of ["finance.reports.manage", "finance.close.execute"]) {
    try { await checkFinancePermission({ organizationId: ctx.organizationId, userId: ctx.access.user?.id, permissionKey, fullAccess: false }); return; } catch (candidate) { error = candidate; }
  }
  throw error || new Error("Auditor package management permission denied");
}
function statusFor(error) {
  const message = String(error?.message || error || "");
  if (/permission denied/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/NOT_READY|stale|Close the accounting period|completed governed|balanced before/i.test(message)) return 409;
  if (/required|valid auditor email|unsupported/i.test(message)) return 400;
  return error?.status || 500;
}
function safeReadiness(readiness) {
  if (!readiness) return null;
  return { ready: readiness.ready, blockers: readiness.blockers || [], period: readiness.period || null, close_run: readiness.close_run || null, freshness: readiness.freshness ? { state: readiness.freshness.state, trusted: readiness.freshness.trusted, reason: readiness.freshness.reason, changed_sections: readiness.freshness.changed_sections || [], changed_labels: readiness.freshness.changed_labels || [], current_fingerprint: readiness.freshness.current_fingerprint || null, stored_fingerprint: readiness.freshness.stored_fingerprint || null } : null };
}

export async function GET(request) {
  try {
    const ctx = await scope(request);
    if (ctx.response) return ctx.response;
    await viewPermission(ctx);
    if (!ctx.entityId || !ctx.periodId) return NextResponse.json({ success: true, readiness: { ready: false, blockers: ["Select a legal entity and accounting period."] }, packages: [] });
    const [readiness, packages] = await Promise.all([
      getFinanceAuditorPackageReadiness({ organizationId: ctx.organizationId, entityId: ctx.entityId, periodId: ctx.periodId }),
      listFinanceAuditorPackages({ organizationId: ctx.organizationId, entityId: ctx.entityId, periodId: ctx.periodId }),
    ]);
    return NextResponse.json({ success: true, readiness: safeReadiness(readiness), packages });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Auditor package read failed", blockers: error?.blockers || [] }, { status: statusFor(error) });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await scope(request, body);
    if (ctx.response) return ctx.response;
    const action = clean(body.action || "generate").toLowerCase();
    if (action === "download") {
      await viewPermission(ctx);
      const signed = await getFinanceAuditorPackageDownload({ organizationId: ctx.organizationId, packageId: clean(body.packageId || body.package_id) });
      return NextResponse.json({ success: true, ...signed });
    }
    await managePermission(ctx);
    if (!ctx.entityId) return NextResponse.json({ success: false, error: "entityId required" }, { status: 400 });
    if (action === "generate") {
      if (!ctx.periodId) return NextResponse.json({ success: false, error: "periodId required" }, { status: 400 });
      const result = await generateFinanceAuditorPackage({ organizationId: ctx.organizationId, entityId: ctx.entityId, periodId: ctx.periodId, actor: ctx.access });
      return NextResponse.json(result, { status: result.replay ? 200 : 201 });
    }
    if (action === "grant") {
      const issued = await issueFinanceAuditorPackageGrant({ organizationId: ctx.organizationId, entityId: ctx.entityId, packageId: clean(body.packageId || body.package_id), auditorName: body.auditorName || body.auditor_name || null, auditorEmail: body.auditorEmail || body.auditor_email, issuedBy: staffId(ctx.access), ttlDays: body.ttlDays || body.ttl_days || 30 });
      return NextResponse.json({ success: true, grant: issued.grant, auditor_path: `/auditor/package/${issued.token}`, expires_at: issued.expires_at, token_returned_once: true }, { status: 201 });
    }
    if (action === "revoke_grant") {
      const grant = await revokeFinanceAuditorPackageGrant({ organizationId: ctx.organizationId, grantId: clean(body.grantId || body.grant_id), revokedBy: staffId(ctx.access), reason: body.reason || "STAFF_REVOKED" });
      if (!grant) return NextResponse.json({ success: false, error: "Active auditor grant not found" }, { status: 404 });
      return NextResponse.json({ success: true, grant });
    }
    return NextResponse.json({ success: false, error: "Unsupported auditor package action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Auditor package action failed", blockers: error?.blockers || [] }, { status: statusFor(error) });
  }
}
