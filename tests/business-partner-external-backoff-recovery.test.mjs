import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  authorizeBusinessPartnerExternalBackoffWake,
  createBusinessPartnerExternalBackoffRecoveryState,
} from "../lib/operator/runtime/BusinessPartnerExternalBackoffRecoveryRuntime.mjs";
import { classifyOperatorFailureRecovery } from "../lib/operator/runtime/OperatorRepairSupervisionPolicy.js";

const worker = fs.readFileSync("lib/operator/runtime/BusinessPartnerExternalWaitWorkerRuntime.js", "utf8");
const waitRuntime = fs.readFileSync("lib/operator/runtime/BusinessPartnerExternalWaitRuntime.js", "utf8");
const synthetic = fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");

test("temporary read failures become bounded durable backoff", () => {
  const state = createBusinessPartnerExternalBackoffRecoveryState({
    transientRecovery: { read_only_retry: true },
    recovery: { capability: { mode: "read" }, failure_evidence: { error_code: "HTTP_503" } },
    reason: "provider temporarily unavailable",
    now: new Date("2026-09-11T00:00:00.000Z"),
  });
  assert.equal(state.status, "WAITING_BACKOFF");
  assert.equal(state.attempt_count, 1);
  assert.equal(state.delay_seconds, 60);
  assert.equal(state.read_only_retry, true);
  assert.equal(state.mutation_replay_allowed, false);
});
test("retry-after is honored and repeated failures escalate backoff", () => {
  const first = createBusinessPartnerExternalBackoffRecoveryState({
    transientRecovery: { read_only_retry: true },
    recovery: { capability: { mode: "read" }, failure_evidence: { error_code: "HTTP_429", retry_after_seconds: 240 } },
    reason: "RATE_LIMIT retry-after 240",
    now: new Date("2026-09-11T00:00:00.000Z"),
  });
  assert.equal(first.delay_seconds, 240);
  const second = createBusinessPartnerExternalBackoffRecoveryState({
    transientRecovery: { read_only_retry: true },
    recovery: { capability: { mode: "read" }, failure_evidence: { error_code: "HTTP_503" } },
    previousRecovery: { external_backoff_recovery: first },
    reason: "HTTP 503",
    now: new Date("2026-09-11T00:04:00.000Z"),
  });
  assert.equal(second.attempt_count, 2);
  assert.equal(second.delay_seconds, 120);
});

test("writes never enter timed retry", () => {
  const state = createBusinessPartnerExternalBackoffRecoveryState({
    transientRecovery: { read_only_retry: false },
    recovery: { capability: { mode: "execute" }, failure_evidence: { phase: "action", error_code: "HTTP_TIMEOUT" } },
    reason: "network timeout",
  });
  assert.equal(state, null);
});
test("due wake grants only same-action read retry", () => {
  const due = authorizeBusinessPartnerExternalBackoffWake({
    contract: "AVANTIQO_BUSINESS_PARTNER_EXTERNAL_BACKOFF_RECOVERY_V1",
    status: "WAITING_BACKOFF",
    read_only_retry: true,
    mutation_replay_allowed: false,
  });
  assert.equal(due.status, "RETRY_DUE");
  assert.equal(due.resume_authorized, true);
  assert.equal(due.authorization_effect, "SAME_ACTION_ONLY");
});

test("429 is transient while hard quota remains governance", () => {
  assert.equal(classifyOperatorFailureRecovery({ execution: { status: "failed", reason: "RATE_LIMIT", failure_evidence: { status_code: 429 } } }).classification, "TRANSIENT_RUNTIME");
  assert.equal(classifyOperatorFailureRecovery({ execution: { status: "failed", reason: "QUOTA_EXCEEDED", failure_evidence: {} } }).classification, "CONFIGURATION_OR_EXTERNAL");
});

test("durable wait worker promotes only due backoff and reacquires access", () => {
  assert.match(worker, /promoteDueBackoffWaits/);
  assert.match(worker, /retry_not_before/);
  assert.match(worker, /activeWaitBinding/);
  assert.match(worker, /resolveDelegatedOrganizationAccess/);
  assert.match(worker, /agreementForWaitWake/);
  assert.match(waitRuntime, /registerBusinessPartnerRecoveryBackoffWait/);
});
test("event continuation cannot be swallowed by fast chat", () => {
  assert.match(synthetic, /eventBackoff\.status, 80\) === "RETRY_DUE"/);
  assert.match(synthetic, /eventBackoff\.mutation_replay_allowed === false/);
  assert.match(core, /verifiedExternalBackoffRecovery/);
  assert.match(core, /Retry exact original read after durable external backoff/);
});

test("external wait worker is scheduled every minute in source config", () => {
  const parsed = JSON.parse(vercel);
  const cron = parsed.crons.find((entry) => entry.path === "/api/internal/operator/external-waits/process");
  assert.equal(cron?.schedule, "* * * * *");
});