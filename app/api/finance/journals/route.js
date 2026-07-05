export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

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

    const access =
      await requireOrganizationAccess({
        organizationId: requestedOrganizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const organizationId =
      access.organizationId;

    const { data: journals, error } =
      await supabaseAdmin
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

    if (error) {
      throw error;
    }

    const formatted =
      (journals || []).map((journal) => ({
        id: journal.id,
        journal_number: journal.journal_number,
        entry_number: journal.journal_number,
        journal_type: journal.journal_type,
        posting_date: journal.posting_date,
        entry_date: journal.posting_date,
        document_date: journal.document_date,
        reference: journal.reference,
        description: journal.description,
        source_module: journal.source_module,
        source_document: journal.source_document,
        source_document_id: journal.source_document_id,
        status: journal.status,
        organization_id: journal.organization_id,
        entity_id: journal.entity_id,
        created_by: journal.created_by,
        created_at: journal.created_at,
        lines: (journal.journal_entry_lines || []).map((line) => ({
          id: line.id,
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
          description: line.description,
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
      }));

    return NextResponse.json({
      success: true,
      organizationId,
      entityId,
      count: formatted.length,
      journals: formatted,
      rows: formatted,
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
