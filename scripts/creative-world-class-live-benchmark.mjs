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
import {
  scoreCreativeWorldClassBenchmarkCase,
} from "@/lib/creative/quality/runtime/CreativeWorldClassBenchmarkRuntime";

const AUTHORIZATION_MARKER = "[creative-benchmark]";
const OUTPUT = path.resolve(
  process.env.CREATIVE_WORLD_CLASS_LIVE_BENCHMARK_OUTPUT ||
    "/tmp/creative-world-class-live-benchmark.json",
);
const DIRECTION_OUTPUT = path.resolve(
  process.env.CREATIVE_WORLD_CLASS_LIVE_BENCHMARK_DIRECTION_OUTPUT ||
    OUTPUT.replace(/\.json$/, "") + "-direction.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function authorized() {
  return text(process.env.VERCEL_GIT_COMMIT_MESSAGE)
    .toLowerCase()
    .includes(AUTHORIZATION_MARKER);
}

// Withholding the overall score when cases failed structurally is right: a partial
// run cannot claim a benchmark result. Reducing the cases that did succeed to an id
// and a label was not. Their scores and per-dimension components were computed and
// then discarded, so a run reporting 80.68 against a floor of 90 gave no way to see
// which dimension was short -- and quality that cannot be measured cannot be improved.
//
// Completed cases are now scored individually and kept in full. Scoring one case needs
// nothing from the others; only the cross-case checks (direction similarity, workflow
// diversity) require the whole set, and those stay out of a partial run along with the
// overall score.
function scoredCase(entry) {
  try {
    const { direction_text, ...score } = scoreCreativeWorldClassBenchmarkCase(entry);
    return { ...score, id: entry.id, label: entry.label, status: "COMPLETED" };
  } catch (error) {
    return {
      id: entry.id,
      label: entry.label,
      status: "COMPLETED",
      score: null,
      scoring_error: String(error?.message || error).slice(0, 200),
    };
  }
}

