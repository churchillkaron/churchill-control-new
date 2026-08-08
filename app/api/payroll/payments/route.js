export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import preparePayrollPaymentBatch from "@/lib/payroll/payments/preparePayrollPaymentBatch";
import reconcilePayrollPaymentBatch from "@/lib/payroll/payments/reconcilePayrollPaymentBatch";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PAYMENT_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

async function paymentContext(request) {
  const user = await getServerCurrentUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,name,email,role,active_organization_id,active")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (staffError) throw staffError;

  if (!staff?.active_organization_id) {
    return {
      response: NextResponse.json(
        { success: false, error: "Active organization not found" },
        { status: 403 }
      ),
    };
  }

  const access = await requireOrganizationAccess({
    organizationId: staff.active_organization_id,
    request,
  });

  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      ),
    };
  }

  const role = normalizeRole(access.role || staff.role);

  if (!PAYMENT_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Payroll payment permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    user,
    staff,
    role,
    organizationId: staff.active_organization_id,
  };
}

async function resolveDefaultEntity(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("is_default_accounting_entity", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("Default accounting legal entity not configured");
  return data.id;
}

export async function GET(request) {
  try {
    const context = await paymentContext(request);
    if (context.response) return context.response;

    const { data: batches, error: batchError } = await supabaseAdmin
      .from("payroll_payments")
      .select("*")
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false });

    if (batchError) throw batchError;

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      role: context.role,
      payments: batches || [],
    });
  } catch (error) {
    console.error("PAYROLL_PAYMENT_LIST_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load payroll payments" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const context = await paymentContext(request);
    if (context.response) return context.response;

    const body = await request.json();
    const action = String(body?.action || "").trim().toUpperCase();

    if (action === "PREPARE") {
      const payrollMonth = String(body?.payrollMonth || "").trim();
      if (!/^\d{4}-\d{2}$/.test(payrollMonth)) {
        return NextResponse.json(
          { success: false, error: "payrollMonth must use YYYY-MM" },
          { status: 400 }
        );
      }

      const entityId = await resolveDefaultEntity(context.organizationId);

      const result = await preparePayrollPaymentBatch({
        organizationId: context.organizationId,
        entityId,
        payrollMonth,
        preparedBy: context.staff.id,
        paymentMethod: body?.paymentMethod || "bank_transfer",
      });

      return NextResponse.json({ success: true, result });
    }

    if (action === "RECONCILE") {
      const payrollPaymentId = String(body?.payrollPaymentId || "").trim();
      const paymentReference = String(body?.paymentReference || "").trim();

      if (!payrollPaymentId || !paymentReference) {
        return NextResponse.json(
          { success: false, error: "payrollPaymentId and paymentReference are required" },
          { status: 400 }
        );
      }

      const result = await reconcilePayrollPaymentBatch({
        organizationId: context.organizationId,
        payrollPaymentId,
        paymentReference,
        reconciledBy: context.staff.id,
      });

      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported payroll payment action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("PAYROLL_PAYMENT_ACTION_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to execute payroll payment action" },
      { status: 400 }
    );
  }
}
