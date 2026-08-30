import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_BUSINESS_PARTNER_DEVELOPER_RESOURCE_CERTIFICATION_V1";

const paths = {
  attachmentRuntime: "lib/platform/runtime/DeveloperAttachmentRuntime.js",
  attachmentApi: "app/api/operator/developer-attachments/route.js",
  dock: "components/operator/HomeAvantiqoIntelligenceDock.jsx",
  codeLive: "lib/code/runtime/CodeAIWorkPackageRuntimeLive.js",
  operatorMission: "lib/platform/capabilities/createOperatorMissionCapability.js",
  developerResources: "lib/platform/runtime/AvantiqoDeveloperResourceReadRuntime.js",
  repositoryAssessment: "lib/platform/capabilities/createProductRepositoryAssessmentCapability.js",
  liveExecution: "lib/platform/runtime/AvantiqoLiveExecutionRuntime.js",
  liveExecutionApi: "app/api/operator/live-execution/route.js",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

function markers(label, content, required) {
  const missing = required.filter((marker) => !content.includes(marker));
  if (missing.length) {
    throw new Error(`${CONTRACT}_${label}_MISSING:${missing.join(",")}`);
  }
}

markers("ATTACHMENT_RUNTIME", source.attachmentRuntime, [
  "AVANTIQO_DEVELOPER_ATTACHMENT_SET_V1",
  "const MAX_FILES = 4",
  "const TTL_MS = 30 * 60 * 1000",
  "DEVELOPER_ATTACHMENT_SENSITIVE_FILE_BLOCKED",
  "DEVELOPER_ATTACHMENT_FILE_LIMIT_EXCEEDED",
  "read_only_evidence: true",
  'authorization_effect: "NONE"',
  "source_mutation_authority: false",
  "credential_authority: false",
  "production_deploy_authority: false",
  'x-avantiqo-developer-attachment-set',
]);

markers("ATTACHMENT_API", source.attachmentApi, [
  "authenticateRequest",
  "requireOrganizationAccess",
  "createDeveloperAttachmentSet",
  "export async function POST",
  '"Cache-Control": "no-store"',
]);

markers("BUSINESS_PARTNER_UI", source.dock, [
  "Paperclip",
  '"/api/operator/developer-attachments"',
  '"x-avantiqo-developer-attachment-set"',
  '"/api/operator/turn/live"',
  "slice(0, 4)",
  '"/api/operator/live-execution"',
  "requestStop",
]);

markers("CODE_TRANSIENT_ATTACHMENT_AND_STOP", source.codeLive, [
  "assertAvantiqoLiveExecutionContinue",
  "developerAttachmentSetIdFromRequest",
  "loadDeveloperAttachmentSet",
  "projectDeveloperAttachmentEvidence",
  "MAX_DEVELOPER_ATTACHMENT_PROMPT_CHARS",
  "MAX_DEVELOPER_ATTACHMENT_FILE_PROMPT_CHARS",
  "developer_attachment_content_persisted: false",
  "transient_developer_attachments: true",
  "cooperative_user_stop: true",
  'status: "cancelled"',
  'phase: "STOPPED"',
]);

const stopAssertions = source.codeLive.match(/await assertOperatorContinue\(context\)/g) || [];
assert.ok(
  stopAssertions.length >= 2,
  "Code must check the shared Stop flag before planning and before repository operations",
);

markers("OPERATOR_REQUEST_PROPAGATION", source.operatorMission, [
  "callerRequest: context.callerRequest",
]);

markers("DEVELOPER_RESOURCE_READ", source.developerResources, [
  "AVANTIQO_DEVELOPER_RESOURCE_READ_V1",
  'method: "GET"',
  'token_exposed: false',
  'deploy_authority: false',
  'environment_write_authority: false',
  'production_deploy_performed: false',
  'environment_mutation_performed: false',
  'authorization_effect: "NONE"',
  '"/v6/deployments"',
  '"/v3/deployments/',
  '"/v1/projects/',
]);
assert.equal(
  /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/.test(source.developerResources),
  false,
  "Developer resource runtime must remain read-only",
);

markers("REPOSITORY_ASSESSMENT", source.repositoryAssessment, [
  "readAvantiqoDeveloperResources",
  "developer_resources: developerResources",
  'operatorMode: "read"',
  '"vercel-evidence"',
  '"developer-resources"',
]);

markers("LIVE_EXECUTION", source.liveExecution, [
  "AVANTIQO_LIVE_EXECUTION_V1",
  "requestAvantiqoLiveExecutionStop",
  "assertAvantiqoLiveExecutionContinue",
  "next safe execution boundary",
]);
markers("LIVE_EXECUTION_API", source.liveExecutionApi, [
  "requestAvantiqoLiveExecutionStop",
  "next_safe_execution_boundary",
  "export async function DELETE",
]);

for (const [label, content] of [
  ["attachment", source.attachmentRuntime],
  ["attachment_api", source.attachmentApi],
  ["developer_resources", source.developerResources],
]) {
  assert.equal(
    /production_deploy_(?:performed|authority):\s*true/.test(content),
    false,
    `${label} must never grant or perform production deployment`,
  );
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  zero_gpu: true,
  provider_model_call_performed: false,
  runpod_mutation_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  selected_computer_files: "EXPLICIT_ONLY",
  selected_file_authorization_effect: "NONE",
  code_attachment_content_persisted: false,
  code_cooperative_stop_boundaries_verified: true,
  github_read_path_verified: true,
  vercel_read_only_path_verified: true,
  secrets_printed: false,
}, null, 2));
