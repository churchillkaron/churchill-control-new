import { createHash } from "node:crypto";

export const FINANCE_TAX_CLOSE_INTELLIGENCE_CONTRACT = "FINANCE_TAX_CLOSE_INTELLIGENCE_V1";
export const FINANCE_TAX_CLOSE_RESOLUTION_AUTHORITY = "LIVE_TAX_PREFLIGHT_ONLY";

const FIXED_DO_NOT_DO = Object.freeze([
  "Do not mark a Tax dependency complete manually.",
  "Do not file, post accounting, send client communication or change source evidence from this intelligence brief.",
  "Do not treat client-request status or AI output as Tax resolution evidence.",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function upper(value) {
  return text(value, 240).toUpperCase();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stable(value[key]);
    return result;
  }, {});
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function boundedEvidencePreview(rows) {
  return list(rows).slice(0, 12).map(item => ({
    source_id: text(item?.source_id, 240) || null,
    source_type: text(item?.source_type, 120) || null,
    reference: text(item?.reference, 320) || null,
    code: text(item?.code, 120) || null,
  }));
}

function dependencyEvidence(dependency) {
  return {
    code: upper(dependency?.code),
    title: text(dependency?.title, 500),
    detail: text(dependency?.detail, 1800),
    next_action: text(dependency?.next_action, 1000),
    resolution_rule: text(dependency?.resolution_rule, 1800),
    blocking: dependency?.blocking === true,
    responsibility: upper(dependency?.responsibility),
    client_request_recommended: dependency?.client_request_recommended === true,
    filing_due_date: text(dependency?.filing_due_date, 40) || null,
    days_remaining: Number.isFinite(dependency?.days_remaining) ? dependency.days_remaining : null,
    evidence_count: Number(dependency?.evidence_count || 0),
    evidence_preview: boundedEvidencePreview(dependency?.evidence_preview),
    manual_complete_allowed: false,
  };
}

export function buildFinanceTaxCloseIntelligenceEvidence({
  guidance,
  organizationId,
  entityId,
  vatReturnId,
} = {}) {
  const source = object(guidance);
  const dependencies = list(source.dependencies)
    .map(dependencyEvidence)
    .filter(item => item.code);

  const evidence = {
    contract: FINANCE_TAX_CLOSE_INTELLIGENCE_CONTRACT,
    organization_id: text(organizationId, 160),
    entity_id: text(entityId, 160),
    vat_return_id: text(vatReturnId, 160),
    legal_date: text(source.legal_date, 40) || null,
    filing_due_date: text(source.filing_due_date, 40) || null,
    days_remaining: Number.isFinite(source.days_remaining) ? source.days_remaining : null,
    overdue: source.overdue === true,
    state: upper(source.state),
    counts: {
      total: Number(source.counts?.total || dependencies.length),
      blocking: Number(source.counts?.blocking || dependencies.filter(item => item.blocking).length),
      warnings: Number(source.counts?.warnings || dependencies.filter(item => !item.blocking).length),
      client_evidence: Number(source.counts?.client_evidence || dependencies.filter(item => item.responsibility === "CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION").length),
      accountant: Number(source.counts?.accountant || dependencies.filter(item => item.responsibility !== "CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION").length),
    },
    dependencies,
    truth_rule: text(source.truth_rule, 1800),
    communication_rule: text(source.communication_rule, 1800),
    resolution_authority: FINANCE_TAX_CLOSE_RESOLUTION_AUTHORITY,
    intelligence_authority: "ADVISORY_ONLY",
    mutation_authority: false,
  };

  return {
    ...evidence,
    source_fingerprint: fingerprint(evidence),
  };
}

function deterministicDependencyBrief(dependency) {
  return {
    code: dependency.code,
    title: dependency.title,
    explanation: dependency.detail || "Live Tax evidence has not yet satisfied this dependency.",
    evidence_summary: dependency.evidence_count
      ? `${dependency.evidence_count} governed evidence item${dependency.evidence_count === 1 ? "" : "s"} are currently associated with this dependency.`
      : "No governed evidence preview is currently available for this dependency.",
    resolution_proof: dependency.resolution_rule,
    responsibility: dependency.responsibility,
    blocking: dependency.blocking,
  };
}

export function buildDeterministicFinanceTaxCloseBrief(evidence, { fallbackReason = null } = {}) {
  const source = object(evidence);
  const dependencies = list(source.dependencies);
  const next = dependencies[0] || null;
  const clientDependencies = dependencies.filter(item => item.responsibility === "CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION");

  return {
    contract: FINANCE_TAX_CLOSE_INTELLIGENCE_CONTRACT,
    summary: next
      ? `${dependencies.length} live Tax dependenc${dependencies.length === 1 ? "y" : "ies"} remain. The safest next step is to address ${next.title}.`
      : "No live Tax close dependency is currently open for this filing.",
    risk_summary: source.overdue
      ? "The statutory filing deadline has passed; resolve live blockers using governed evidence before filing."
      : Number.isFinite(source.days_remaining)
        ? `${source.days_remaining} day${source.days_remaining === 1 ? "" : "s"} remain to the governed filing deadline.`
        : "Use the governed statutory calendar shown in Tax for deadline authority.",
    blocking_dependencies: dependencies.map(deterministicDependencyBrief),
    client_evidence_summary: clientDependencies.map(item => ({
      dependency_code: item.code,
      summary: item.detail,
      accountant_validation_required: true,
    })),
    recommended_next_step: next ? {
      dependency_code: next.code,
      action: next.next_action,
      why_now: next.blocking
        ? "This live dependency currently blocks the filing and is first in the governed close-guidance order."
        : "This is the first live review dependency in the governed close-guidance order.",
      verification: next.resolution_rule,
    } : null,
    uncertainties: fallbackReason ? [`Owned Intelligence was unavailable or invalid: ${text(fallbackReason, 800)}`] : [],
    do_not_do: [...FIXED_DO_NOT_DO],
    advisory_only: true,
    manual_complete_allowed: false,
    resolution_authority: FINANCE_TAX_CLOSE_RESOLUTION_AUTHORITY,
    source_fingerprint: source.source_fingerprint || null,
  };
}

function modelDependencyMap(result) {
  return new Map(list(result?.blocking_dependencies).map(item => [upper(item?.code), object(item)]).filter(([code]) => code));
}

export function validateFinanceTaxCloseIntelligenceResult(result, evidence) {
  const model = object(result);
  const source = object(evidence);
  const dependencies = list(source.dependencies);
  const liveByCode = new Map(dependencies.map(item => [upper(item.code), item]));
  const modelByCode = modelDependencyMap(model);
  const nextCode = upper(model?.recommended_next_step?.dependency_code);
  const selectedNext = liveByCode.get(nextCode) || dependencies[0] || null;

  const blockingDependencies = dependencies.map(live => {
    const generated = object(modelByCode.get(upper(live.code)));
    return {
      code: live.code,
      title: live.title,
      explanation: text(generated.explanation, 1800) || live.detail,
      evidence_summary: text(generated.evidence_summary, 1400) || deterministicDependencyBrief(live).evidence_summary,
      resolution_proof: live.resolution_rule,
      responsibility: live.responsibility,
      blocking: live.blocking,
    };
  });

  const clientEvidenceSummary = dependencies
    .filter(item => item.responsibility === "CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION")
    .map(item => {
      const generated = list(model.client_evidence_summary).find(row => upper(row?.dependency_code) === upper(item.code));
      return {
        dependency_code: item.code,
        summary: text(generated?.summary, 1400) || item.detail,
        accountant_validation_required: true,
      };
    });

  const uncertainties = list(model.uncertainties).map(item => text(item, 700)).filter(Boolean).slice(0, 8);
  const modelDoNotDo = list(model.do_not_do).map(item => text(item, 700)).filter(Boolean).slice(0, 6);

  return {
    contract: FINANCE_TAX_CLOSE_INTELLIGENCE_CONTRACT,
    summary: text(model.summary, 1800) || buildDeterministicFinanceTaxCloseBrief(source).summary,
    risk_summary: text(model.risk_summary, 1400) || buildDeterministicFinanceTaxCloseBrief(source).risk_summary,
    blocking_dependencies: blockingDependencies,
    client_evidence_summary: clientEvidenceSummary,
    recommended_next_step: selectedNext ? {
      dependency_code: selectedNext.code,
      action: selectedNext.next_action,
      why_now: text(model?.recommended_next_step?.why_now, 1400) || (selectedNext.blocking ? "This live dependency currently blocks the filing." : "This is the first live review dependency."),
      verification: selectedNext.resolution_rule,
    } : null,
    uncertainties,
    do_not_do: [...new Set([...FIXED_DO_NOT_DO, ...modelDoNotDo])].slice(0, 10),
    advisory_only: true,
    manual_complete_allowed: false,
    resolution_authority: FINANCE_TAX_CLOSE_RESOLUTION_AUTHORITY,
    source_fingerprint: source.source_fingerprint || null,
  };
}

export const FINANCE_TAX_CLOSE_INTELLIGENCE_SYSTEM = [
  "You are Avantiqo Finance Tax Close Intelligence.",
  "Analyze only the supplied bounded live Tax evidence package. Treat it as the sole factual source.",
  "This is high-stakes accounting and tax work. Preserve uncertainty and never invent missing accounting facts, authority evidence, approvals, client responses or completed actions.",
  "You are advisory only. You cannot file, post accounting, change source evidence, send client communication, complete a dependency or authorize a Tax decision.",
  "Every dependency code you reference must exist in the supplied package.",
  "You may explain why a dependency matters, summarize the evidence already supplied and prioritize the safest next step, but the allowed action and resolution proof remain the deterministic next_action and resolution_rule from live Tax guidance.",
  "Return one JSON object with: summary, risk_summary, blocking_dependencies[{code,explanation,evidence_summary}], client_evidence_summary[{dependency_code,summary}], recommended_next_step{dependency_code,why_now}, uncertainties[], do_not_do[].",
].join("\n");
