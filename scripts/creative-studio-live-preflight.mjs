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

function json(name) {
  const raw = required(name);
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") {
      throw new Error("must contain an object or array");
    }
    return value;
  } catch (error) {
    throw new Error(`${name} invalid JSON: ${error.message}`);
  }
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
  if (!Number.isFinite(estimatedMaximumCost) || estimatedMaximumCost <= 0) {
    throw new Error("CREATIVE_SMOKE_ESTIMATED_MAXIMUM_COST must be greater than zero");
  }

  const publishTarget = json("CREATIVE_SMOKE_PUBLISH_TARGET_JSON");
  const creativeQualityPolicy = json("CREATIVE_SMOKE_CREATIVE_QUALITY_POLICY_JSON");
  const semanticQualityPolicy = json("CREATIVE_SMOKE_SEMANTIC_POLICY_JSON");
  const executionRequirements = json("CREATIVE_SMOKE_EXECUTION_REQUIREMENTS_JSON");
  if (!Array.isArray(executionRequirements) || !executionRequirements.length) {
    throw new Error("CREATIVE_SMOKE_EXECUTION_REQUIREMENTS_JSON must be a non-empty array");
  }

  const body = {
    organization_id: organizationId,
    execution_requirements: executionRequirements,
    selected_asset_ids: csv("CREATIVE_SMOKE_SELECTED_ASSET_IDS"),
    publish_target_id: required("CREATIVE_SMOKE_PUBLISH_TARGET_ID"),
    publish_target: publishTarget,
    required_media_kind: required("CREATIVE_SMOKE_MEDIA_KIND"),
    creative_quality_policy: creativeQualityPolicy,
    semantic_quality_policy: semanticQualityPolicy,
    estimated_maximum_cost: estimatedMaximumCost,
    estimated_maximum_cost_currency: required(
      "CREATIVE_SMOKE_ESTIMATED_MAXIMUM_COST_CURRENCY",
    ),
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
