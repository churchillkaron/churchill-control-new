export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { evaluateFinanceVatSettlement, normalizeFinanceVatSettlement } from "@/lib/finance/tax/FinanceVatSettlementPolicy";
import {
  buildFinanceTaxDependencyPortfolioRows,
  rankFinanceTaxPortfolioRow,
  summarizeFinanceTaxDependencyPortfolio,
  summarizeFinanceTaxPortfolio,
} from "@/lib/finance/tax/FinanceTaxPortfolioPolicy";
import { buildFinanceVatReturnPreflight } from "@/lib/finance/tax/FinanceVatReturnPreflight";
import { applyFinanceTaxCalendarToPreflight, getFinanceTaxLegalClock } from "@/lib/finance/tax/FinanceTaxCalendarPolicy";
import { applyFinanceVatCalculationMethodToPreflight } from "@/lib/finance/tax/FinanceVatCalculationMethodPolicy";
import { deriveFinanceTaxCloseGuidance } from "@/lib/finance/tax/FinanceTaxCloseGuidancePolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CHUNK_SIZE = 250;
const PREFLIGHT_CONCURRENCY = 3;

function chunks(values, size = CHUNK_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function fetchByIds({ table, ids, organizationId }) {
  if (!ids.length) return [];
  const rows = [];
  for (const group of chunks([...new Set(ids)])) {
    const { data, error } = await supabaseAdmin.from(table).select("*")
      .eq("organization_id", organizationId).in("id", group);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }
  return rows;
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const input = Array.isArray(values) ? values : [];
  const result = new Array(input.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < input.length) {
      const index = nextIndex;
      nextIndex += 1;
      result[index] = await mapper(input[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, input.length) }, () => worker()));
  return result;
}

