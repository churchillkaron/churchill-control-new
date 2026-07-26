#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";

function env(name, fallback = null) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function required(name) {
  const value = env(name);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function csv(name) {
  return String(required(name))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function headers() {
  const result = {
    "content-type": "application/json",
    accept: "application/json",
  };
  const cookie = env("CREATIVE_SMOKE_COOKIE");
  const bearer = env("CREATIVE_SMOKE_BEARER_TOKEN");
  if (cookie) result.cookie = cookie;
  if (bearer) result.authorization = `Bearer ${bearer}`;
  const extra = env("CREATIVE_SMOKE_HEADERS_JSON");
  if (extra) Object.assign(result, JSON.parse(extra));
  return result;
}

async function main() {
  const baseUrl = required("CREATIVE_SMOKE_BASE_URL");
  const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
  const outputPath = env(
    "CREATIVE_PREFLIGHT_OUTPUT",
    `creative-studio-live-preflight-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  const estimatedMaximumCost = Number(required("CREATIVE_SMOKE_ESTIMATED_MAXIMUM_COST"));
  if (!Number.isFinite(estimatedMaximumCost) || estimatedMaximumCost < 0) {
    throw new Error("CREATIVE_SMOKE_ESTIMATED_MAXIMUM_COST must be a non-negative number");
  }

  const body = {
    organization_id: organizationId,
    required_service_ids: csv("CREATIVE_SMOKE_REQUIRED_SERVICE_IDS"),
    required_provider_ids: csv("CREATIVE_SMOKE_REQUIRED_PROVIDER_IDS"),
    selected_asset_ids: csv("CREATIVE_SMOKE_SELECTED_ASSET_IDS"),
    publish_target_id: required("CREATIVE_SMOKE_PUBLISH_TARGET_ID"),
    estimated_maximum_cost: estimatedMaximumCost,
  };

  const response = await fetch(new URL("/api/creative/release/preflight", baseUrl), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }

  const report = {
    passed: response.ok && payload.success !== false && payload.ready === true,
    status: response.status,
    base_url: baseUrl,
    request: body,
    response: payload,
    evaluated_at: new Date().toISOString(),
  };
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("============================================================");
  console.log("AVANTIQO CREATIVE STUDIO LIVE PREFLIGHT");
  console.log("============================================================");
  console.log(`READY=${report.passed ? "YES" : "NO"}`);
  console.log(`REPORT=${outputPath}`);
  if (!report.passed) {
    console.log(`BLOCKING_CHECKS=${(payload.blocking_checks || []).join(",")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("CREATIVE STUDIO LIVE PREFLIGHT FAILED");
  console.error(error);
  process.exitCode = 1;
});
