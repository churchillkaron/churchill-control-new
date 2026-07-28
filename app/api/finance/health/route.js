export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId") || searchParams.get("organization_id"),
      request,
    });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, issues: [] },
        { status: access.status }
      );
    }

    const entityId = searchParams.get("entityId") || searchParams.get("entity_id");
    if (!entityId) throw new Error("entity_id required");
    const entity = await resolveEntity({ organizationId: access.organizationId, entityId });
    if (!entity) throw new Error("Legal entity not found in organisation");

    const periodId = searchParams.get("periodId") || searchParams.get("period_id") || null;
    let query = supabaseAdmin
      .from("journal_entries")
      .select("id, journal_number, status, source_type, source_document, source_document_id, period_id, posting_date, journal_entry_lines(debit, credit)")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entity.id)
      .limit(5000);
    if (periodId) query = query.eq("period_id", periodId);

    const { data: journals, error } = await query;
    if (error) throw error;

    const issues = [];
    let totalDebits = 0;
    let totalCredits = 0;
    let unbalancedJournals = 0;
    let missingSources = 0;
    const seen = new Set();
    let duplicateEntries = 0;

    for (const journal of journals || []) {
      const debit = (journal.journal_entry_lines || []).reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const credit = (journal.journal_entry_lines || []).reduce((sum, line) => sum + Number(line.credit || 0), 0);
      totalDebits += debit;
      totalCredits += credit;

      if (Math.abs(debit - credit) > 0.01) {
        unbalancedJournals += 1;
        issues.push({
          type: "UNBALANCED_JOURNAL",
          severity: "critical",
          entry: journal.journal_number || journal.id,
          debit: Number(debit.toFixed(2)),
          credit: Number(credit.toFixed(2)),
        });
      }

      if (!journal.source_type && !journal.source_document && !journal.source_document_id) {
        missingSources += 1;
        issues.push({
          type: "MISSING_SOURCE_EVIDENCE",
          severity: "warning",
          entry: journal.journal_number || journal.id,
        });
      }

      const duplicateKey = [journal.journal_number, journal.posting_date, journal.source_document_id].join(":");
      if (seen.has(duplicateKey)) duplicateEntries += 1;
      seen.add(duplicateKey);
    }

    const balancedTrialBalance = Math.abs(totalDebits - totalCredits) < 0.01;
    const healthScore = Math.max(0, 100 - unbalancedJournals * 15 - missingSources * 2 - duplicateEntries * 5 - (balancedTrialBalance ? 0 : 25));
    const report = {
      balancedTrialBalance,
      totalDebits: Number(totalDebits.toFixed(2)),
      totalCredits: Number(totalCredits.toFixed(2)),
      journalCount: (journals || []).length,
      unbalancedJournals,
      missingSources,
      duplicateEntries,
      healthScore,
      issues,
    };

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entity.id,
      period_id: periodId,
      report,
      issues,
      rows: issues,
    });
  } catch (error) {
    const message = error.message || "Financial health scan failed";
    return NextResponse.json(
      { success: false, error: message, issues: [] },
      { status: /required|not found/i.test(message) ? 400 : 500 }
    );
  }
}
