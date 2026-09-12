import test from "node:test";
import assert from "node:assert/strict";

import { buildResearchRoomReport } from "../lib/creative/production-room/runtime/CreativeResearchRoomAdapterRuntime.js";

test("V5 root research evidence supports location-neutral Research Room without treating company country as shoot location", () => {
  const report = buildResearchRoomReport({
    research: {
      sources: [
        { id: "source-1", title: "Official", url: "https://example.com" },
        { id: "source-2", title: "Market", url: "https://example.org" },
      ],
      validation: { passed: true },
      company_resolution: { status: "VERIFIED", location: "TH", canonical_name: "Example Co" },
      audience: { primary_audience: "Global operators" },
      claims: [{ id: "claim-1", claim: "Verified operating truth", verified: true }],
      creative_grounding: {
        continuity_constraints: ["Must convey scale without showing specific locations."],
        reference_candidates: [{ id: "ref-1", source_url: "https://example.com" }],
      },
    },
  });
  assert.equal(report.passed, true, report.failures.join(","));
  assert.equal(report.evidence.weather_daylight_findings.status, "DEFERRED_UNTIL_LOCATION_SELECTION");
  assert.equal(report.reference_candidates.length, 1);
});