function failedGuidance(vatReturn, error, legalDate) {
  const dueDate = String(vatReturn?.filing_due_date || "").slice(0, 10) || null;
  return {
    state: "BLOCKED",
    filing_due_date: dueDate,
    legal_date: legalDate,
    days_remaining: null,
    overdue: false,
    dependencies: [{
      id: `VAT:${vatReturn.id}:LIVE_PREFLIGHT_UNAVAILABLE`,
      code: "LIVE_PREFLIGHT_UNAVAILABLE",
      title: "Restore live Tax evidence check",
      detail: error?.message || "The portfolio could not rebuild live Tax evidence for this filing.",
      next_action: "Open the filing and restore the live Tax preflight before relying on portfolio readiness.",
      resolution_rule: "Resolved only when the exact filing can rebuild governed live Tax preflight successfully.",
      truth_state: "OPEN_BLOCKER",
      blocking: true,
      priority: 0,
      responsibility: "ACCOUNTANT",
      owner_role: "PREPARER",
      client_request_recommended: false,
      communication_mode: "NONE",
      filing_due_date: dueDate,
      days_remaining: null,
      evidence_count: 0,
      evidence_preview: [],
      manual_complete_allowed: false,
    }],
    counts: { total: 1, blocking: 1, warnings: 0, client_evidence: 0, accountant: 1 },
    truth_rule: "Portfolio readiness failed closed because live Tax evidence could not be rebuilt.",
    communication_rule: "No client communication is generated from an unavailable preflight.",
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId") || searchParams.get("organization_id"),
      request,
    });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    await requireFinanceWorkspacePermission({ capabilityId: "vat_returns", operation: "read", access });

    const [
      { data: returns, error: returnsError },
      { data: entities, error: entitiesError },
      { data: configurations, error: configurationError },
      { data: envelopes, error: envelopesError },
    ] = await Promise.all([
      supabaseAdmin.from("finance_vat_returns").select("*")
        .eq("organization_id", access.organizationId)
        .order("filing_due_date", { ascending: true })
        .order("period_end", { ascending: false }),
      supabaseAdmin.from("legal_entities").select("id,code,legal_name,display_name,country,currency")
        .eq("organization_id", access.organizationId),
      supabaseAdmin.from("finance_tax_close_configurations").select("*")
        .eq("organization_id", access.organizationId).ilike("tax_type", "VAT"),
      supabaseAdmin.from("finance_tax_dependency_work_envelopes")
        .select("vat_return_id,dependency_code,assigned_to,target_at,acknowledged_at,note,client_request_id")
        .eq("organization_id", access.organizationId),
    ]);
    if (returnsError) throw new Error(returnsError.message);
    if (entitiesError) throw new Error(entitiesError.message);
    if (configurationError) throw new Error(configurationError.message);
    if (envelopesError) throw new Error(envelopesError.message);

    const returnRows = returns || [];
    const entityMap = new Map((entities || []).map(row => [row.id, row]));
    const configurationMap = new Map((configurations || []).map(row => [row.entity_id, row]));

    const journalIds = [];
    const bankTransactionIds = [];
    for (const vatReturn of returnRows) {
      const settlement = normalizeFinanceVatSettlement(vatReturn);
      journalIds.push(...settlement.liability_events.map(row => row.journal_entry_id).filter(Boolean));
      journalIds.push(...settlement.cash_events.map(row => row.journal_entry_id).filter(Boolean));
      bankTransactionIds.push(...settlement.cash_events.map(row => row.bank_transaction_id).filter(Boolean));
    }

    const clientRequestIds = (envelopes || []).map(row => row.client_request_id).filter(Boolean);
    const [journals, bankTransactions, clientRequests] = await Promise.all([
      fetchByIds({ table: "journal_entries", ids: journalIds, organizationId: access.organizationId }),
      fetchByIds({ table: "bank_transactions", ids: bankTransactionIds, organizationId: access.organizationId }),
      fetchByIds({ table: "accounting_client_requests", ids: clientRequestIds, organizationId: access.organizationId }),
    ]);

    const journalsByEntity = new Map();
    for (const row of journals) {
      const list = journalsByEntity.get(row.entity_id) || [];
      list.push(row);
      journalsByEntity.set(row.entity_id, list);
    }
    const banksByEntity = new Map();
    for (const row of bankTransactions) {
      const list = banksByEntity.get(row.entity_id) || [];
      list.push(row);
      banksByEntity.set(row.entity_id, list);
    }

    const now = new Date();
    const rows = returnRows.map(vatReturn => {
      const settlement = String(vatReturn.status || "").toUpperCase() === "SUBMITTED"
        ? evaluateFinanceVatSettlement({
            vatReturn,
            configuration: configurationMap.get(vatReturn.entity_id) || null,
            journalRows: journalsByEntity.get(vatReturn.entity_id) || [],
            bankTransactionRows: banksByEntity.get(vatReturn.entity_id) || [],
          })
        : null;
      const legalClock = getFinanceTaxLegalClock({ jurisdictionCode: vatReturn.jurisdiction_code, now });
      return rankFinanceTaxPortfolioRow({
        vatReturn,
        entity: entityMap.get(vatReturn.entity_id) || null,
        settlement,
        today: legalClock.legal_date,
      });
    }).sort((left, right) => right.priority - left.priority || String(left.filing_due_date || "9999").localeCompare(String(right.filing_due_date || "9999")) || String(left.entity_name).localeCompare(String(right.entity_name)));

    const openReturns = returnRows.filter(row => String(row.status || "").toUpperCase() !== "SUBMITTED");
    const guidanceResults = await mapWithConcurrency(openReturns, PREFLIGHT_CONCURRENCY, async vatReturn => {
      const legalClock = getFinanceTaxLegalClock({ jurisdictionCode: vatReturn.jurisdiction_code, now });
      try {
        const raw = await buildFinanceVatReturnPreflight({
          organizationId: access.organizationId,
          entityId: vatReturn.entity_id,
          vatReturnId: vatReturn.id,
        });
        const calendar = applyFinanceTaxCalendarToPreflight(raw, { now });
        const current = applyFinanceVatCalculationMethodToPreflight(calendar);
        return [vatReturn.id, deriveFinanceTaxCloseGuidance(current)];
      } catch (error) {
        return [vatReturn.id, failedGuidance(vatReturn, error, legalClock.legal_date)];
      }
    });
    const guidanceByReturnId = new Map(guidanceResults);
    const dependencyRows = buildFinanceTaxDependencyPortfolioRows({
      filingRows: rows,
      guidanceByReturnId,
      envelopes: envelopes || [],
      clientRequests,
      currentUserId: access.user?.id || null,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      current_user_id: access.user?.id || null,
      as_of: now.toISOString(),
      scope: "AUTHORIZED_ORGANIZATION_LEGAL_ENTITIES",
      resolution_authority: "LIVE_TAX_PREFLIGHT_ONLY",
      summary: summarizeFinanceTaxPortfolio(rows),
      dependency_summary: summarizeFinanceTaxDependencyPortfolio(dependencyRows),
      dependency_rows: dependencyRows,
      rows,
    });
  } catch (error) {
    const message = error?.message || "Tax portfolio control tower could not be loaded";
    const status = /permission denied|authentication|membership/i.test(message) ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
