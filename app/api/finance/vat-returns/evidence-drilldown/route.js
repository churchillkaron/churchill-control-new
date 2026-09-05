export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { buildFinanceVatReturnPreflight } from "@/lib/finance/tax/FinanceVatReturnPreflight";
import { applyFinanceTaxCalendarToPreflight } from "@/lib/finance/tax/FinanceTaxCalendarPolicy";
import { applyFinanceVatCalculationMethodToPreflight } from "@/lib/finance/tax/FinanceVatCalculationMethodPolicy";
import { deriveFinanceTaxCloseGuidance } from "@/lib/finance/tax/FinanceTaxCloseGuidancePolicy";
import {
  FINANCE_TAX_EVIDENCE_DRILLDOWN_CONTRACT,
  FINANCE_TAX_EVIDENCE_RESOLUTION_AUTHORITY,
  buildFinanceTaxEvidenceIssuePage,
} from "@/lib/finance/tax/FinanceTaxEvidenceDrilldownPolicy";
import { loadFinanceTaxEvidencePopulation } from "@/lib/finance/tax/FinanceTaxEvidenceDrilldownRuntime";
import { buildFinanceTaxSourceNavigation } from "@/lib/finance/tax/FinanceTaxSourceNavigationPolicy";

const FULL_POPULATION_CODES = new Set([
  "OUTPUT_CODING",
  "OUTPUT_POSTING",
  "INPUT_CODING",
  "INPUT_POSTING",
  "EXCHANGE_RATES",
  "POTENTIAL_DUPLICATES",
]);

