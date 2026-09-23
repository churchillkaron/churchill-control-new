import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));
const cron = new Map(vercel.crons.map((item) => [item.path, item.schedule]));
const middleware = await readFile(new URL("middleware.js", root), "utf8");

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("release cron load is staggered and Google Reviews runs three times daily", () => {
  assert.equal(cron.get("/api/internal/reputation/google-reviews/process"), "0 0,8,16 * * *");
  assert.equal(cron.get("/api/internal/finance/payment-settlement/process"), "*/2 * * * *");
  assert.equal(cron.get("/api/internal/secretary/jobs/process"), "1-59/2 * * * *");
  assert.equal(cron.get("/api/internal/commercial/communications/email-inbox-sync"), "2-59/5 * * * *");
});

test("middleware never waits on Supabase auth for API traffic", () => {
  assert.match(middleware, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(middleware, /setTimeout\(resolve, 2500\)/);
});

test("heavy recurring workers use bounded release batches", async () => {
  const settlement = await source("app/api/internal/finance/payment-settlement/process/route.js");
  const secretaryJobs = await source("app/api/internal/secretary/jobs/process/route.js");
  const emailSync = await source("app/api/internal/commercial/communications/email-inbox-sync/route.js");
  const webhookRetries = await source("app/api/internal/developer/webhooks/retries/process/route.js");

  assert.match(settlement, /\|\| 25, 100/);
  assert.match(secretaryJobs, /prepareSecretaryPaperworkExecution\(\{ limit: 25 \}\)/);
  assert.match(emailSync, /syncDueEmailConnections\(\{ limit: 1 \}\)/);
  assert.match(webhookRetries, /\|\| 10, 25/);
});

test("Node1 routing defines local-required state before fast/deep decisions", async () => {
  const localQueue = await source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js");
  assert.match(localQueue, /const localRequired = policy === "local_only"/);
  assert.match(localQueue, /localRequired \|\| enabled\(process\.env\.AVANTIQO_LOCAL_FAST_INTELLIGENCE_ENABLED/);
});
