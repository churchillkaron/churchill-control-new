import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeDocumentType(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeCurrency(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

export async function resolveFinanceApprovalPolicy({
  organizationId,
  entityId = null,
  documentType,
  amount = 0,
  currencyCode,
  documentDate = null,
}) {
  if (!organizationId) throw new Error("organizationId required");

  const resolvedDocumentType = normalizeDocumentType(documentType);
  const resolvedCurrency = normalizeCurrency(currencyCode);
  const resolvedDate = normalizeDate(documentDate);
  const resolvedAmount = Number(amount || 0);

  if (!resolvedDocumentType) throw new Error("documentType required");
  if (!resolvedCurrency) throw new Error("currencyCode required");
  if (!Number.isFinite(resolvedAmount) || resolvedAmount < 0) {
    throw new Error("amount must be zero or greater");
  }

  const { data, error } = await supabaseAdmin
    .from("finance_approval_workflows")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("document_type", resolvedDocumentType)
    .eq("currency_code", resolvedCurrency)
    .eq("status", "ACTIVE")
    .lte("effective_from", resolvedDate)
    .or(`effective_to.is.null,effective_to.gte.${resolvedDate}`);

  if (error) throw error;

  const applicable = (data || [])
    .filter((row) => {
      const threshold = Number(row.threshold_amount || 0);
      const scopeMatches = entityId
        ? row.entity_id === entityId || row.entity_id === null
        : row.entity_id === null;

      return scopeMatches && threshold <= resolvedAmount;
    })
    .sort((left, right) => {
      const leftSpecific = left.entity_id ? 1 : 0;
      const rightSpecific = right.entity_id ? 1 : 0;

      if (leftSpecific !== rightSpecific) {
        return rightSpecific - leftSpecific;
      }

      const thresholdOrder =
        Number(right.threshold_amount || 0) -
        Number(left.threshold_amount || 0);

      if (thresholdOrder !== 0) return thresholdOrder;

      return String(right.effective_from || "").localeCompare(
        String(left.effective_from || "")
      );
    });

  const rule = applicable[0] || null;

  return {
    approval_required: Boolean(rule),
    workflow_id: rule?.id || null,
    workflow_name: rule?.name || null,
    approver_role: rule?.approver_role || null,
    required_approvals: rule ? Number(rule.required_approvals || 1) : 0,
    threshold_amount: rule ? Number(rule.threshold_amount || 0) : null,
    currency_code: resolvedCurrency,
    entity_specific: Boolean(rule?.entity_id),
    rule,
  };
}

export default resolveFinanceApprovalPolicy;
