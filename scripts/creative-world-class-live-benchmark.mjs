#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  CREATIVE_WORLD_CLASS_BENCHMARK_CASES,
} from "@/app/api/creative/tests/world-class-benchmark/fixtures";
import {
  CreativeWorldClassLiveBenchmarkRuntime,
} from "@/lib/creative/quality/runtime/CreativeWorldClassLiveBenchmarkRuntime";

const AUTHORIZATION_MARKER = "[creative-benchmark]";
const OUTPUT = path.resolve(
  process.env.CREATIVE_WORLD_CLASS_LIVE_BENCHMARK_OUTPUT ||
    "/tmp/creative-world-class-live-benchmark.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function authorized() {
  return text(process.env.VERCEL_GIT_COMMIT_MESSAGE)
    .toLowerCase()
    .includes(AUTHORIZATION_MARKER);
}

async function main() {
  console.log("============================================================");
  console.log("AVANTIQO CREATIVE LIVE WORLD-CLASS PROOF");
  console.log("============================================================");

  if (!authorized()) {
    console.log("CREATIVE_WORLD_CLASS_LIVE_BENCHMARK=SKIPPED");
    console.log("REASON=EXPLICIT_CREATIVE_BENCHMARK_MARKER_REQUIRED");
    console.log("MEDIA_GENERATION_EXECUTED=NO");
    console.log("PUBLICATION_EXECUTED=NO");
    return;
  }

  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    throw new Error("CREATIVE_LIVE_BENCHMARK_PRODUCTION_ENV_REQUIRED");
  }

  console.log("AUTHORIZATION=EXPLICIT_CREATIVE_BENCHMARK_MARKER");
  console.log("REASONING_PROVIDER_CALLS_EXECUTED=YES");
  console.log("MEDIA_GENERATION_EXECUTED=NO");
  console.log("PUBLICATION_EXECUTED=NO");
  console.log("PRODUCTION_GRAPH_CREATED=NO");
  console.log("PRODUCTION_TASK_CREATED=NO");

  const captured = [];
  const execution = [];

  for (const benchmarkCase of CREATIVE_WORLD_CLASS_BENCHMARK_CASES) {
    console.log(`BENCHMARK_CASE_START=${benchmarkCase.id}`);
    const result = await CreativeWorldClassLiveBenchmarkRuntime.runCase(
      benchmarkCase,
    );
    captured.push(result.case_result);
    execution.push({
      id: benchmarkCase.id,
      ...result.execution,
    });
    console.log(
      `BENCHMARK_CASE_RESULT=${benchmarkCase.id}|score=${result.score.score}|passed=${
        result.score.passed ? "YES" : "NO"
      }|workflow=${result.score.workflow_kind || "UNKNOWN"}`,
    );
  }

  const benchmark = CreativeWorldClassLiveBenchmarkRuntime.evaluate(
    captured,
    CREATIVE_WORLD_CLASS_BENCHMARK_CASES,
  );
  const report = {
    ...benchmark,
    execution: {
      reasoning_provider_calls_executed: true,
      media_generation_executed: false,
      publication_executed: false,
      production_graph_created: false,
      production_task_created: false,
      cases: execution,
    },
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`CONTRACT=${report.contract}`);
  console.log(`CASE_COUNT=${report.cases.length}`);
  console.log(`OVERALL_SCORE=${report.score}`);
  console.log(`PASSED=${report.passed ? "YES" : "NO"}`);
  console.log(`REPORT=${OUTPUT}`);
  console.log("MEDIA_GENERATION_EXECUTED=NO");
  console.log("PUBLICATION_EXECUTED=NO");
  console.log("PRODUCTION_GRAPH_CREATED=NO");
  console.log("PRODUCTION_TASK_CREATED=NO");

  for (const entry of report.cases) {
    console.log(
      `CASE=${entry.id}|score=${entry.score}|passed=${
        entry.passed ? "YES" : "NO"
      }|workflow=${entry.workflow_kind || "UNKNOWN"}`,
    );
  }
  for (const failure of report.failures) {
    console.log(`FAILURE=${failure}`);
  }

  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error("CREATIVE_WORLD_CLASS_LIVE_BENCHMARK=FAILED");
  console.error(error?.stack || error?.message || error);
  console.log("MEDIA_GENERATION_EXECUTED=NO");
  console.log("PUBLICATION_EXECUTED=NO");
  console.log("PRODUCTION_GRAPH_CREATED=NO");
  console.log("PRODUCTION_TASK_CREATED=NO");
  process.exitCode = 1;
});
