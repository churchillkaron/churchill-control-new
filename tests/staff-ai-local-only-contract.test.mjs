import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/staff/ai-feed/route.js", "utf8");

test("staff intelligence uses Avantiqo local-only provider", () => {
  assert.match(route, /provider_id:\s*\n\s*"avantiqo-intelligence"/);
  assert.match(route, /execution_lane:\s*\n\s*"fast"/);
  assert.doesNotMatch(route, /provider_id:\s*\n\s*"openai"/);
  assert.doesNotMatch(route, /gpt-4o/i);
});

test("staff intelligence prompt is industry-neutral", () => {
  assert.match(route, /Avantiqo Staff Intelligence/);
  assert.match(route, /Do not assume a restaurant, hotel, nightlife, healthcare, school, workshop/);
  assert.doesNotMatch(route, /Churchill AI/);
  assert.doesNotMatch(route, /luxury hospitality realtime feed/i);
});
