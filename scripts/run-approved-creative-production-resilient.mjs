#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

function integer(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryableInfrastructureFailure(output = "") {
  const value = String(output).toLowerCase();
  return (
    value.includes("canceling statement due to statement timeout") ||
    value.includes("statement timeout") ||
    value.includes("query timeout") ||
    value.includes("connection terminated") ||
    value.includes("connection reset") ||
    value.includes("econnreset") ||
    value.includes("etimedout") ||
    value.includes("fetch failed") ||
    value.includes("gateway timeout") ||
    value.includes("service unavailable") ||
    value.includes("temporarily unavailable") ||
    value.includes("pgrst003") ||
    value.includes("57014")
  );
}

function runOnce() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--loader",
        "./scripts/next-alias-loader.mjs",
        "scripts/run-approved-creative-production.mjs",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        shell: false,
        stdio: ["inherit", "pipe", "pipe"],
      },
    );

    const captured = [];
    const capture = (chunk, destination) => {
      destination.write(chunk);
      captured.push(Buffer.from(chunk));
      const total = captured.reduce((sum, item) => sum + item.length, 0);
      while (total > 2_000_000 && captured.length > 1) captured.shift();
    };

    child.stdout.on("data", (chunk) => capture(chunk, process.stdout));
    child.stderr.on("data", (chunk) => capture(chunk, process.stderr));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({
        code: Number.isInteger(code) ? code : 1,
        signal: signal || null,
        output: Buffer.concat(captured).toString("utf8"),
      });
    });
  });
}

const maxRetries = integer(
  process.env.CREATIVE_SUPERVISOR_INFRA_RETRY_LIMIT,
  24,
);
const baseDelayMs = integer(
  process.env.CREATIVE_SUPERVISOR_INFRA_RETRY_DELAY_MS,
  10000,
);
const maxDelayMs = integer(
  process.env.CREATIVE_SUPERVISOR_INFRA_MAX_DELAY_MS,
  60000,
);

console.log("============================================================");
console.log("AVANTIQO RESILIENT APPROVED PRODUCTION SUPERVISOR");
console.log("============================================================");
console.log(`INFRA_RETRY_LIMIT=${maxRetries}`);
console.log(`INFRA_RETRY_BASE_DELAY_MS=${baseDelayMs}`);
console.log("EXISTING_PROVIDER_JOBS_PRESERVED=YES");
console.log("COMPLETED_TASKS_PRESERVED=YES");
console.log("PROVIDER_JOB_RESUBMISSION_BY_SUPERVISOR=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
  console.log(`SUPERVISOR_ATTEMPT=${attempt}`);
  const result = await runOnce();

  if (result.code === 0) {
    console.log("SUPERVISOR_RESULT=SUCCESS");
    process.exitCode = 0;
    break;
  }

  const retryable = retryableInfrastructureFailure(result.output);
  console.log(
    `SUPERVISOR_ATTEMPT_RESULT=FAILED|ATTEMPT=${attempt}|` +
    `EXIT=${result.code}|RETRYABLE_INFRASTRUCTURE=${retryable ? "YES" : "NO"}`,
  );

  if (!retryable || attempt > maxRetries) {
    console.error("SUPERVISOR_RESULT=FAILED");
    process.exitCode = result.code || 1;
    break;
  }

  const delayMs = Math.min(
    maxDelayMs,
    baseDelayMs * Math.max(1, 2 ** Math.min(attempt - 1, 4)),
  );
  console.log(
    `SUPERVISOR_RETRY_SCHEDULED=YES|ATTEMPT=${attempt + 1}|DELAY_MS=${delayMs}`,
  );
  await sleep(delayMs);
}
