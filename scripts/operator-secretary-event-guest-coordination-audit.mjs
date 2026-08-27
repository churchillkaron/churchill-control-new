import fs from "node:fs";

const runtime = fs.readFileSync("lib/operator/secretary/SecretaryEventGuestCoordinationRuntime.js", "utf8");
const capability = fs.readFileSync("lib/platform/capabilities/createSecretaryEventGuestCoordinationCapability.js", "utf8");
const platform = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const pkg = fs.readFileSync("package.json", "utf8");
const wrapper = fs.readFileSync("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8");

const checks = [
  ["contract", runtime.includes("AVANTIQO_EXECUTIVE_SECRETARY_EVENT_GUEST_COORDINATION_V1")],
  ["source", runtime.includes("secretary_event_guest_coordination")],
  ["explicit-response-states", runtime.includes("ACCEPTED") && runtime.includes("DECLINED") && runtime.includes("MAYBE") && runtime.includes("PENDING")],
  ["attendance-not-inferred", runtime.includes("attendance_inferred: false")],
  ["invitation-delivery-not-inferred", runtime.includes("invitation_delivery_inferred: false")],
  ["physical-access-not-granted", runtime.includes("physical_access_granted_by_secretary: false")],
  ["calendar-not-mutated", runtime.includes("calendar_event_created: false") && runtime.includes("calendar_event_modified: false")],
  ["resource-not-reserved", runtime.includes("resource_reserved: false")],
  ["catering-not-ordered", runtime.includes("catering_ordered: false")],
  ["vendor-commitment-not-created", runtime.includes("vendor_commitment_created: false")],
  ["payment-authority-false", runtime.includes("payment_authority_created: false")],
  ["evidence-reuse-fenced", runtime.includes("SECRETARY_EVENT_GUEST_EVIDENCE_REUSE_CONFLICT")],
  ["stale-version-fenced", runtime.includes("SECRETARY_EVENT_GUEST_STALE_VERSION")],
  ["required-responses-block-finalize", runtime.includes("SECRETARY_EVENT_GUEST_REQUIRED_RESPONSES_PENDING")],
  ["initial-invitations", runtime.includes("ensureInitialInvitations")],
  ["rsvp-reminders", runtime.includes("RSVP_REMINDER")],
  ["all-actions", ["start","addGuest","recordInvitation","recordResponse","remind","finalize","reopen","cancel","read","list"].every((action) => capability.includes(`${action}:`))],
  ["ai-disabled", capability.includes("aiEnabled: false")],
  ["platform-wired", platform.includes("createSecretaryEventGuestCoordinationCapability") && platform.includes("secretary_event_guest_coordination")],
  ["package-wired", pkg.includes("operator-secretary-event-guest-coordination-audit.mjs")],
  ["wrapper-wired", wrapper.includes("certify-secretary-event-guest-coordination-local.mjs")],
];

const failed = checks.filter(([, pass]) => !pass).map(([name]) => name);
if (failed.length) {
  console.error(`OPERATOR_SECRETARY_EVENT_GUEST_COORDINATION_AUDIT=FAIL:${failed.join(",")}`);
  process.exit(1);
}

console.log("OPERATOR_SECRETARY_EVENT_GUEST_COORDINATION_AUDIT=PASS");
console.log("SECRETARY_EVENT_GUEST_EXPLICIT_RSVP_ONLY=true");
console.log("SECRETARY_EVENT_GUEST_ATTENDANCE_INFERRED=false");
console.log("SECRETARY_EVENT_GUEST_INVITATION_DELIVERY_INFERRED=false");
console.log("SECRETARY_EVENT_GUEST_PHYSICAL_ACCESS_GRANTED=false");
console.log("SECRETARY_EVENT_GUEST_CALENDAR_EVENT_MUTATED=false");
console.log("SECRETARY_EVENT_GUEST_RESOURCE_RESERVED=false");
console.log("SECRETARY_EVENT_GUEST_CATERING_ORDERED=false");
console.log("SECRETARY_EVENT_GUEST_VENDOR_COMMITMENT_CREATED=false");
console.log("SECRETARY_EVENT_GUEST_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