function structuralFailureReport({ captured, execution, caseErrors }) {
  return {
    contract: "CREATIVE_WORLD_CLASS_BENCHMARK_V1",
    passed: false,
    evaluated_at: new Date().toISOString(),
    score: null,
    cases: captured.map(scoredCase),
    case_errors: caseErrors,
    failures: caseErrors.map(
      (entry) => `${entry.id}:STRUCTURAL_FAILURE:${entry.error}`,
    ),
    benchmark_provider_calls_executed: true,
    benchmark_provider_spend_approved: true,
    publication_executed: false,
    execution: {
      reasoning_provider_calls_executed: true,
      media_generation_executed: false,
      publication_executed: false,
      production_graph_created: false,
      production_task_created: false,
      cases: execution,
    },
  };
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
  const caseErrors = [];
  const rejectedDirections = [];

  for (const benchmarkCase of CREATIVE_WORLD_CLASS_BENCHMARK_CASES) {
    console.log(`BENCHMARK_CASE_START=${benchmarkCase.id}`);

    // A case that fails is a result worth recording. The first such case used to
    // throw and abort the whole run, so every later case went unscored and one weak
    // case hid the state of the rest. Cases are isolated and every one is reported.
    //
    // A structural failure is kept distinct from a poor score. Scoring a run where
    // cases never produced a plan would report OVERALL_SCORE=0 as though it were a
    // quality verdict, when the pipeline simply broke, so caseErrors routes to a
    // structural failure report instead of through evaluate().
    try {
      const result = await CreativeWorldClassLiveBenchmarkRuntime.runCase(
        benchmarkCase,
      );
      captured.push(result.case_result);
      execution.push({
        id: benchmarkCase.id,
        status: "COMPLETED",
        ...result.execution,
      });
      console.log(
        `BENCHMARK_CASE_RESULT=${benchmarkCase.id}|score=${result.score.score}|passed=${
          result.score.passed ? "YES" : "NO"
        }|workflow=${result.score.workflow_kind || "UNKNOWN"}`,
      );
    } catch (error) {
      const message = error?.message || String(error);
      caseErrors.push({
        id: benchmarkCase.id,
        error: message,
      });
      // The rejected direction is kept where the runtime attaches it, so a failed case still
      // leaves behind the work it produced rather than only the reason it was refused.
      rejectedDirections.push({
        id: benchmarkCase.id,
        label: benchmarkCase.label,
        status: "REJECTED",
        error: message,
        plan: error?.repaired_plan || error?.rejected_master?.plan || null,
      });
      execution.push({
        id: benchmarkCase.id,
        status: "STRUCTURAL_FAILURE",
        error: message,
        // The validators attach every failure with the path that produced it.
        // Keeping that here means a failed run is diagnosable from the report
        // instead of paying for another full set of reasoning calls just to see
        // which field was rejected.
        validation_failures: Array.isArray(error?.validation?.failures)
          ? error.validation.failures
          : null,
        reasoning_provider_calls_executed: true,
        media_generation_executed: false,
        publication_executed: false,
        production_graph_created: false,
        production_task_created: false,
      });
      console.error(
        `BENCHMARK_CASE_ERROR=${benchmarkCase.id}|${message}`,
      );
    }
  }

  let report;
  if (caseErrors.length) {
    report = structuralFailureReport({
      captured,
      execution,
      caseErrors,
    });
  } else {
    const benchmark = CreativeWorldClassLiveBenchmarkRuntime.evaluate(
      captured,
      CREATIVE_WORLD_CLASS_BENCHMARK_CASES,
    );
    report = {
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
  }

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  // The report keeps scores, metrics and a direction_hash -- a hash of the work rather than the work.
  // Every concept, story, scene architecture and shot plan these runs produce was being discarded at
  // the end of the run, so a day of paid reasoning left behind numbers and no readable direction. The
  // creative output is written alongside the report so it can actually be read, reviewed and reused.
  //
  // Rejected cases are written too. A plan refused for contract completeness still contains real
  // story and shot work, and that work is worth reading even when the case did not pass.
  const directions = {
    contract: "CREATIVE_WORLD_CLASS_BENCHMARK_DIRECTION_V1",
    produced_at: new Date().toISOString(),
    accepted: captured.map((entry) => ({
      id: entry.id,
      label: entry.label,
      plan: entry.master_plan?.plan || null,
    })),
    rejected: rejectedDirections,
  };
  fs.writeFileSync(DIRECTION_OUTPUT, `${JSON.stringify(directions, null, 2)}\n`, "utf8");
  console.log(`DIRECTION_OUTPUT=${DIRECTION_OUTPUT}`);

  console.log(`CONTRACT=${report.contract}`);
  console.log(`CASE_COUNT=${CREATIVE_WORLD_CLASS_BENCHMARK_CASES.length}`);
  console.log(`COMPLETED_CASE_COUNT=${captured.length}`);
  console.log(`STRUCTURAL_ERROR_COUNT=${caseErrors.length}`);
  console.log(`OVERALL_SCORE=${report.score ?? "NOT_EVALUATED"}`);
  console.log(`PASSED=${report.passed ? "YES" : "NO"}`);
  console.log(`REPORT=${OUTPUT}`);
  console.log("MEDIA_GENERATION_EXECUTED=NO");
  console.log("PUBLICATION_EXECUTED=NO");
  console.log("PRODUCTION_GRAPH_CREATED=NO");
  console.log("PRODUCTION_TASK_CREATED=NO");

  for (const entry of report.cases || []) {
    if (entry.score == null) continue;
    console.log(
      `CASE=${entry.id}|score=${entry.score}|passed=${
        entry.passed ? "YES" : "NO"
      }|workflow=${entry.workflow_kind || "UNKNOWN"}`,
    );
  }
  for (const entry of caseErrors) {
    console.log(`CASE_ERROR=${entry.id}|${entry.error}`);
  }
  for (const failure of report.failures || []) {
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
