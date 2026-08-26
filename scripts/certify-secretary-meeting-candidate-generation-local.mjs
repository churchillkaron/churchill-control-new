import assert from "node:assert/strict";
import { buildSecretaryMeetingCandidateSlots } from "../lib/operator/secretary/SecretaryMeetingCandidateSlotRuntime.js";

const windowStart = "2026-10-22T02:00:00.000Z";
const windowEnd = "2026-10-22T07:00:00.000Z";
const durationMinutes = 60;

const result = buildSecretaryMeetingCandidateSlots({
  windowStart,
  windowEnd,
  durationMinutes,
  timezone: "Asia/Bangkok",
  busyWindows: [
    { starts_at: "2026-10-22T03:00:00.000Z", ends_at: "2026-10-22T04:30:00.000Z" },
    { starts_at: "2026-10-22T06:00:00.000Z", ends_at: "2026-10-22T06:30:00.000Z" },
  ],
});

assert.deepEqual(
  result.candidate_slots.map((slot) => [slot.starts_at, slot.ends_at]),
  [
    ["2026-10-22T02:00:00.000Z", "2026-10-22T03:00:00.000Z"],
    ["2026-10-22T04:30:00.000Z", "2026-10-22T05:30:00.000Z"],
  ],
  "Candidate generation must use only complete duration-sized gaps around owner calendar conflicts",
);

for (const slot of result.candidate_slots) {
  assert.ok(Date.parse(slot.starts_at) >= Date.parse(windowStart));
  assert.ok(Date.parse(slot.ends_at) <= Date.parse(windowEnd));
  assert.equal(Date.parse(slot.ends_at) - Date.parse(slot.starts_at), durationMinutes * 60_000);
  assert.equal(slot.timezone, "Asia/Bangkok");
}

const overlap = (slot, busy) => Date.parse(slot.starts_at) < Date.parse(busy.ends_at) && Date.parse(slot.ends_at) > Date.parse(busy.starts_at);
for (const slot of result.candidate_slots) {
  assert.equal(overlap(slot, { starts_at: "2026-10-22T03:00:00.000Z", ends_at: "2026-10-22T04:30:00.000Z" }), false);
  assert.equal(overlap(slot, { starts_at: "2026-10-22T06:00:00.000Z", ends_at: "2026-10-22T06:30:00.000Z" }), false);
}

const mergedBusy = buildSecretaryMeetingCandidateSlots({
  windowStart: "2026-10-22T02:00:00.000Z",
  windowEnd: "2026-10-22T05:00:00.000Z",
  durationMinutes: 30,
  timezone: "Asia/Bangkok",
  busyWindows: [
    { starts_at: "2026-10-22T02:30:00.000Z", ends_at: "2026-10-22T03:15:00.000Z" },
    { starts_at: "2026-10-22T03:00:00.000Z", ends_at: "2026-10-22T03:45:00.000Z" },
  ],
});
assert.equal(mergedBusy.busy_window_count, 1, "Overlapping calendar conflicts must merge before slot generation");
assert.equal(mergedBusy.candidate_slots.some((slot) => Date.parse(slot.starts_at) < Date.parse("2026-10-22T03:45:00.000Z") && Date.parse(slot.ends_at) > Date.parse("2026-10-22T02:30:00.000Z")), false);

assert.equal(result.owner_calendar_checked, true);
assert.equal(result.business_hours_invented, false);
assert.equal(result.calendar_event_created, false);
assert.equal(result.external_authority_used, false);

assert.throws(
  () => buildSecretaryMeetingCandidateSlots({
    windowStart,
    windowEnd,
    durationMinutes: 0,
    timezone: "Asia/Bangkok",
    busyWindows: [],
  }),
  /SECRETARY_MEETING_CANDIDATE_DURATION_INVALID/,
);

assert.throws(
  () => buildSecretaryMeetingCandidateSlots({
    windowStart: windowEnd,
    windowEnd: windowStart,
    durationMinutes,
    timezone: "Asia/Bangkok",
    busyWindows: [],
  }),
  /SECRETARY_MEETING_CANDIDATE_WINDOW_INVALID/,
);

console.log("SECRETARY_MEETING_CANDIDATE_GENERATION_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_CANDIDATES_RESPECT_EXPLICIT_WINDOW=true");
console.log("SECRETARY_CANDIDATES_RESPECT_EXACT_DURATION=true");
console.log("SECRETARY_OWNER_CALENDAR_CONFLICTS_EXCLUDED=true");
console.log("SECRETARY_OVERLAPPING_BUSY_WINDOWS_MERGED=true");
console.log("SECRETARY_BUSINESS_HOURS_INVENTED=false");
console.log("SECRETARY_CANDIDATE_GENERATION_CREATES_BOOKING=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
