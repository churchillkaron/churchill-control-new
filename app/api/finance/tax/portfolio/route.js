export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { evaluateFinanceVatSettlement, normalizeFinanceVatSettlement } from "@/lib/finance/tax/FinanceVatSettlementPolicy";
import { rankFinanceTaxPortfolioRow, summarizeFinanceTaxPortfolio } from "@/lib/finance/tax/FinanceTaxPortfolioPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CHUNK_SIZE = 250;

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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId") || searchParams.get("organization_id"),
      request,
    });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    await requireFinanceWorkspacePermission({ capabilityId: "vat_returns", operation: "read", access });

    const [{ data: returns, error: returnsError }, { data: entities, error: entitiesError }, { data: configurations, error: configurationError }] = await Promise.all([
      supabaseAdmin.from("finance_vat_returns").select("*")
        .eq("organization_id", access.organizationId)
        .order("filing_due_date", { ascending: true })
        .order("period_end", { ascending: false }),
      supabaseAdmin.from("legal_entities").select("id,code,legal_name,display_name,country,currency")
        .eq("organization_id", access.organizationId),
      supabaseAdmin.from("finance_tax_close_configurations").select("*")
        .eq("organization_id", access.organizationId).ilike("tax_type", "VAT"),
    ]);
    if (returnsError) throw new Error(returnsError.message);
    if (entitiesError) throw new Error(entitiesError.message);
    if (configurationError) throw new Error(configurationError.message);

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

    const [journals, bankTransactions] = await Promise.all([
      fetchByIds({ table: "journal_entries", ids: journalIds, organizationId: access.organizationId }),
      fetchByIds({ table: "bank_transactions", ids: bankTransactionIds, organizationId: access.organizationId }),
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

    const today = new Date().toISOString().slice(0, 10);
    const rows = returnRows.map(vatReturn => {
      const settlement = String(vatReturn.status || "").toUpperCase() === "SUBMITTED"
        ? evaluateFinanceVatSettlement({
            vatReturn,
            configuration: configurationMap.get(vatReturn.entity_id) || null,
            journalRows: journalsByEntity.get(vatReturn.entity_id) || [],
            bankTransactionRows: banksByEntity.get(vatReturn.entity_id) || [],
          })
        : null;
      return rankFinanceTaxPortfolioRow({
        vatReturn,
        entity: entityMap.get(vatReturn.entity_id) || null,
        settlement,
        today,
      });
    }).sort((left, right) => right.priority - left.priority || String(left.filing_due_date || "9999").localeCompare(String(right.filing_due_date || "9999")) || String(left.entity_name).localeCompare(String(right.entity_name)));

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      as_of: today,
      summary: summarizeFinanceTaxPortfolio(rows),
      rows,
    });
  } catch (error) {
    const message = error?.message || "Tax portfolio control tower could not be loaded";
    const status = /permission denied|authentication|membership/i.test(message) ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
