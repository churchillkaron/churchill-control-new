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

  if (source.available !== true) {
    const blocker = list(source.blockers).map((value) => text(value, 500)).find(Boolean);
    return [
      "Code stopped before producing a source change.",
      blocker ? `Reason: ${blocker}` : null,
      renderedVerification(source),
    ].filter(Boolean).join("\n\n");
  }

  const files = list(source.files_changed).map((value) => text(value, 1000)).filter(Boolean);
  const heading = source.verified_complete === true
    ? `Code completed and verified ${files.length} changed file${files.length === 1 ? "" : "s"}.`
    : `Code produced ${files.length} changed file${files.length === 1 ? "" : "s"}, but verification is not complete.`;
  const fileSection = files.length
    ? `Changed files:\n${files.map((value) => `- ${value}`).join("\n")}`
    : null;
  const blockers = list(source.blockers).map((value) => text(value, 500)).filter(Boolean);
  const blockerSection = blockers.length
    ? `Remaining blockers:\n${blockers.map((value) => `- ${value}`).join("\n")}`
    : null;

  return [
    heading,
    fileSection,
    renderedVerification(source),
    blockerSection,
    renderedPatch(source) || renderedSourceChanges(source),
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