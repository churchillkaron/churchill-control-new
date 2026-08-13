import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://audit.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { listOperatorCapabilities } = await import(
  "@/lib/operator/runtime/OperatorCapabilityCatalog"
);
const { requireExecutionPermission } = await import(
  "@/lib/ubte/runtime/security/CapabilityPermissionPolicy"
);

const capabilities = await listOperatorCapabilities();
const byKey = new Map(capabilities.map((capability) => [capability.key, capability]));

const studio = byKey.get("creative.studio.prepareProject");
const draft = byKey.get("commercial.communication.draftMessage");
const send = byKey.get("commercial.communication.sendDraftMessage");

assert.ok(studio, "Creative Studio prepare capability must be Operator-visible");
assert.ok(draft, "Communication draft capability must be Operator-visible");
assert.ok(send, "Communication send-draft capability must be Operator-visible");

assert.equal(studio.mode, "draft");
assert.equal(studio.auto_execute, false);
assert.equal(studio.requires_confirmation, true);
assert.deepEqual(studio.permissions, ["creative.mission.create"]);

assert.equal(draft.mode, "draft");
assert.equal(draft.auto_execute, false);
assert.equal(draft.requires_confirmation, true);
assert.deepEqual(draft.permissions, ["commercial.communications.write"]);

assert.equal(send.mode, "approve");
assert.equal(send.risk, "high");
assert.equal(send.auto_execute, false);
assert.equal(send.requires_confirmation, true);
assert.equal(send.reversible, false);
assert.deepEqual(send.permissions, ["commercial.communications.send"]);

assert.equal(
  requireExecutionPermission(
    { permissions: ["commercial.*"] },
    "commercial.communications.send",
  ),
  true,
);
assert.throws(
  () =>
    requireExecutionPermission(
      { permissions: ["commercial.communications.write"] },
      "commercial.communications.send",
    ),
  /CAPABILITY_PERMISSION_REQUIRED/,
);

const [
  repositorySource,
  communicationSource,
  draftSource,
  sendSource,
  studioSource,
  domainRegistrySource,
] = await Promise.all([
  readFile("lib/commercial/communications/CommunicationRepository.js", "utf8"),
  readFile("lib/commercial/communications/CommunicationService.js", "utf8"),
  readFile(
    "lib/commercial/communications/capabilities/draftMessage.js",
    "utf8",
  ),
  readFile(
    "lib/commercial/communications/capabilities/sendDraftMessage.js",
    "utf8",
  ),
  readFile(
    "lib/creative/studio/capabilities/prepareStudioProject.js",
    "utf8",
  ),
  readFile("lib/ubte/runtime/domains/DomainRuntimeRegistry.js", "utf8"),
]);

assert.match(repositorySource, /\.eq\("organization_id", organizationId\)/);
assert.match(repositorySource, /\.eq\("conversation_id", conversationId\)/);
assert.match(repositorySource, /\.eq\("status", "DRAFT"\)/);
assert.match(communicationSource, /status: "DRAFT"/);
assert.match(communicationSource, /delivery_authorized: false/);
assert.match(sendSource, /deliverCommunicationMessage/);
assert.doesNotMatch(draftSource, /deliverCommunicationMessage|executeService/);
assert.match(studioSource, /CreativeMissionRuntime\.create/);
assert.match(studioSource, /CreativeMissionRuntime\.start/);
assert.match(studioSource, /publish_authorized: false/);
assert.match(studioSource, /publication_requires_human_approval: true/);
assert.doesNotMatch(
  studioSource,
  /CreativeDirectorRuntime|CreativePublish|executeService/,
);
assert.match(domainRegistrySource, /commercial: async/);
assert.match(domainRegistrySource, /creative: async/);

console.log("OPERATOR_DOMAIN_ACTIONS_AUDIT=PASS");
console.log("OPERATOR_STUDIO_BOUNDARY=PREPARE_WITHOUT_GENERATE_OR_PUBLISH");
console.log("OPERATOR_MESSAGE_BOUNDARY=DRAFT_THEN_EXACT_CONFIRMED_SEND");
console.log("OPERATOR_TENANCY=ORGANIZATION_SCOPED");
