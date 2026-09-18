export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import {
  getCustomerInvoiceEInvoiceReadiness,
  refreshCustomerInvoiceEInvoiceStatus,
  submitCustomerInvoiceEInvoice,
} from "@/lib/finance/e-invoicing/runtime/FinanceEInvoiceRuntime";

const text = (value) => String(value ?? "").trim();
function errorStatus(message) {
  if (/permission denied/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/PREFLIGHT|REJECTED_SOURCE_UNCHANGED|REQUIRED|INACTIVE|CREDENTIAL|ENDPOINT/i.test(message)) return 409;
  return 500;
}

async function scope(request, params, body = {}) {
  const resolved = await params;
  const url = new URL(request.url);
  const organizationId = text(body.organizationId || body.organization_id || url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
  const entityId = text(body.entityId || body.entity_id || url.searchParams.get("entityId") || url.searchParams.get("entity_id"));
  const invoiceId = text(resolved?.invoiceId);
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { response: NextResponse.json({ success: false, error: access.error }, { status: access.status }) };
  await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.receivables.manage", fullAccess: access.permissions?.includes("*") === true });
  const entity = entityId ? await resolveEntity({ organizationId: access.organizationId, entityId }) : null;
  if (!entity) return { response: NextResponse.json({ success: false, error: "Legal entity required" }, { status: 400 }) };
  if (!invoiceId) return { response: NextResponse.json({ success: false, error: "invoiceId required" }, { status: 400 }) };
  return { access, entity, invoiceId };
}

export async function GET(request, { params }) {
  try {
    const ctx = await scope(request, params);
    if (ctx.response) return ctx.response;
    const result = await getCustomerInvoiceEInvoiceReadiness({ organizationId: ctx.access.organizationId, entityId: ctx.entity.id, invoiceId: ctx.invoiceId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error?.message || "Unable to load e-Invoice readiness";
    return NextResponse.json({ success: false, error: message, blockers: error?.blockers || [] }, { status: errorStatus(message) });
  }
}

export async function POST(request, { params }) {
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await scope(request, params, body);
    if (ctx.response) return ctx.response;
    const action = text(body.action || "submit").toLowerCase();
    if (action === "status") {
      const result = await refreshCustomerInvoiceEInvoiceStatus({ organizationId: ctx.access.organizationId, entityId: ctx.entity.id, invoiceId: ctx.invoiceId, transmissionId: text(body.transmissionId || body.transmission_id) || null });
      return NextResponse.json(result);
    }
    if (action !== "submit") return NextResponse.json({ success: false, error: "Unsupported e-Invoice action" }, { status: 400 });
    const origin = new URL(request.url).origin;
    const result = await submitCustomerInvoiceEInvoice({ organizationId: ctx.access.organizationId, entityId: ctx.entity.id, invoiceId: ctx.invoiceId, actorId: ctx.access.staff?.id || null, callbackBaseUrl: origin });
    return NextResponse.json(result);
  } catch (error) {
    const message = error?.message || "e-Invoice action failed";
    return NextResponse.json({ success: false, error: message, blockers: error?.blockers || [] }, { status: errorStatus(message) });
  }
}
