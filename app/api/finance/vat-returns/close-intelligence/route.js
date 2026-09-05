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
  FINANCE_TAX_CLOSE_INTELLIGENCE_CONTRACT,
  FINANCE_TAX_CLOSE_INTELLIGENCE_SYSTEM,
  FINANCE_TAX_CLOSE_RESOLUTION_AUTHORITY,
  buildDeterministicFinanceTaxCloseBrief,
  buildFinanceTaxCloseIntelligenceEvidence,
  validateFinanceTaxCloseIntelligenceResult,
} from "@/lib/finance/tax/FinanceTaxCloseIntelligencePolicy";
import { runStructuredIntelligenceSupervisor } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";

function clean(value) {
  return String(value ?? "").trim();
}

function required(value, field) {
  const normalized = clean(value);
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const value = String(message || "");
  if (/permission denied|authentication|membership/i.test(value)) return 403;
  if (/required|not found|scope|filing/i.test(value)) return 400;
  return 500;
}

async function loadLiveGuidance({ organizationId, entityId, vatReturnId }) {
  const raw = await buildFinanceVatReturnPreflight({ organizationId, entityId, vatReturnId });
  const calendar = applyFinanceTaxCalendarToPreflight(raw);
  const current = applyFinanceVatCalculationMethodToPreflight(calendar);
  if (current?.return?.id && current.return.id !== vatReturnId) {
    throw new Error("Tax close intelligence filing scope mismatch");
  }
  return deriveFinanceTaxCloseGuidance(current);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    await requireFinanceWorkspacePermission({ capabilityId: "vat_returns", operation: "read", access });

    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const vatReturnId = required(body.vatReturnId || body.vat_return_id, "vat_return_id");
    const guidance = await loadLiveGuidance({
      organizationId: access.organizationId,
      entityId,
      vatReturnId,
    });
    const evidence = buildFinanceTaxCloseIntelligenceEvidence({
      guidance,
      organizationId: access.organizationId,
      entityId,
      vatReturnId,
    });

    let source = "OWNED_INTELLIGENCE";
    let intelligenceError = null;
    let brief;

    try {
      const result = await runStructuredIntelligenceSupervisor({
        organization_id: access.organizationId,
        entity_id: entityId,
        system: FINANCE_TAX_CLOSE_INTELLIGENCE_SYSTEM,
        messages: [{
          role: "user",
          content: `LIVE_TAX_CLOSE_EVIDENCE\n${JSON.stringify(evidence)}`,
        }],
        tools: [],
        authorization: { allow_mutating_tools: false },
        metadata: {
          operation: "FINANCE_TAX_CLOSE_INTELLIGENCE",
          finance_domain: "TAX",
          vat_return_id: vatReturnId,
          source_fingerprint: evidence.source_fingerprint,
          resolution_authority: FINANCE_TAX_CLOSE_RESOLUTION_AUTHORITY,
          advisory_only: true,
          raw_reasoning_persisted: false,
        },
        mode: "deep",
        critique_instructions: [
          "Use only dependency codes present in LIVE_TAX_CLOSE_EVIDENCE.",
          "Do not claim that any dependency is resolved or completed.",
          "Do not recommend filing, posting, source-data mutation, client communication or manual completion as an autonomous action.",
          "Preserve uncertainty and keep the recommendation subordinate to deterministic next_action and resolution_rule.",
        ].join(" "),
        max_output_tokens: 2400,
      });
      brief = validateFinanceTaxCloseIntelligenceResult(result.parsed, evidence);
    } catch (error) {
      source = "DETERMINISTIC_FALLBACK";
      intelligenceError = clean(error?.message) || "Owned Intelligence unavailable";
      brief = buildDeterministicFinanceTaxCloseBrief(evidence, { fallbackReason: intelligenceError });
    }

    return NextResponse.json({
      success: true,
      return_id: vatReturnId,
      contract: FINANCE_TAX_CLOSE_INTELLIGENCE_CONTRACT,
      source,
      source_fingerprint: evidence.source_fingerprint,
      generated_at: new Date().toISOString(),
      intelligence_error: intelligenceError,
      brief,
      resolution_authority: FINANCE_TAX_CLOSE_RESOLUTION_AUTHORITY,
      mutation_authority: false,
      communication_authority: false,
      filing_authority: false,
    });
  } catch (error) {
    const message = error?.message || "Tax close intelligence could not be generated";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
