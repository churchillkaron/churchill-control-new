import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";

export const OPERATOR_READ_ONLY_CODE_INSPECTION_TURN_CONTRACT = "AVANTIQO_OPERATOR_READ_ONLY_CODE_INSPECTION_TURN_V1";

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }

function resultSummary(inspection = {}) {
  const counts = object(inspection.counts);
  const verification = list(inspection.verification);
  const passed = verification.filter((item) => item?.passed === true).length;
  const failed = verification.length - passed;
  const focus = text(inspection.focus, 120).replaceAll("-", " ") || "requested";
  const recommendations = list(inspection.recommendations).map((item) => text(item, 400)).filter(Boolean).slice(0, 8);
  const files = list(inspection.inspected_files).map((item) => text(item, 1000)).filter(Boolean).slice(0, 10);
  const tests = verification.map((item) => ({ name: text(item?.test_path, 1000), passed: item?.passed === true })).filter((item) => item.name).slice(0, 6);
  const sourcePassed = failed === 0 && verification.length > 0;
  const resultLine = inspection.runtime_ui_certified === true
    ? `The ${focus} UI is certified by observed runtime evidence.`
    : sourcePassed
      ? `The ${focus} source contracts pass, but I would not call the UI fully finished yet because browser/mobile interaction is not certified by this read-only source audit.`
      : `The ${focus} audit found verification gaps, so I would not call this finished yet.`;
  const checked = `**What I checked:** ${Number(counts.inspected_files || 0)} source files, including ${Number(counts.pages || 0)} pages and ${Number(counts.components || 0)} components.`;
  const verificationSection = tests.length
    ? `**Verification:** ${passed}/${verification.length} passed${failed ? `, ${failed} failed` : ""}.\n${tests.map((item) => `- ${item.passed ? "PASS" : "FAIL"} — ${item.name}`).join("\n")}`
    : "**Verification:** no targeted verification test was available for this bounded audit.";
  const fileSection = files.length ? `**Key files inspected:**\n${files.map((item) => `- ${item}`).join("\n")}` : null;
  const attention = recommendations.length
    ? `**What I would check or fix next:**\n${recommendations.map((item) => `- ${item}`).join("\n")}`
    : "**What I would check or fix next:** no source-level blocker was found in this bounded audit.";
  const sourceControl = "**Source control:** read-only inspection only. No source file was changed, no commit was created, and no deployment was performed.";
  const next = inspection.runtime_ui_certified === true
    ? "**Next:** no additional UI certification is required by this audit; address only any explicit findings above."
    : "**Next:** run browser and mobile interaction verification on the flagged Finance surfaces before declaring the UI fully finished.";
  return [
    `Completed the read-only ${focus} Code/UI audit on current main.`,
    resultLine,
    checked,
    verificationSection,
    fileSection,
    attention,
    sourceControl,
    next,
  ].filter(Boolean).join("\n\n").slice(0, 12000);
}

export async function runOperatorReadOnlyCodeInspectionTurn(options = {}) {
  const capabilityExecution = await executeUbteCapability({
    organizationId: options.organizationId,
    domain: "platform", capability: "code_ai_readonly_inspection", action: "read",
    payload: { message: text(options.message, 4000), ref: "main" },
    actor: object(options.actor),
    runtime: { entityId: options.entityId || null, periodId: options.periodId || null, permissions: list(options.permissions), callerRequest: options.callerRequest || null, metadata: { source: "AVANTIQO_OPERATOR", channel: text(options.source, 40) || "text", partyId: text(options.partyId, 160) || null, conversationId: text(options.conversationId, 160) || null, operatorCapabilityKey: "platform.code_ai_readonly_inspection.read" } },
  });
  const inspection = object(capabilityExecution?.result);
  const responseText = resultSummary(inspection);
  return {
    success: true,
    decision: { response_text: responseText, response_language: text(options.locale, 80) || null, intent: "answer", confidence: 1, agreement_state: object(options.agreementState), project_state: object(options.projectState), clarification: { required: false, question: null, options: [] }, navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [] },
    agreement_state: object(options.agreementState),
    current_screen: null, navigation: null,
    provider_evidence: { provider: "avantiqo-code-readonly", model: null, usage_id: null },
    execution: { status: "completed", capability_key: "platform.code_ai_readonly_inspection.read", result: inspection, capability_execution: capabilityExecution },
    operator_catalog: { read_only_code_inspection: true, mutation_executed: false, source_mutation_authority: false, commit_authority: false, deploy_authority: false, migration_authority: false },
    intelligence_supervision: { contract: "AVANTIQO_OPERATOR_OWNED_COGNITIVE_BRIEF_V4", owned_brief_used: false, live_evidence_used: true, cognitive_brief_ms: 0, repair_supervision_ms: 0, execution_governance_bypassed: false, raw_reasoning_persisted: false, read_only_code_inspection: true },
  };
}

export default runOperatorReadOnlyCodeInspectionTurn;
