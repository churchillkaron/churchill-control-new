export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const organizationId = access.organizationId;
    const [{ data: transactions, error }, { data: entities, error: entityError }] =
      await Promise.all([
        supabaseAdmin
          .from("intercompany_transactions")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("legal_entities")
          .select("id, code, legal_name, display_name, currency, base_currency")
          .eq("organization_id", organizationId),
      ]);

    if (error) throw error;
    if (entityError) throw entityError;

    const entityById = new Map(
      (entities || []).map((entity) => [String(entity.id), entity])
    );

    const rows = (transactions || []).map((transaction) => {
      const from = entityById.get(String(transaction.from_legal_entity_id || ""));
      const to = entityById.get(String(transaction.to_legal_entity_id || ""));
      const status = upper(transaction.status) || "DRAFT";
      const reconciliationStatus =
        upper(transaction.reconciliation_status) || "UNRECONCILED";

      return {
        ...transaction,
        status,
        reconciliation_status: reconciliationStatus,
        transaction_number:
          transaction.transaction_number || transaction.reference_number || transaction.id,
        from_entity:
          from?.display_name || from?.legal_name || from?.code || "Source Entity",
        from_entity_code: from?.code || null,
        to_entity:
          to?.display_name || to?.legal_name || to?.code || "Destination Entity",
        to_entity_code: to?.code || null,
        currency_code:
          transaction.transaction_currency || transaction.currency_code || transaction.currency,
        outstanding_amount: Number(
          transaction.outstanding_amount ?? transaction.amount ?? 0
        ),
        settled_amount: Number(transaction.settled_amount || 0),
      };
    });

    return NextResponse.json({
      success: true,
      organization_id: organizationId,
      transactions: rows,
      rows,
      pending: rows.filter((row) => ["DRAFT", "PENDING", "POSTED"].includes(row.status)).length,
      reconciled: rows.filter((row) => row.reconciliation_status === "MATCHED").length,
      partiallySettled: rows.filter((row) => row.status === "PARTIALLY_SETTLED").length,
      settled: rows.filter((row) => row.status === "SETTLED").length,
      metrics: {
        total: rows.length,
        pending: rows.filter((row) => ["DRAFT", "PENDING", "POSTED"].includes(row.status)).length,
        reconciled: rows.filter((row) => row.reconciliation_status === "MATCHED").length,
        settled: rows.filter((row) => row.status === "SETTLED").length,
        outstandingAmount: rows.reduce(
          (sum, row) => sum + Number(row.outstanding_amount || 0),
          0
        ),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Intercompany load failed", rows: [] },
      { status: 500 }
    );
  }
}
