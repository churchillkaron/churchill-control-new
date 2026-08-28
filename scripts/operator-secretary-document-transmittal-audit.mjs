import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) { return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }
function includes(haystack, needle, label) { assert.ok(haystack.includes(needle), label); }

const runtime = read("lib/operator/secretary/SecretaryDocumentTransmittalRuntime.js");
const capability = read("lib/platform/capabilities/createSecretaryDocumentTransmittalCapability.js");
const platform = read("lib/platform/runtime/PlatformDomainRuntime.js");
const pkg = JSON.parse(read("package.json"));
const wrapper = read("scripts/run-operator-secretary-meeting-local-certification.sh");

includes(runtime, 'AVANTIQO_EXECUTIVE_SECRETARY_DOCUMENT_TRANSMITTAL_V1', "contract");
includes(runtime, 'scope: "DOCUMENT_COORDINATION"', "coverage scope");
includes(runtime, 'secretary_document_filing', "canonical filing source");
includes(runtime, 'frozen_versions', "frozen revisions");
includes(runtime, 'DISTRIBUTION_RECORDED', "distribution evidence lifecycle");
includes(runtime, 'ACKNOWLEDGED', "ack lifecycle");
includes(runtime, 'SECRETARY_DOCUMENT_TRANSMITTAL_DISTRIBUTION_SOURCE_REQUIRED', "distribution source evidence");
includes(runtime, 'SECRETARY_DOCUMENT_TRANSMITTAL_ACK_SOURCE_REQUIRED', "ack source evidence");
includes(runtime, 'SECRETARY_DOCUMENT_TRANSMITTAL_STALE_VERSION', "stale fence");
includes(runtime, 'SECRETARY_DOCUMENT_TRANSMITTAL_EVIDENCE_REUSE_CONFLICT', "evidence reuse fence");
includes(runtime, 'This register does not itself send or deliver documents.', "no runtime delivery instruction");
includes(runtime, 'Silence, send status, delivery status, or message-open state is not acknowledgement, approval, acceptance, signature, or legal service.', "no acknowledgement inference instruction");
for (const flag of [
  'external_message_sent_by_runtime: false',
  'external_delivery_performed_by_runtime: false',
  'distribution_delivery_inferred: false',
  'acknowledgement_inferred: false',
  'acknowledgement_is_approval: false',
  'acknowledgement_is_acceptance: false',
  'acknowledgement_is_signature: false',
  'acknowledgement_is_legal_service: false',
  'legal_effect_inferred: false',
  'file_content_read: false',
  'access_permission_bypassed: false',
  'retention_decision_made: false',
  'legal_hold_changed: false',
  'payment_authority_created: false',
  'signing_authority_created: false',
  'binding_authority_delegated: false',
]) includes(runtime, flag, flag);

includes(capability, 'capability: "secretary_document_transmittal"', "capability id");
includes(capability, 'aiEnabled: false', "no ai");
includes(capability, 'operatorEnabled: true', "operator enabled");
includes(capability, 'operatorAutoExecute: true', "operator auto execute");
includes(capability, 'operatorRequiresConfirmation: false', "no capability confirmation");
includes(capability, 'acknowledgement never means approval, acceptance, signature, legal service, or legal effect', "manifest boundary");

includes(platform, 'createSecretaryDocumentTransmittalCapability', "platform import");
includes(platform, 'secretary_document_transmittal', "platform registry");
includes(pkg.scripts["audit:operator-secretary-end-to-end"], 'operator-secretary-document-transmittal-audit.mjs', "package audit wiring");
includes(wrapper, 'certify-secretary-document-transmittal-local.mjs', "wrapper cert wiring");

console.log("OPERATOR_SECRETARY_DOCUMENT_TRANSMITTAL_AUDIT=PASS");
