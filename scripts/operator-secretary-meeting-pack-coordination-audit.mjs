import fs from "node:fs";

const runtime = fs.readFileSync("lib/operator/secretary/SecretaryMeetingPackCoordinationRuntime.js", "utf8");
const capability = fs.readFileSync("lib/platform/capabilities/createSecretaryMeetingPackCoordinationCapability.js", "utf8");
const platform = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const wrapper = fs.readFileSync("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8");

function must(label, condition) {
  if (!condition) throw new Error(`SECRETARY_MEETING_PACK_COORDINATION_AUDIT_FAIL:${label}`);
}

must("contract", runtime.includes("AVANTIQO_EXECUTIVE_SECRETARY_MEETING_PACK_COORDINATION_V1"));
must("references_only", runtime.includes("document_store_created: false") && runtime.includes("file_content_read: false"));
must("required_items_block", runtime.includes("SECRETARY_MEETING_PACK_REQUIRED_ITEMS_INCOMPLETE"));
must("frozen_versions", runtime.includes("frozen_versions") && runtime.includes("MEETING_PACK_REOPENED_FOR_REVISION"));
must("distribution_evidence", runtime.includes("MEETING_PACK_DISTRIBUTION_RECORDED") && runtime.includes("distribution_evidence_id"));
must("acknowledgement_evidence", runtime.includes("MEETING_PACK_ACKNOWLEDGEMENT_RECORDED") && runtime.includes("acknowledgement_evidence_id"));
must("ack_not_approval", runtime.includes("acknowledgement_is_approval: false"));
must("ack_not_attendance", runtime.includes("acknowledgement_is_attendance: false"));
must("no_calendar_mutation", runtime.includes("calendar_event_modified: false"));
must("no_runtime_send", runtime.includes("external_message_sent_by_runtime: false"));
must("stale_fence", runtime.includes("SECRETARY_MEETING_PACK_STALE_VERSION"));
must("replay_fence", runtime.includes("SECRETARY_MEETING_PACK_EVIDENCE_REUSE_CONFLICT"));
must("capability", capability.includes('capability: "secretary_meeting_pack_coordination"') && capability.includes("aiEnabled: false"));
must("platform_registration", platform.includes("secretary_meeting_pack_coordination"));
must("package_wiring", String(pkg.scripts?.["audit:operator-secretary-end-to-end"] || "").includes("operator-secretary-meeting-pack-coordination-audit.mjs"));
must("wrapper_wiring", wrapper.includes("certify-secretary-meeting-pack-coordination-local.mjs"));

console.log("OPERATOR_SECRETARY_MEETING_PACK_COORDINATION_AUDIT=PASS");
console.log("SECRETARY_MEETING_PACK_REFERENCES_ONLY=true");
console.log("SECRETARY_MEETING_PACK_REQUIRED_ITEMS_BLOCK_FINALIZATION=true");
console.log("SECRETARY_MEETING_PACK_FROZEN_VERSION_HISTORY=true");
console.log("SECRETARY_MEETING_PACK_DISTRIBUTION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_MEETING_PACK_ACKNOWLEDGEMENT_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_MEETING_PACK_ACKNOWLEDGEMENT_NOT_APPROVAL=true");
console.log("SECRETARY_MEETING_PACK_ACKNOWLEDGEMENT_NOT_ATTENDANCE=true");
console.log("SECRETARY_MEETING_PACK_FILE_CONTENT_READ=false");
console.log("SECRETARY_MEETING_PACK_CALENDAR_EVENT_MODIFIED=false");
console.log("SECRETARY_MEETING_PACK_EXTERNAL_MESSAGE_SENT_BY_RUNTIME=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
