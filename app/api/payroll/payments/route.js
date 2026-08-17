export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  preparePayrollPaymentBatch,
  reconcilePayrollPaymentBatch,
} from "@/lib/people/payroll";
import { resolveActiveLegalEntitySelection } from "@/lib/platform/runtime/resolveActiveLegalEntitySelection";
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

function normalizeCurrency(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeCountry(value) {
  return String(value || "").trim().toUpperCase();
}

function contextResponse(context) {
  return NextResponse.json(
    {
      success: false,
      error: context.error,
      code: context.code,
      availableOrganizationIds: context.availableOrganizationIds || [],
    },
    { status: context.status || 403 }
  );
}

async function paymentContext(request) {
  const context = await resolveAuthenticatedStaffContext({ request });

  if (!context.success) {
    return { response: contextResponse(context) };
  }

  const role = normalizeRole(context.role || context.staff?.role);

  if (!PAYMENT_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Payroll payment permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    user: context.user,
    staff: context.staff,
    role,
    organizationId: context.organizationId,
  };
}

function matchingPaymentMethods({ methods, entity }) {
  const entityCurrency = normalizeCurrency(entity?.currency);
  const entityCountry = normalizeCountry(entity?.country);

  return (methods || []).filter((method) => {
    const methodCurrency = normalizeCurrency(method.currency);
    const methodCountry = normalizeCountry(method.country);

    return (
      methodCurrency === entityCurrency &&
      (!methodCountry || methodCountry === entityCountry)
    );
  });
}

export async function GET(request) {
  try {
    const context = await paymentContext(request);
    if (context.response) return context.response;

    const url = new URL(request.url);
    const requestedEntityId = url.searchParams.get("entityId") || null;
    const { entity, entities } = await resolveActiveLegalEntitySelection({
      request,
      organizationId: context.organizationId,
      entityId: requestedEntityId,
    });

    const [batchResult, payoutResult, lockedResult, paymentMethodResult] = await Promise.all([
      supabaseAdmin
        .from("payroll_payments")
        .select("*")
        .eq("organization_id", context.organizationId)
        .eq("entity_id", entity.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("payroll_payouts")
        .select("*")
        .eq("organization_id", context.organizationId)
        .eq("entity_id", entity.id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("payroll_records")
        .select("id,staff_id,party_id,staff_name,role,payroll_month,final_salary,payout_status,status")
        .eq("organization_id", context.organizationId)
        .eq("entity_id", entity.id)
        .eq("status", "LOCKED")
        .order("payroll_month", { ascending: false })
        .order("staff_name", { ascending: true }),
      supabaseAdmin
        .from("organization_payment_config")
        .select("payment_method,country,currency,enabled")
        .eq("organization_id", context.organizationId)
        .eq("enabled", true)
        .order("payment_method", { ascending: true }),
    ]);

    if (batchResult.error) throw batchResult.error;
    if (payoutResult.error) throw payoutResult.error;
    if (lockedResult.error) throw lockedResult.error;
    if (paymentMethodResult.error) throw paymentMethodResult.error;

    const payoutsByBatch = new Map();

    for (const payout of payoutResult.data || []) {
      const list = payoutsByBatch.get(payout.payroll_payment_id) || [];
      list.push(payout);
      payoutsByBatch.set(payout.payroll_payment_id, list);
    }

    const payments = (batchResult.data || []).map((batch) => ({
      ...batch,
      payouts: payoutsByBatch.get(batch.id) || [],
    }));

    const lockedPayroll = lockedResult.data || [];
    const lockedMonths = Array.from(
      new Set(lockedPayroll.map((record) => record.payroll_month).filter(Boolean))
    );
    const paymentMethods = matchingPaymentMethods({
      methods: paymentMethodResult.data || [],
      entity,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      role: context.role,
      entity,
      entities,
      payments,
      lockedPayroll,
      lockedMonths,
      paymentMethods,
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
    const { entity } = await resolveActiveLegalEntitySelection({
      request,
      organizationId: context.organizationId,
      entityId: body?.entityId || null,
    });

    if (action === "PREPARE") {
      const payrollMonth = String(body?.payrollMonth || "").trim();
      if (!/^\d{4}-\d{2}$/.test(payrollMonth)) {
        return NextResponse.json(
          { success: false, error: "payrollMonth must use YYYY-MM" },
          { status: 400 }
        );
      }

      const result = await preparePayrollPaymentBatch({
        organizationId: context.organizationId,
        entityId: entity.id,
        payrollMonth,
        preparedBy: context.staff.id,
        paymentMethod: body?.paymentMethod || "bank_transfer",
      });

      return NextResponse.json({ success: true, entityId: entity.id, result });
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

      const { data: scopedPayment, error: scopedPaymentError } = await supabaseAdmin
        .from("payroll_payments")
        .select("id,entity_id")
        .eq("id", payrollPaymentId)
        .eq("organization_id", context.organizationId)
        .eq("entity_id", entity.id)
        .maybeSingle();

      if (scopedPaymentError) throw scopedPaymentError;
      if (!scopedPayment) {
        return NextResponse.json(
          {
            success: false,
            error: "Payroll payment was not found for the selected legal entity",
            code: "PAYROLL_PAYMENT_ENTITY_MISMATCH",
          },
          { status: 404 }
        );
      }

      const result = await reconcilePayrollPaymentBatch({
        organizationId: context.organizationId,
        entityId: entity.id,
        payrollPaymentId,
        paymentReference,
        reconciledBy: context.staff.id,
      });

      return NextResponse.json({ success: true, entityId: entity.id, result });
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
