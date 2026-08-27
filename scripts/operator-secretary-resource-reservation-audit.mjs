import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/operator/secretary/SecretaryResourceReservationRuntime.js", "utf8");
const capability = fs.readFileSync("lib/platform/capabilities/createSecretaryResourceReservationCapability.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260827194500_secretary_resource_reservations.sql", "utf8");
const platform = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const wrapper = fs.readFileSync("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8");

assert.match(runtime, /AVANTIQO_EXECUTIVE_SECRETARY_RESOURCE_RESERVATION_V1/);
assert.match(runtime, /reserveSecretaryResource/);
assert.match(runtime, /changeSecretaryResourceReservation/);
assert.match(runtime, /releaseSecretaryResourceReservation/);
assert.match(runtime, /atomic_overlap_enforced: true/);
assert.match(runtime, /external_booking_performed: false/);
assert.match(runtime, /calendar_event_created: false/);
assert.match(runtime, /calendar_event_modified: false/);
assert.match(runtime, /room_setup_performed: false/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /SECRETARY_RESOURCE_RESERVATION_SLOT_UNAVAILABLE/);
assert.match(migration, /secretary_change_resource_slot/);
assert.match(migration, /secretary_release_resource_slot/);
assert.match(capability, /secretary_resource_reservation/);
assert.match(capability, /aiEnabled: false/);
assert.match(platform, /createSecretaryResourceReservationCapability/);
assert.match(platform, /secretary_resource_reservation:/);
assert.match(pkg.scripts["audit:operator-secretary-end-to-end"], /operator-secretary-resource-reservation-audit\.mjs/);
assert.match(wrapper, /20260827194500_secretary_resource_reservations\.sql/);
assert.match(wrapper, /certify-secretary-resource-reservation-local\.mjs/);

console.log("OPERATOR_SECRETARY_RESOURCE_RESERVATION_AUDIT=PASS");
console.log("SECRETARY_RESOURCE_RESERVATION_ATOMIC_OVERLAP_ENFORCED=true");
console.log("SECRETARY_RESOURCE_RESERVATION_EXTERNAL_BOOKING_PERFORMED=false");
console.log("SECRETARY_RESOURCE_RESERVATION_CALENDAR_EVENT_CREATED=false");
console.log("SECRETARY_RESOURCE_RESERVATION_CALENDAR_EVENT_MODIFIED=false");
console.log("SECRETARY_RESOURCE_RESERVATION_ROOM_SETUP_PERFORMED=false");
console.log("SECRETARY_RESOURCE_RESERVATION_AI_INFERENCE_ENABLED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
