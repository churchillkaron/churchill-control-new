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

  const caseFailures = [];

  for (const benchmarkCase of CREATIVE_WORLD_CLASS_BENCHMARK_CASES) {
    console.log(`BENCHMARK_CASE_START=${benchmarkCase.id}`);

    // A case the tribunal rejects, or that fails mid-pipeline, is a result worth
    // recording. Previously the first such case threw and aborted the whole run,
    // so every later case went unscored and one weak case hid the state of the
    // rest. Cases are now isolated and the benchmark always reports on all of them.
    let result;
    try {
      result = await CreativeWorldClassLiveBenchmarkRuntime.runCase(benchmarkCase);
    } catch (error) {
      const message = String(error?.message || error);
      const rejection = message.match(/REJECTED:([\d.]+):([\d.]+)/);

      caseFailures.push({ id: benchmarkCase.id, error: message });
      // An empty plan is the honest representation of a case that never produced
      // one: the scorer reads it, awards nothing, and the case counts against the
      // benchmark. Omitting the case entirely would trip the "all cases required"
      // guard in evaluate() and abort exactly the run we are trying to complete.
      captured.push({
        id: benchmarkCase.id,
        label: benchmarkCase.label,
        benchmark: benchmarkCase.benchmark,
        master_plan: { plan: {} },
        failure: message.slice(0, 300),
      });
      execution.push({
        id: benchmarkCase.id,
        failed: true,
        error: message,
        // The validator attaches every failure with its path; keeping it here means
        // a failed run can be diagnosed from the report instead of paying for
        // another full set of reasoning calls just to see which field was rejected.
        validation_failures: Array.isArray(error?.validation?.failures)
          ? error.validation.failures
          : null,
      });

      console.log(
        `BENCHMARK_CASE_RESULT=${benchmarkCase.id}|score=${
          rejection ? rejection[1] : "0"
        }|passed=NO|reason=${message.slice(0, 90)}`,
      );
      continue;
    }

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

  if (caseFailures.length) {
    console.log(`BENCHMARK_CASES_FAILED=${caseFailures.length}`);
    for (const failure of caseFailures) {
      console.log(
        `BENCHMARK_CASE_FAILURE=${failure.id}|${failure.error.slice(0, 500)}`,
      );
    }
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
