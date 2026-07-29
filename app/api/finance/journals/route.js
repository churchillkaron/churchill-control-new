export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function amount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function summaryText(journal, totalDebit, lineCount) {
  const type = String(journal.journal_type || "GENERAL")
    .replace(/_/g, " ");
  const narrative =
    journal.description ||
    journal.reference ||
    journal.source_document ||
    journal.source_module ||
    "No description";
  const currency = journal.currency_code || "";
  const total = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(totalDebit);

  return [
    type,
    narrative,
    `${lineCount} line${lineCount === 1 ? "" : "s"}`,
    currency ? `${currency} ${total}` : total,
  ].filter(Boolean).join(" · ");
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const requestedOrganizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    if (!requestedOrganizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId required" },
        { status: 400 }
      );
    }

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "entityId required" },
        { status: 400 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const organizationId = access.organizationId;

    const { data: journals, error } = await supabaseAdmin
      .from("journal_entries")
      .select(`
        *,
        journal_entry_lines (
          *,
          chart_of_accounts (
            id,
            account_code,
            account_name,
            account_category,
            account_type
          )
        )
      `)
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .order("posting_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const formatted = (journals || []).map(journal => {
      const sourceLines = journal.journal_entry_lines || [];
      const totalDebit = sourceLines.reduce(
        (total, line) => total + amount(line.debit),
        0
      );
      const totalCredit = sourceLines.reduce(
        (total, line) => total + amount(line.credit),
        0
      );
      const lineCount = sourceLines.length;
      const reversed = journal.reversed === true;

      return {
        id: journal.id,
        journal_id: journal.id,
        journal_number: journal.journal_number,
        entry_number: journal.entry_number || journal.journal_number,
        journal_type: journal.journal_type,
        posting_date: journal.posting_date,
        entry_date: journal.entry_date || journal.posting_date,
        document_date: journal.document_date,
        reference: journal.reference,
        description: journal.description,
        source_module: journal.source_module,
        source_document: journal.source_document,
        source_document_id: journal.source_document_id,
        status: journal.status,
        reversal_status: journal.reversal_status || null,
        reversal_reason: journal.reversal_reason || null,
        reversal_requested_by: journal.reversal_requested_by || null,
        reversal_requested_at: journal.reversal_requested_at || null,
        reversal_journal_id: journal.reversal_journal_id || null,
        reversed,
        reversed_at: journal.reversed_at || null,
        reversed_by: journal.reversed_by || null,
        organization_id: journal.organization_id,
        entity_id: journal.entity_id,
        period_id: journal.period_id || null,
        currency_code: journal.currency_code || null,
        exchange_rate: amount(journal.exchange_rate || 1),
        created_by: journal.created_by,
        created_at: journal.created_at,
        updated_at: journal.updated_at || null,
        line_count: lineCount,
        total_debit: totalDebit,
        total_credit: totalCredit,
        total_amount: totalDebit,
        is_active: !reversed,
        code: summaryText(journal, totalDebit, lineCount),
        lines: sourceLines.map(line => ({
          id: line.id,
          account_id: line.account_id,
          account_code: line.chart_of_accounts?.account_code || null,
          account_name: line.chart_of_accounts?.account_name || null,
          debit: amount(line.debit),
          credit: amount(line.credit),
          description: line.description,
          cost_center_id: line.cost_center_id || null,
          department_id: line.department_id || null,
          project_id: line.project_id || null,
          organization_id: line.organization_id,
          entity_id: line.entity_id,
          account: {
            id: line.chart_of_accounts?.id,
            code: line.chart_of_accounts?.account_code,
            name: line.chart_of_accounts?.account_name,
            category: line.chart_of_accounts?.account_category,
            type: line.chart_of_accounts?.account_type,
          },
        })),
      };
    });

    return NextResponse.json({
      success: true,
      organizationId,
      entityId,
      count: formatted.length,
      journals: formatted,
      rows: formatted,
      metrics: {
        journal_count: formatted.length,
        unreversed_count: formatted.filter(journal => journal.is_active).length,
        total_posted_value: formatted.reduce(
          (total, journal) => total + amount(journal.total_amount),
          0
        ),
      },
    });
  } catch (error) {
    console.error("finance journals GET", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Journals load failed",
      },
      { status: 500 }
    );
  }
}