function clean(value) { return String(value ?? "").trim(); }
function upper(value) { return clean(value).toUpperCase(); }
function required(value, field) {
  const normalized = clean(value);
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}
function bounded(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
function statusFor(message) {
  const value = String(message || "");
  if (/permission denied|authentication|membership/i.test(value)) return 403;
  if (/required|not found|scope|dependency|offset|limit/i.test(value)) return 400;
  return 500;
}

function configWorkspaceTarget(issue) {
  const type = upper(issue?.source_type);
  if (type === "REGISTRATION_CONTEXT") return { workspace: "finance_configuration", record_id: issue.source_id || null, context_mutation_allowed: false };
  if (type === "VAT_RULE_CONTEXT") return { workspace: "tax_rules", record_id: issue.source_id || null, context_mutation_allowed: false };
  if (type === "TAX_CALENDAR_CONTEXT") return { workspace: "vat_returns", record_id: issue.source_id || null, context_mutation_allowed: false };
  if (type === "VAT_CALCULATION_CONTEXT") return { workspace: "vat_returns", record_id: issue.source_id || null, context_mutation_allowed: false };
  return null;
}

function exactTargetNavigation({ organizationId, entityId, vatReturnId, target, exactEvidenceId }) {
  if (!target?.record_id || target?.context_mutation_allowed !== false) return null;
  if (!exactEvidenceId || String(exactEvidenceId) !== String(target.record_id)) return null;
  return buildFinanceTaxSourceNavigation({
    organizationId,
    entityId,
    vatReturnId,
    target,
    returnPath: `/workspace/${organizationId}/finance`,
  });
}

function exactSourceNavigation({ organizationId, entityId, vatReturnId, issue }) {
  const target = issue?.workspace_target || null;
  const exactEvidenceId = issue?.source_record?.id
    || (target?.workspace === "tax_rules" ? issue?.tax_rule?.id : null)
    || (target?.workspace === "journal_entries" ? issue?.posting_journal?.id : null);
  return exactTargetNavigation({ organizationId, entityId, vatReturnId, target, exactEvidenceId });
}

function duplicateCandidateNavigation({ organizationId, entityId, vatReturnId, record }) {
  if (!record?.id) return null;
  return exactTargetNavigation({
    organizationId,
    entityId,
    vatReturnId,
    target: { workspace: "vendor_invoices", record_id: record.id, context_mutation_allowed: false },
    exactEvidenceId: record.id,
  });
}

function attachDuplicateCandidateNavigation({ organizationId, entityId, vatReturnId, item }) {
  const records = item?.source_record?.duplicate_records;
  if (!Array.isArray(records) || !records.length) return item;
  return {
    ...item,
    source_record: {
      ...item.source_record,
      duplicate_records: records.map(record => ({
        ...record,
        source_navigation: duplicateCandidateNavigation({ organizationId, entityId, vatReturnId, record }),
      })),
    },
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

    const entityId = required(searchParams.get("entityId") || searchParams.get("entity_id"), "entity_id");
    const vatReturnId = required(searchParams.get("vatReturnId") || searchParams.get("vat_return_id"), "vat_return_id");
    const dependencyCode = upper(required(searchParams.get("dependencyCode") || searchParams.get("dependency_code"), "dependency_code"));
    const offset = bounded(searchParams.get("offset"), 0, 0, 250000);
    const limit = bounded(searchParams.get("limit"), 25, 1, 50);

    const raw = await buildFinanceVatReturnPreflight({ organizationId: access.organizationId, entityId, vatReturnId });
    const calendar = applyFinanceTaxCalendarToPreflight(raw);
    const current = applyFinanceVatCalculationMethodToPreflight(calendar);
    if (current?.return?.id !== vatReturnId || current?.return?.entity_id !== entityId) {
      throw new Error("Tax evidence drill-down filing scope mismatch");
    }
    const guidance = deriveFinanceTaxCloseGuidance(current);
    const dependency = (guidance?.dependencies || []).find(item => upper(item?.code) === dependencyCode);
    if (!dependency) throw new Error("Tax dependency is no longer active in live accounting truth");

    let issues;
    let population;
    let source;
    if (FULL_POPULATION_CODES.has(dependencyCode)) {
      const full = await loadFinanceTaxEvidencePopulation({
        organizationId: access.organizationId,
        entityId,
        vatReturnId,
        dependencyCode,
        offset,
        limit,
      });
      issues = full.issues;
      population = full.population;
      source = "FULL_LIVE_FILING_POPULATION";
    } else {
      const page = buildFinanceTaxEvidenceIssuePage({ preflight: current, guidance, dependencyCode, offset, limit });
      issues = page.issues.map(item => ({ ...item, workspace_target: configWorkspaceTarget(item) }));
      population = {
        total: page.population.total,
        offset: page.population.offset,
        limit: page.population.limit,
        returned: page.population.returned,
        has_more: page.population.has_more_population,
        complete: page.population.complete,
      };
      source = "LIVE_PREFLIGHT_CONTEXT";
    }

    issues = issues.map(rawItem => {
      const item = attachDuplicateCandidateNavigation({
        organizationId: access.organizationId,
        entityId,
        vatReturnId,
        item: rawItem,
      });
      return {
        ...item,
        source_navigation: exactSourceNavigation({
          organizationId: access.organizationId,
          entityId,
          vatReturnId,
          issue: item,
        }),
      };
    });

    return NextResponse.json({
      success: true,
      contract: FINANCE_TAX_EVIDENCE_DRILLDOWN_CONTRACT,
      return_id: vatReturnId,
      entity_id: entityId,
      dependency: {
        id: dependency.id,
        code: dependency.code,
        title: dependency.title,
        detail: dependency.detail,
        next_action: dependency.next_action,
        resolution_rule: dependency.resolution_rule,
        blocking: dependency.blocking === true,
        responsibility: dependency.responsibility,
        manual_complete_allowed: false,
      },
      issues,
      population,
      source,
      legal_date: guidance?.legal_date || current?.due?.legal_date || null,
      filing_due_date: guidance?.filing_due_date || null,
      resolution_authority: FINANCE_TAX_EVIDENCE_RESOLUTION_AUTHORITY,
      mutation_authority: false,
      context_mutation_authority: false,
    });
  } catch (error) {
    const message = error?.message || "Tax evidence drill-down could not be loaded";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
