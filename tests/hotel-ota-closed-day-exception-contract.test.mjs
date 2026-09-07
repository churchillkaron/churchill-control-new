import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ingest = fs.readFileSync("lib/hotel/channels/HotelChannelReservationIngestRuntime.js", "utf8");
const evidence = fs.readFileSync("lib/hotel/channels/HotelChannelEvidenceRuntime.js", "utf8");
const control = fs.readFileSync("app/api/hotel/channels/reservation-control/route.js", "utf8");
const page = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/channel-reservations/page.jsx", "utf8");

test("canonical OTA failures become manual review instead of provider retry", () => {
  assert.match(ingest, /recordReservationProcessingFailure/);
  assert.match(evidence, /status: 'MANUAL_REVIEW'/);
  assert.match(evidence, /error_code:/);
  assert.match(evidence, /error_message:/);
});

test("closed business day is a first-class canonical exception", () => {
  assert.match(control, /HOTEL_BUSINESS_DAY_CLOSED/);
  assert.match(control, /return 'DAY_CLOSED_REVIEW'/);
  assert.match(control, /Only the current property day may be explicitly reopened with a reason/);
  assert.match(control, /historical days remain immutable/);
  assert.match(control, /dayClosedReview:/);
});

test("closed-day work never exposes provider retry and routes to Day Close", () => {
  assert.match(page, /closedDayReview = item\.workState === "DAY_CLOSED_REVIEW"/);
  assert.match(page, /closedDayReview \? <HotelSecondaryAction href=\{`\/workspace\/\$\{organizationId\}\/operations\/night-audit`\}>Review Day Close/);
  assert.match(page, /const retryable = \["PROVIDER_RETRY", "AWAITING_ACK"\]\.includes\(item\.workState\)/);
  assert.doesNotMatch(page, /\["DAY_CLOSED_REVIEW"[^\]]*\]\.includes\(item\.workState\)[\s\S]{0,160}Retry OTA handoff/);
});

test("workboard explains certified-day immutability", () => {
  assert.match(page, /Automation stops before it can rewrite certified Hotel truth/);
  assert.match(page, /only the current day can be explicitly reopened with evidence/);
  assert.match(page, /historical days stay immutable/);
});
