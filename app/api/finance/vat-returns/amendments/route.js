export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { buildFinanceVatReturnPreflight } from "@/lib/finance/tax/FinanceVatReturnPreflight";
import {
  amendmentLabel,
  buildFinanceVatAmendmentEvidenceSignature,
  financeVatSnapshotDelta,
  financeVatSnapshotFromPreflight,
  financeVatSnapshotsMatch,
  latestFinanceVatFiledSnapshot,
  mergeFinanceVatAmendmentMetadata,
  normalizeFinanceVatAmendmentChain,
} from "@/lib/finance/tax/FinanceVatAmendmentPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const normalized = String(message || "");
  if (/permission denied|authentication|membership/i.test(normalized)) return 403;
  if (/required|not found|submitted|amendment|evidence|calculated|changed|scope|block/i.test(normalized)) return 400;
  return 500;
}

function preflightBlockerMessage(preflight) {
  const blockers = Array.isArray(preflight?.calculation_blockers) ? preflight.calculation_blockers : [];
  if (!blockers.length) return null;
  return blockers.map(item => `${item.label}: ${item.detail}`).join(" | ");
}

async function loadSubmittedReturn({ organizationId, entityId, vatReturnId }) {
  const { data, error } = await supabaseAdmin
    .from("finance_vat_returns")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", vatReturnId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("VAT return not found in organization and entity scope");
  if (String(data.status || "").toUpperCase() !== "SUBMITTED") {
    throw new Error("VAT return must be submitted before an amendment can be opened");
  }
  return data;
}

async function persistChain({ vatReturn, chain }) {
  const now = new Date().toISOString();
  let query = supabaseAdmin
    .from("finance_vat_returns")
    .update({
      metadata: mergeFinanceVatAmendmentMetadata(vatReturn, chain),
      updated_at: now,
    })
    .eq("id", vatReturn.id)
    .eq("organization_id", vatReturn.organization_id)
    .eq("entity_id", vatReturn.entity_id)
    .eq("status", "SUBMITTED");
  if (vatReturn.updated_at) query = query.eq("updated_at", vatReturn.updated_at);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("VAT amendment chain changed by another user; refresh before continuing");
  return data;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "vat_returns",
      operation: "write",
      access,
    });

    const actorId = required(access.user?.id, "authenticated user");
    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const vatReturnId = required(body.vatReturnId || body.vat_return_id, "vat_return_id");
    const action = required(body.action, "action").toLowerCase();
    const vatReturn = await loadSubmittedReturn({
      organizationId: access.organizationId,
      entityId,
      vatReturnId,
    });
    const chain = normalizeFinanceVatAmendmentChain(vatReturn);
    const now = new Date().toISOString();

    if (action === "open") {
      if (chain.active) throw new Error("An amendment is already active for this filed return");
      const reasonCode = required(body.reasonCode || body.reason_code, "reason_code").toUpperCase();
      const reason = required(body.reason, "reason");
      const evidenceReference = required(
        body.evidenceReference || body.evidence_reference,
        "authority evidence reference"
      );
      const sequence = chain.history.length + 1;
      chain.active = {
        id: randomUUID(),
        sequence,
        label: amendmentLabel(sequence),
        status: "DRAFT",
        correction_method: String(vatReturn.jurisdiction_code || "").toUpperCase() === "THAILAND"
          ? "PP30_ADDITIONAL_RETURN"
          : "AMENDED_RETURN",
        reason_code: reasonCode,
        reason,
        authority_evidence_reference: evidenceReference,
        previous_effective_values: latestFinanceVatFiledSnapshot(vatReturn, chain),
        opened_at: now,
        opened_by: actorId,
      };
      const updated = await persistChain({ vatReturn, chain });
      return NextResponse.json({ success: true, return: updated, chain: normalizeFinanceVatAmendmentChain(updated) });
    }

    if (action === "calculate") {
      if (!chain.active) throw new Error("Open an amendment before calculating the correction");
      const preflight = await buildFinanceVatReturnPreflight({
        organizationId: access.organizationId,
        entityId,
        vatReturnId,
      });
      const blocker = preflightBlockerMessage(preflight);
      if (blocker) throw new Error(`VAT amendment preflight failed: ${blocker}`);
      const [current, evidenceSignature] = await Promise.all([
        Promise.resolve(financeVatSnapshotFromPreflight(preflight)),
        buildFinanceVatAmendmentEvidenceSignature({
          organizationId: access.organizationId,
          entityId,
          vatReturn,
        }),
      ]);
      const previous = latestFinanceVatFiledSnapshot(vatReturn, chain);
      chain.active = {
        ...chain.active,
        status: "CALCULATED",
        previous_effective_values: previous,
        effective_values: current,
        delta: financeVatSnapshotDelta(previous, current),
        evidence_signature: evidenceSignature,
        calculated_at: now,
        calculated_by: actorId,
      };
      const updated = await persistChain({ vatReturn, chain });
      return NextResponse.json({ success: true, return: updated, chain: normalizeFinanceVatAmendmentChain(updated) });
    }

    if (action === "submit") {
      if (!chain.active) throw new Error("No active VAT amendment is available to submit");
      if (String(chain.active.status || "").toUpperCase() !== "CALCULATED") {
        throw new Error("VAT amendment must be calculated before submission");
      }
      const submissionReference = required(
        body.submissionReference || body.submission_reference,
        "submission_reference"
      );
      const preflight = await buildFinanceVatReturnPreflight({
        organizationId: access.organizationId,
        entityId,
        vatReturnId,
      });
      const blocker = preflightBlockerMessage(preflight);
      if (blocker) throw new Error(`VAT amendment preflight failed: ${blocker}`);
      const [current, evidenceSignature] = await Promise.all([
        Promise.resolve(financeVatSnapshotFromPreflight(preflight)),
        buildFinanceVatAmendmentEvidenceSignature({
          organizationId: access.organizationId,
          entityId,
          vatReturn,
        }),
      ]);
      if (chain.active.evidence_signature?.digest !== evidenceSignature.digest) {
        throw new Error("VAT amendment evidence changed after calculation; recalculate before submission");
      }
      if (!financeVatSnapshotsMatch(chain.active.effective_values, current)) {
        throw new Error("VAT amendment totals changed after calculation; recalculate before submission");
      }
      const filed = {
        ...chain.active,
        status: "SUBMITTED",
        submission_reference: submissionReference,
        submitted_at: now,
        submitted_by: actorId,
        evidence_signature: evidenceSignature,
        effective_values: current,
        delta: financeVatSnapshotDelta(chain.active.previous_effective_values, current),
      };
      chain.history = [...chain.history, filed];
      chain.active = null;
      const updated = await persistChain({ vatReturn, chain });
      return NextResponse.json({ success: true, return: updated, chain: normalizeFinanceVatAmendmentChain(updated) });
    }

    if (action === "abandon") {
      if (!chain.active) throw new Error("No active VAT amendment is available to abandon");
      const abandonmentReason = required(body.abandonmentReason || body.abandonment_reason, "abandonment_reason");
      chain.abandoned = [
        ...chain.abandoned,
        {
          ...chain.active,
          status: "ABANDONED",
          abandonment_reason: abandonmentReason,
          abandoned_at: now,
          abandoned_by: actorId,
        },
      ];
      chain.active = null;
      const updated = await persistChain({ vatReturn, chain });
      return NextResponse.json({ success: true, return: updated, chain: normalizeFinanceVatAmendmentChain(updated) });
    }

    throw new Error(`Unsupported VAT amendment action: ${action}`);
  } catch (error) {
    const message = error?.message || "VAT amendment action failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
