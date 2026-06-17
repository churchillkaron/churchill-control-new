import { createServerSupabase } from "@/lib/shared/supabase/server";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  createJournalEntry,
} from "@/lib/finance/accounting/createJournalEntry";

export default async function createInvoiceMatch({
  tenant_id,
  invoice_id,
  purchase_order_id,
  goods_receipt_id,
  matched_by = "SYSTEM",
}) {

  try {

    if (!tenant_id) throw new Error("tenant_id required");
    if (!invoice_id) throw new Error("invoice_id required");
    if (!purchase_order_id) throw new Error("purchase_order_id required");
    if (!goods_receipt_id) throw new Error("goods_receipt_id required");

    const {
      data: existing,
    } = await supabaseAdmin
      .from("invoice_matches")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    if (existing) {
      throw new Error("INVOICE_ALREADY_MATCHED");
    }

    const {
      data: invoice,
      error: invoiceError,
    } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error("INVOICE_NOT_FOUND");
    }

    const {
      data: po,
      error: poError,
    } = await supabaseAdmin
      .from("purchase_orders")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("id", purchase_order_id)
      .single();

    if (poError || !po) {
      throw new Error("PURCHASE_ORDER_NOT_FOUND");
    }

    const {
      data: grn,
      error: grnError,
    } = await supabaseAdmin
      .from("goods_receipts")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("id", goods_receipt_id)
      .single();

    if (grnError || !grn) {
      throw new Error("GOODS_RECEIPT_NOT_FOUND");
    }

    if (invoice.vendor_id !== po.vendor_id || invoice.vendor_id !== grn.vendor_id) {
      throw new Error("VENDOR_MISMATCH");
    }

    if (grn.purchase_order_id && grn.purchase_order_id !== po.id) {
      throw new Error("GRN_NOT_LINKED_TO_PO");
    }

    const invoiceTotal =
      Number(invoice.total_amount || 0);

    const poTotal =
      Number(po.total_amount || 0);

    const grnTotal =
      Number(grn.total_amount || grn.received_total || 0);

    const varianceAmount =
      invoiceTotal - poTotal;

    const receivingVariance =
      invoiceTotal - grnTotal;

    const variancePercent =
      poTotal > 0
        ? (varianceAmount / poTotal) * 100
        : 0;

    const receivingVariancePercent =
      grnTotal > 0
        ? (receivingVariance / grnTotal) * 100
        : 0;

    let matchStatus = "matched";

    if (
      Math.abs(variancePercent) > 20 ||
      Math.abs(receivingVariancePercent) > 20
    ) {
      matchStatus = "blocked";
    } else if (
      Math.abs(variancePercent) > 5 ||
      Math.abs(receivingVariancePercent) > 5
    ) {
      matchStatus = "variance_warning";
    }

    const {
      data: match,
      error: matchError,
    } = await supabaseAdmin
      .from("invoice_matches")
      .insert([
        {
          tenant_id,
          invoice_id,
          purchase_order_id,
          goods_receipt_id,
          match_status: matchStatus,
          po_total: poTotal,
          grn_total: grnTotal,
          invoice_total: invoiceTotal,
          variance_amount: varianceAmount,
          variance_percent: variancePercent,
          receiving_variance_amount: receivingVariance,
          receiving_variance_percent: receivingVariancePercent,
          matched_by,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (matchError) {
      throw matchError;
    }

    // ===== GRNI CLEARING ACCOUNTING =====

    if (
      matchStatus !== "blocked"
    ) {

      const {
        data: accounts,
      } = await supabaseAdmin
        .from("chart_of_accounts")
        .select("*")
        .eq(
          "tenant_id",
          tenant_id
        );

      const inventoryGrniAccount =
        (accounts || []).find((a) =>
          ["2100", "2200"].includes(a.code)
        ) ||
        (accounts || []).find((a) =>
          String(a.name || "")
            .toLowerCase()
            .includes("grni")
        );

      const apAccount =
        (accounts || []).find((a) =>
          ["2000"].includes(a.code)
        ) ||
        (accounts || []).find((a) =>
          String(a.name || "")
            .toLowerCase()
            .includes("accounts payable")
        );

      if (
        inventoryGrniAccount &&
        apAccount
      ) {

        await createJournalEntry({

          tenantId:
            tenant_id,

          entryDate:
            new Date()
              .toISOString()
              .slice(0, 10),

          description:
            `GRNI clearing invoice ${invoice_id}`,

          sourceType:
            "invoice_match",

          sourceId:
            match.id,

          createdBy:
            matched_by,

          lines: [

            {

              account_id:
                inventoryGrniAccount.id,

              debit:
                invoiceTotal,

              credit:
                0,

              description:
                "GRNI clearing",

            },

            {

              account_id:
                apAccount.id,

              debit:
                0,

              credit:
                invoiceTotal,

              description:
                "Accounts payable recognition",

            },

          ],

        });

      }

    }

    return {
      success: true,
      match,
    };

  } catch (error) {

    return {
      success: false,
      error: error.message,
    };

  }

}
