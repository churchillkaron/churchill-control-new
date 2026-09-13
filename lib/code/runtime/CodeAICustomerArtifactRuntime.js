export const CODE_AI_CUSTOMER_ARTIFACT_CONTRACT =
  "AVANTIQO_CODE_AI_CUSTOMER_ARTIFACT_V1";

const MAX_PATCH_CHARS = 240000;
const MAX_RENDERED_PATCH_CHARS = 24000;
const MAX_SOURCE_CHANGE_CONTENT_CHARS = 80000;
const MAX_RENDERED_SOURCE_CHARS = 16000;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function rawText(value, maximum) {
  return String(value ?? "").slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sourceChanges(state) {
  return list(state.source_changes)
    .map((entry) => {
      const source = object(entry);
      const path = text(source.path || source.file_path, 1000);
      if (!path) return null;
      const content = rawText(source.content, MAX_SOURCE_CHANGE_CONTENT_CHARS);
      const originalLength = String(source.content ?? "").length;
      return {
        path,
        operation: text(source.operation || source.action, 80) || "write",
        content: content || null,
        content_truncated: originalLength > content.length,
      };
    })
    .filter(Boolean)
    .slice(0, 80);
}

function verificationEvidence(state) {
  const tests = new Map(
    list(state.tests)
      .map((entry) => object(entry))
      .filter((entry) => text(entry.operation_id, 240))
      .map((entry) => [text(entry.operation_id, 240), entry]),
  );

  return list(state.verification)
    .map((entry) => {
      const verification = object(entry);
      const operationId = text(verification.operation_id, 240) || null;
      const test = operationId ? object(tests.get(operationId)) : {};
      const exitCode = Number.isFinite(Number(test.exit_code))
        ? Number(test.exit_code)
        : null;
      return {
        operation_id: operationId,
        passed: verification.passed === true || exitCode === 0,
        command: text(test.command, 300) || null,
        args: list(test.args).map((value) => text(value, 500)).filter(Boolean).slice(0, 40),
        exit_code: exitCode,
      };
    })
    .slice(-40);
}

function completionVerified(result) {
  const completion = object(result.employee_completion);
  return Boolean(
    result.success === true &&
      text(result.status, 100) === "completed" &&
      completion.complete === true &&
      completion.verified === true &&
      completion.final_diff_observed === true,
  );
}

export function projectCodeAICustomerArtifact(result = {}, options = {}) {
  const source = object(result);
  const state = object(source.state);
  const completion = object(source.employee_completion);
  const changes = sourceChanges(state);
  const filesChanged = unique([
    ...list(completion.files_changed).map((value) => text(value, 1000)),
    ...list(state.files_changed).map((value) => text(value, 1000)),
    ...changes.map((entry) => entry.path),
  ]).slice(0, 120);
  const fullPatch = String(state.patch ?? "");
  const patch = rawText(fullPatch, MAX_PATCH_CHARS);
  const blockers = unique([
    ...list(completion.blockers).map((value) => text(value, 500)),
    ...list(state.blockers).map((value) => text(value, 500)),
    text(source.reason, 500),
  ]).slice(0, 40);
  const verification = verificationEvidence(state);
  const available = Boolean(patch || changes.length || filesChanged.length);
  const verifiedComplete = completionVerified(source);

  return {
    contract: CODE_AI_CUSTOMER_ARTIFACT_CONTRACT,
    available,
    status: text(source.status || state.status, 120) || null,
    success: source.success === true,
    verified_complete: verifiedComplete,
    commit_ready: verifiedComplete,
    base_commit: text(state.base_commit, 160) || null,
    owner_intent: text(object(state.employee_mission).owner_intent, 5000) || null,
    employee_passes: Number(object(state.employee_mission).employee_passes_used || source.employee_passes || 0),
    worldclass_quality_verified: object(completion.worldclass_quality).verified === true || object(source.worldclass_quality).verified === true,
    behavioral_verification_verified: object(completion.behavioral_verification).verified === true || object(source.behavioral_verification).verified === true,
    runtime_evidence_verified: object(completion.runtime_evidence_coverage).verified === true || object(source.runtime_evidence_coverage).verified === true,
    product_completion_verified: object(completion.product_completion_criteria).verified === true || object(source.product_completion_criteria).verified === true,
    repository_url:
      text(options.repository_url || state.repository_url, 1000) || null,
    files_changed: filesChanged,
    source_changes: changes,
    patch: patch || null,
    patch_truncated: fullPatch.length > patch.length,
    verification,
    verification_passed_count: verification.filter((entry) => entry.passed).length,
    verification_failed_count: verification.filter((entry) => !entry.passed).length,
    blockers,
    final_diff_observed: completion.final_diff_observed === true,
    generated_source_preserved_when_unverified: available && !verifiedComplete,
    raw_reasoning_persisted: false,
  };
}

function renderedVerification(artifact) {
  const verification = list(artifact.verification);
  if (!verification.length) return "Verification: no verifier result is available yet.";
  const passed = verification.filter((entry) => entry?.passed === true).length;
  const failed = verification.length - passed;
  return `Verification: ${passed} passed, ${failed} failed.`;
}

function renderedPatch(artifact) {
  const patch = String(artifact.patch ?? "");
  if (!patch) return null;
  const rendered = patch.slice(0, MAX_RENDERED_PATCH_CHARS);
  const truncated = patch.length > rendered.length || artifact.patch_truncated === true;
  return [
    "Patch:",
    "```diff",
    rendered,
    "```",
    ...(truncated
      ? ["The chat preview is truncated; the complete patch remains in the Code customer artifact."]
      : []),
  ].join("\n");
}

function renderedSourceChanges(artifact) {
  if (artifact.patch) return null;
  const changes = list(artifact.source_changes).filter((entry) => entry?.content);
  if (!changes.length) return null;
  let remaining = MAX_RENDERED_SOURCE_CHARS;
  const sections = [];
  for (const change of changes) {
    if (remaining <= 0) break;
    const header = `${change.operation || "write"}: ${change.path}`;
    const content = String(change.content ?? "").slice(0, remaining);
    remaining -= content.length;
    sections.push(`${header}\n\`\`\`\n${content}\n\`\`\``);
  }
  if (changes.some((entry) => entry.content_truncated) || remaining <= 0) {
    sections.push(
      "The chat preview is truncated; the complete generated source remains in the Code customer artifact.",
    );
  }
  return sections.join("\n\n");
}

export function renderCodeAICustomerArtifactText(artifact = {}) {
  const source = object(artifact);
  if (source.contract !== CODE_AI_CUSTOMER_ARTIFACT_CONTRACT) return null;

  const verification = list(source.verification);
  const passed = verification.filter((entry) => entry?.passed === true).length;
  const failed = verification.length - passed;
  const files = list(source.files_changed).map((value) => text(value, 1000)).filter(Boolean);
  const blockers = list(source.blockers).map((value) => text(value, 500)).filter(Boolean);
  const verified = source.verified_complete === true;
  const qualitySignals = [
    source.worldclass_quality_verified === true ? "world-class quality gate" : null,
    source.behavioral_verification_verified === true ? "behavioral verification" : null,
    source.runtime_evidence_verified === true ? "runtime evidence" : null,
    source.product_completion_verified === true ? "product completion criteria" : null,
  ].filter(Boolean);

  if (source.available !== true) {
    return [
      "Code did not produce a source change.",
      blockers.length ? `Reason: ${blockers[0]}` : null,
      verification.length ? `Verification: ${passed}/${verification.length} passed.` : "No verifier result is available yet.",
      "No commit or deployment is implied by this result.",
    ].filter(Boolean).join("\n\n");
  }

  const heading = verified
    ? `Completed and verified the requested Code work across ${files.length} changed file${files.length === 1 ? "" : "s"}.`
    : `Code changed ${files.length} file${files.length === 1 ? "" : "s"}, but verification is not complete yet.`;
  const objective = text(source.owner_intent, 1000);
  const summary = objective ? `Work completed: ${objective}` : null;
  const testLine = verification.length
    ? `**Verification:** ${passed}/${verification.length} passed${failed ? `, ${failed} failed` : ""}.`
    : "Verification: no verifier result is available yet.";
  const qualityLine = qualitySignals.length
    ? `**Quality evidence:** ${qualitySignals.join(", ")}.`
    : null;
  const shownFiles = files.slice(0, 10);
  const fileSection = shownFiles.length
    ? `**Changed files:**\n${shownFiles.map((value) => `- ${value}`).join("\n")}${files.length > shownFiles.length ? `\n- …and ${files.length - shownFiles.length} more` : ""}`
    : null;
  const sourceControl = verified
    ? "**Source control:** the Code work is commit-ready, but this artifact does not prove that a commit or production deployment has happened."
    : "**Source control:** not commit-ready until verification is complete.";
  const blockerSection = blockers.length
    ? `**Remaining blockers:**\n${blockers.slice(0, 8).map((value) => `- ${value}`).join("\n")}`
    : verified ? "**Remaining blockers:** none reported by the completed Code mission." : null;
  const nextStep = verified
    ? "**Next:** persist the verified change through the governed commit flow when authorized; deploy only when separately authorized and independently verified."
    : "**Next:** repair the failed or missing verification evidence, rerun the relevant checks, and only then consider the work complete.";

  return [
    heading,
    summary,
    testLine,
    qualityLine,
    fileSection,
    sourceControl,
    blockerSection,
    nextStep,
  ].filter(Boolean).join("\n\n");
}

export function findCodeAICustomerArtifact(value, depth = 0) {
  if (depth > 6) return null;
  const source = object(value);
  if (!Object.keys(source).length) return null;
  const direct = object(source.customer_artifact);
  if (direct.contract === CODE_AI_CUSTOMER_ARTIFACT_CONTRACT) return direct;
  for (const key of ["result", "execution", "capability_result", "code_result"]) {
    const nested = findCodeAICustomerArtifact(source[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

export const CodeAICustomerArtifactRuntime = Object.freeze({
  contract: CODE_AI_CUSTOMER_ARTIFACT_CONTRACT,
  project: projectCodeAICustomerArtifact,
  renderText: renderCodeAICustomerArtifactText,
  find: findCodeAICustomerArtifact,
});

export default CodeAICustomerArtifactRuntime;