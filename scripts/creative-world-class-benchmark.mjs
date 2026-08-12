#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  evaluateCreativeWorldClassBenchmark,
} from "../lib/creative/quality/runtime/CreativeWorldClassBenchmarkRuntime.js";

function loadInput(filename) {
  const absolute = path.resolve(filename);
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8"));
  if (!Array.isArray(parsed.cases)) {
    throw new Error("Benchmark input must contain a cases array");
  }
  return { absolute, parsed };
}

function main() {
  const filename =
    process.argv[2] || process.env.CREATIVE_WORLD_CLASS_BENCHMARK_INPUT;
  if (!filename) {
    console.log("CREATIVE_WORLD_CLASS_BENCHMARK=SKIPPED");
    console.log("REASON=INPUT_NOT_PROVIDED");
    console.log(
      "USAGE=node scripts/creative-world-class-benchmark.mjs <benchmark-results.json>",
    );
    return;
  }

  const { absolute, parsed } = loadInput(filename);
  const report = {
    ...evaluateCreativeWorldClassBenchmark({ cases: parsed.cases }),
    input: absolute,
  };

  const output = path.resolve(
    process.env.CREATIVE_WORLD_CLASS_BENCHMARK_OUTPUT ||
      "/tmp/creative-world-class-benchmark.json",
  );
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("============================================================");
  console.log("AVANTIQO CREATIVE WORLD-CLASS BENCHMARK");
  console.log("============================================================");
  console.log(`CONTRACT=${report.contract}`);
  console.log(`CASE_COUNT=${report.cases.length}`);
  console.log(`OVERALL_SCORE=${report.score}`);
  console.log(`PASSED=${report.passed ? "YES" : "NO"}`);
  console.log(`REPORT=${output}`);
  console.log("BENCHMARK_SCORER_PROVIDER_CALLS=NO");
  console.log("PUBLICATION_EXECUTED=NO");

  for (const entry of report.cases) {
    console.log(
      `CASE=${entry.id}|score=${entry.score}|passed=${
        entry.passed ? "YES" : "NO"
      }|workflow=${entry.workflow_kind || "UNKNOWN"}`,
    );
  }
  for (const failure of report.failures) console.log(`FAILURE=${failure}`);

  if (!report.passed) process.exitCode = 1;
}

main();
