import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_REPOSITORY_REGRESSION_DELTA_V2";
const args = process.argv.slice(2);

function arg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || "").trim() : "";
}

function exitCode(name) {
  const value = Number(arg(name));
  if (!Number.isInteger(value) || value < 0) throw new Error(`${CONTRACT}_${name.replace(/^--/, "").toUpperCase()}_INVALID`);
  return value;
}

function normalizeFailure(value) {
  return String(value || "")
    .trim()
    .replace(/\s+\([^()]*(?:ms|s)\)\s*$/, "")
    .replace(/\s+\[[^\]]+\]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractRepositoryTestFailures(log) {
  const failures = new Set();
  for (const rawLine of String(log || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    let match = line.match(/^✖\s+(.+)$/u);
    if (match) {
      const signature = normalizeFailure(match[1]);
      if (signature) failures.add(signature);
      continue;
    }
    match = line.match(/^not ok\s+\d+\s+-\s+(.+)$/i);
    if (match) {
      const signature = normalizeFailure(match[1]);
      if (signature) failures.add(signature);
    }
  }
  return [...failures].sort();
}

export function compareRepositoryRegressionDelta({ headLog, baseLog, headExit, baseExit }) {
  if (headExit === 0) {
    return {
      success: true,
      contract: CONTRACT,
      head_exit: headExit,
      base_exit: baseExit,
      head_failures: [],
      base_failures: baseExit === 0 ? [] : extractRepositoryTestFailures(baseLog),
      new_failures: [],
      reason: "HEAD_GREEN",
    };
  }
  if (baseExit === 0) {
    return {
      success: false,
      contract: CONTRACT,
      head_exit: headExit,
      base_exit: baseExit,
      head_failures: extractRepositoryTestFailures(headLog),
      base_failures: [],
      new_failures: extractRepositoryTestFailures(headLog),
      reason: "BASE_GREEN_HEAD_RED",
    };
  }

  const headFailures = extractRepositoryTestFailures(headLog);
  const baseFailures = extractRepositoryTestFailures(baseLog);
  if (!headFailures.length || !baseFailures.length) {
    return {
      success: false,
      contract: CONTRACT,
      head_exit: headExit,
      base_exit: baseExit,
      head_failures: headFailures,
      base_failures: baseFailures,
      new_failures: [],
      reason: "FAILURE_OUTPUT_UNPARSEABLE",
    };
  }
  const baseline = new Set(baseFailures);
  const newFailures = headFailures.filter((failure) => !baseline.has(failure));
  return {
    success: newFailures.length === 0,
    contract: CONTRACT,
    head_exit: headExit,
    base_exit: baseExit,
    head_failures: headFailures,
    base_failures: baseFailures,
    new_failures: newFailures,
    reason: newFailures.length ? "NEW_REPOSITORY_REGRESSIONS" : "NO_NEW_REPOSITORY_REGRESSIONS",
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const headLogPath = arg("--head-log");
  const baseLogPath = arg("--base-log");
  if (!headLogPath || !baseLogPath) throw new Error(`${CONTRACT}_LOG_PATHS_REQUIRED`);
  const headExit = exitCode("--head-exit");
  const baseExit = exitCode("--base-exit");
  const [headLog, baseLog] = await Promise.all([
    readFile(headLogPath, "utf8"),
    readFile(baseLogPath, "utf8"),
  ]);
  const result = compareRepositoryRegressionDelta({ headLog, baseLog, headExit, baseExit });
  console.log(JSON.stringify({
    success: result.success,
    contract: result.contract,
    head_exit: result.head_exit,
    base_exit: result.base_exit,
    head_failure_count: result.head_failures.length,
    base_failure_count: result.base_failures.length,
    new_failure_count: result.new_failures.length,
    new_failures: result.new_failures.slice(0, 50),
    reason: result.reason,
  }, null, 2));
  console.log(`${CONTRACT}=${result.success ? "PASS" : "FAIL"}`);
  if (!result.success) process.exitCode = 1;
}
