export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function byId(rows) {
  return new Map((rows || []).map(row => [row.id, row]));
}

export async function GET(request) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const requestedOrganizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const requestedEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      null;

    const entity = requestedEntityId
      ? await resolveEntity({
          organizationId: access.organizationId,
          entityId: requestedEntityId,
        })
      : null;

    if (requestedEntityId && !entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation" },
        { status: 404 }
      );
    }

    const scoped = (table, orderColumn = "created_at") => {
      let query = supabaseAdmin
        .from(table)
        .select("*")
        .eq("organization_id", access.organizationId)
        .order(orderColumn, { ascending: false });

      if (entity?.id) {
        query = query.eq("entity_id", entity.id);
      }

      return query;
    };

    const [invoiceResult, poResult, receiptResult, matchResult] =
      await Promise.all([
        scoped("vendor_invoices", "invoice_date"),
        scoped("purchase_orders"),
        scoped("goods_receipts", "received_date"),
        scoped("invoice_matches"),
      ]);

    for (const result of [invoiceResult, poResult, receiptResult, matchResult]) {
      if (result.error) throw result.error;
    }

    const invoices = invoiceResult.data || [];
    const purchaseOrders = poResult.data || [];
    const goodsReceipts = receiptResult.data || [];
    const storedMatches = matchResult.data || [];

    const purchaseOrderById = byId(purchaseOrders);
    const receiptById = byId(goodsReceipts);
    const matchByInvoiceId = new Map();

    for (const match of storedMatches) {
      const invoiceId =
        match.vendor_invoice_id ||
        match.invoice_id ||
        match.supplier_invoice_id ||
        null;
      if (invoiceId) matchByInvoiceId.set(invoiceId, match);
    }

    const matches = invoices.map(invoice => {
      const stored = matchByInvoiceId.get(invoice.id) || null;
      const purchaseOrderId =
        stored?.purchase_order_id ||
        invoice.purchase_order_id ||
        invoice.po_id ||
        null;
      const goodsReceiptId =
        stored?.goods_receipt_id ||
        stored?.receipt_id ||
        invoice.goods_receipt_id ||
        null;
      const purchaseOrder = purchaseOrderById.get(purchaseOrderId) || null;
      const goodsReceipt = receiptById.get(goodsReceiptId) || null;

      const status =
        stored?.status ||
        (purchaseOrderId && goodsReceiptId
          ? "READY_FOR_MATCH"
          : purchaseOrderId
            ? "RECEIPT_REQUIRED"
            : "PURCHASE_ORDER_REQUIRED");

      return {
        ...(stored || {}),
        id: stored?.id || `vendor-invoice:${invoice.id}`,
        vendor_invoice_id: invoice.id,
        invoice_number:
          invoice.invoice_number ||
          invoice.vendor_invoice_number ||
          invoice.reference_number ||
          invoice.id,
        vendor_name:
          invoice.vendor_name ||
          invoice.supplier_name ||
          null,
        invoice_date: invoice.invoice_date || null,
        due_date: invoice.due_date || null,
        invoice_amount:
          invoice.total_amount ??
          invoice.amount ??
          invoice.invoice_total ??
          null,
        currency_code: invoice.currency_code || invoice.currency || null,
        purchase_order_id: purchaseOrderId,
        purchase_order_number:
          purchaseOrder?.purchase_order_number ||
          purchaseOrder?.po_number ||
          purchaseOrder?.order_number ||
          null,
        goods_receipt_id: goodsReceiptId,
        receipt_number:
          goodsReceipt?.receipt_number ||
          goodsReceipt?.grn_number ||
          null,
        status,
        has_purchase_order: Boolean(purchaseOrderId),
        has_goods_receipt: Boolean(goodsReceiptId),
      };
    });

    return NextResponse.json({
      success: true,
      entityId: entity?.id || null,
      invoices,
      purchaseOrders,
      goodsReceipts,
      storedMatches,
      matches,
      rows: matches,
      summary: {
        invoices: invoices.length,
        purchaseOrders: purchaseOrders.length,
        goodsReceipts: goodsReceipts.length,
        formalMatches: storedMatches.length,
        exceptions: matches.filter(row => row.status !== "MATCHED").length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}
