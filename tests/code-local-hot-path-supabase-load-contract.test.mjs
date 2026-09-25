import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const progress = await readFile(new URL("../lib/code/runtime/CodeAILiveProgressRuntime.js", import.meta.url), "utf8");
const feed = await readFile(new URL("../components/operator/CodeProgressFeedProvider.jsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/progress/route.js", import.meta.url), "utf8");
const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const access = await readFile(new URL("../lib/platform/security/requireOrganizationAccess.js", import.meta.url), "utf8");

test("live Code progress stays local on the hot path and checkpoints durably", () => {
  assert.match(progress, /DURABLE_PROGRESS_CHECKPOINT_MS = 15 \* 1000/);
  assert.match(progress, /WORKER_LEASE_TOUCH_INTERVAL_MS = 60 \* 1000/);
  assert.match(progress, /CODE_AI_LIVE_PROGRESS_LOCAL_HOT_PATH/);
  assert.match(progress, /local_authoritative: true/);
  assert.match(progress, /durable_lookup_performed: false/);
  assert.match(progress, /last_durable_checkpoint_attempt_at/);
});

test("shared progress polling stays sub-second while expensive details remain sampled", () => {
  assert.match(feed, /ACTIVE_POLL_MS = 750/);
  assert.match(feed, /ACTIVE_REFRESH_BURST_POLL_MS = 250/);
  assert.match(feed, /ACTIVE_REFRESH_BURST_POLLS = 8/);
  assert.match(feed, /burstPollsRemaining\.current = Math\.max/);
  assert.match(feed, /burstPollsRemaining\.current -= 1/);
  assert.match(feed, /IDLE_POLL_MS = 15000/);
  assert.match(feed, /ACTIVE_DETAIL_REFRESH_EVERY = 80/);
  assert.match(feed, /consecutiveFailures/);
  assert.match(feed, /Math\.min\(60000, baseDelay \* \(2 \*\* Math\.min\(consecutiveFailures, 4\)\)\)/);
  assert.match(feed, /details=\$\{includeDetails \? "1" : "0"\}/);
  assert.match(route, /const includeDetails =/);
  assert.match(route, /includeDetails\s*\? await loadLatestProductEngineeringPortfolio/);
  assert.match(route, /if \(includeDetails && progress\?\.mission_id\)/);
});

test("IDE health polling cannot overlap while Code is active", () => {
  assert.doesNotMatch(ide, /setInterval\(async \(\) => \{[\s\S]*ideRequest\("state"\)/);
  assert.match(ide, /async function pollIdeState\(\)/);
  assert.match(ide, /window\.setTimeout\(pollIdeState, delayMs\)/);
  assert.match(ide, /\? 10000[\s\S]*\? 15000[\s\S]*: 30000/);
  assert.match(ide, /Math\.min\(30000, baseDelayMs \* \(2 \*\* Math\.min\(consecutiveFailures, 3\)\)\)/);
});

test("organization access hot cache is credential and permission scoped", () => {
  assert.match(access, /ACCESS_HOT_CACHE_TTL_MS = 10 \* 1000/);
  assert.match(access, /createHash\("sha256"\)/);
  assert.match(access, /authorization/);
  assert.match(access, /cookie/);
  assert.match(access, /all_required/);
  assert.match(access, /any_required/);
  assert.match(access, /if \(hotCached\?\.success === true\)/);
  assert.match(access, /storeAccessHotCache\(hotCacheKey, granted\)/);
});
