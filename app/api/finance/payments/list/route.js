export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requestedView(searchParams) {
  return String(
    searchParams.get("capabilityId") ||
    searchParams.get("workspaceId") ||
    searchParams.get("view") ||
    "accounts_payable"
  )
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function loadReferenceMaps({ organizationId, entityId, rows }) {
  const partyIds = unique(rows.map(row => row.vendor_party_id || row.supplier_party_id));
  const invoiceIds = unique(rows.map(row => row.vendor_invoice_id));
  const payableIds = unique(rows.map(row => row.accounts_payable_id));
  const bankAccountIds = unique(rows.map(row => row.bank_account_id));

  const [partiesResult, invoicesResult, payablesResult, bankAccountsResult] =
    await Promise.all([
      partyIds.length
        ? supabaseAdmin
            .from("parties")
            .select("id, display_name, legal_name")
            .eq("organization_id", organizationId)
            .in("id", partyIds)
        : Promise.resolve({ data: [], error: null }),
      invoiceIds.length
        ? supabaseAdmin
            .from("vendor_invoices")
            .select("id, invoice_number, reference_number, vendor_party_id, supplier_party_id")
            .eq("organization_id", organizationId)
            .eq("entity_id", entityId)
            .in("id", invoiceIds)
        : Promise.resolve({ data: [], error: null }),
      payableIds.length
        ? supabaseAdmin
            .from("accounts_payable")
            .select("id, vendor_invoice_id, vendor_party_id, supplier_party_id, invoice_number, due_date")
            .eq("organization_id", organizationId)
            .eq("entity_id", entityId)
            .in("id", payableIds)
        : Promise.resolve({ data: [], error: null }),
      bankAccountIds.length
        ? supabaseAdmin
            .from("bank_accounts")
            .select("id, account_name, bank_name, account_number")
            .eq("organization_id", organizationId)
            .eq("entity_id", entityId)
            .in("id", bankAccountIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  for (const result of [partiesResult, invoicesResult, payablesResult, bankAccountsResult]) {
    if (result.error) throw result.error;
  }

  return {
    parties: new Map((partiesResult.data || []).map(row => [row.id, row])),
    invoices: new Map((invoicesResult.data || []).map(row => [row.id, row])),
    payables: new Map((payablesResult.data || []).map(row => [row.id, row])),
    bankAccounts: new Map((bankAccountsResult.data || []).map(row => [row.id, row])),
  };
}

function partyName(party) {
  return party?.display_name || party?.legal_name || null;
}

export async function GET(request) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    const requestedEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    if (!requestedEntityId) {
      return NextResponse.json(
        { success: false, error: "entity_id required", rows: [] },
        { status: 400 }
      );
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
    });

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation", rows: [] },
        { status: 404 }
      );
    }

    const view = requestedView(searchParams);

    if (view === "vendor_payments") {
      const { data, error } = await supabaseAdmin
        .from("vendor_payments")
        .select("*")
        .eq("organization_id", access.organizationId)
        .eq("entity_id", entity.id)
        .order("paid_at", { ascending: false });

      if (error) throw error;

      const rawPayments = data || [];
      const maps = await loadReferenceMaps({
        organizationId: access.organizationId,
        entityId: entity.id,
        rows: rawPayments,
      });

      const payments = rawPayments.map(payment => {
        const payable = maps.payables.get(payment.accounts_payable_id) || null;
        const invoiceId = payment.vendor_invoice_id || payable?.vendor_invoice_id || null;
        const invoice = maps.invoices.get(invoiceId) || null;
        const partyId =
          payment.vendor_party_id ||
          payment.supplier_party_id ||
          payable?.vendor_party_id ||
          payable?.supplier_party_id ||
          invoice?.vendor_party_id ||
          invoice?.supplier_party_id ||
          null;
        const party = maps.parties.get(partyId) || null;
        const bankAccount = maps.bankAccounts.get(payment.bank_account_id) || null;

        return {
          ...payment,
          vendor_name: payment.vendor_name || partyName(party),
          invoice_number:
            payment.invoice_number ||
            payable?.invoice_number ||
            invoice?.invoice_number ||
            invoice?.reference_number ||
            null,
          due_date: payment.due_date || payable?.due_date || null,
          bank_account_name:
            bankAccount?.account_name ||
            bankAccount?.bank_name ||
            null,
          bank_account_number: bankAccount?.account_number || null,
          status: payment.status || "POSTED",
        };
      });

      return NextResponse.json({
        success: true,
        organization_id: access.organizationId,
        entity_id: entity.id,
        view,
        payments,
        payables: payments,
        rows: payments,
      });
    }

    const { data, error } = await supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entity.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rawPayables = data || [];
    const maps = await loadReferenceMaps({
      organizationId: access.organizationId,
      entityId: entity.id,
      rows: rawPayables,
    });

    const payables = rawPayables.map(payable => {
      const invoice = maps.invoices.get(payable.vendor_invoice_id) || null;
      const partyId =
        payable.vendor_party_id ||
        payable.supplier_party_id ||
        invoice?.vendor_party_id ||
        invoice?.supplier_party_id ||
        null;
      const party = maps.parties.get(partyId) || null;

      return {
        ...payable,
        vendor_name: payable.vendor_name || partyName(party),
        invoice_number:
          payable.invoice_number ||
          invoice?.invoice_number ||
          invoice?.reference_number ||
          null,
      };
    });

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entity.id,
      view: "accounts_payable",
      payables,
      rows: payables,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Payments list failed", rows: [] },
      { status: error.status || 500 }
    );
  }
}
