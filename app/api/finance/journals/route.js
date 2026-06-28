import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const requestedOrganizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    if (!entityId) {
      return NextResponse.json(
        {
          success: false,
          error: "entityId required",
        },
        { status: 400 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
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
            code,
            name,
            category
          )
        )
      `)
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      throw error;
    }

    const formatted = (journals || []).map((journal) => ({
      id: journal.id,
      entry_number: journal.entry_number,
      entry_date: journal.entry_date,
      posting_date: journal.posting_date,
      description: journal.description,
      source_type: journal.source_type,
      source_id: journal.source_id,
      status: journal.status,
      entity_id: journal.entity_id,
      created_by: journal.created_by,
      created_at: journal.created_at,
      lines: (journal.journal_entry_lines || []).map((line) => ({
        id: line.id,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        description: line.description,
        entity_id: line.entity_id,
        account: {
          id: line.chart_of_accounts?.id,
          code: line.chart_of_accounts?.code,
          name: line.chart_of_accounts?.name,
          category: line.chart_of_accounts?.category,
        },
      })),
    }));

    return NextResponse.json({
      success: true,
      organizationId,
      entityId,
      count: formatted.length,
      journals: formatted,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
