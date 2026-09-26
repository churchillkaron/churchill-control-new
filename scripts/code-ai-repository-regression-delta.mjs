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

function nearbyTestPath(lines, index) {
  for (let offset = 1; offset <= 3 && index - offset >= 0; offset += 1) {
    const candidate = String(lines[index - offset] || "").trim();
    const match = candidate.match(/^test at (?:file:\/\/)?(?:.*\/)?(tests\/[^:]+):\d+:\d+$/i);
    if (match) return match[1];
    if (candidate && !candidate.startsWith("#")) break;
  }
  return null;
}

export function extractRepositoryTestFailures(log) {
  const failures = new Set();
  const lines = String(log || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = String(lines[index] || "").trim();
    let match = line.match(/^✖\s+(.+)$/u);
    if (match) {
      const signature = normalizeFailure(match[1]);
      if (signature) {
        failures.add(signature);
        const testPath = nearbyTestPath(lines, index);
        if (testPath) failures.add(`${signature} @ ${testPath}`);
      }
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


export function extractRepositoryTestSummary(log) {
  const lines = String(log || "").split(/\r?\n/).map((line) => line.trim());
  const fields = ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo", "duration_ms"];
  const blocks = [];
  for (let index = 0; index <= lines.length - fields.length; index += 1) {
    const values = {};
    let matched = true;
    for (let offset = 0; offset < fields.length; offset += 1) {
      const field = fields[offset];
      const numeric = field === "duration_ms" ? "([0-9]+(?:\\.[0-9]+)?)" : "(\\d+)";
      const match = lines[index + offset].match(new RegExp(`^(?:ℹ|#)\\s+${field}\\s+${numeric}$`, "i"));
      if (!match) { matched = false; break; }
      values[field] = Number(match[1]);
    }
    if (matched) blocks.push({ start_line: index + 1, ...values });
  }

  const block = blocks.at(-1) || null;
  if (!block) {
    return {
      tests: null, suites: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null, duration_ms: null,
      complete: false, consistent: false, canonical_block_count: 0, canonical_start_line: null, accounted: null, executed: null,
    };
  }
  const accounted = block.pass + block.fail + block.cancelled + block.skipped + block.todo;
  return {
    ...block,
    complete: true,
    consistent: accounted === block.tests,
    canonical_block_count: blocks.length,
    canonical_start_line: block.start_line,
    accounted,
    executed: block.pass + block.fail,
  };
}

export function compareRepositoryRegressionDelta({ headLog, baseLog, headExit, baseExit }) {
  const headSummary = extractRepositoryTestSummary(headLog);
  const baseSummary = extractRepositoryTestSummary(baseLog);
  if (!headSummary.complete || !baseSummary.complete) {
    return {
      success: false, contract: CONTRACT, head_exit: headExit, base_exit: baseExit,
      head_summary: headSummary, base_summary: baseSummary,
      head_failures: extractRepositoryTestFailures(headLog),
      base_failures: extractRepositoryTestFailures(baseLog),
      new_failures: [], reason: "TEST_INVENTORY_UNPARSEABLE",
    };
  }
  if (!headSummary.consistent || !baseSummary.consistent) {
    return {
      success: false, contract: CONTRACT, head_exit: headExit, base_exit: baseExit,
      head_summary: headSummary, base_summary: baseSummary,
      head_failures: extractRepositoryTestFailures(headLog),
      base_failures: extractRepositoryTestFailures(baseLog),
      new_failures: [], reason: "TEST_INVENTORY_INCONSISTENT",
    };
  }
  if (headSummary.tests < baseSummary.tests || headSummary.executed < baseSummary.executed) {
    return {
      success: false, contract: CONTRACT, head_exit: headExit, base_exit: baseExit,
      head_summary: headSummary, base_summary: baseSummary,
      head_failures: extractRepositoryTestFailures(headLog),
      base_failures: extractRepositoryTestFailures(baseLog),
      new_failures: [], reason: "TEST_INVENTORY_SHRANK",
    };
  }
  if (
    headSummary.cancelled > baseSummary.cancelled ||
    headSummary.skipped > baseSummary.skipped ||
    headSummary.todo > baseSummary.todo
  ) {
    return {
      success: false, contract: CONTRACT, head_exit: headExit, base_exit: baseExit,
      head_summary: headSummary, base_summary: baseSummary,
      head_failures: extractRepositoryTestFailures(headLog),
      base_failures: extractRepositoryTestFailures(baseLog),
      new_failures: [], reason: "TEST_NONEXECUTED_COVERAGE_INCREASED",
    };
  }
  if (headExit === 0) {
    return {
      success: true,
      contract: CONTRACT,
      head_exit: headExit,
      base_exit: baseExit,
      head_summary: headSummary,
      base_summary: baseSummary,
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
      head_summary: headSummary,
      base_summary: baseSummary,
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
      head_summary: headSummary,
      base_summary: baseSummary,
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
    head_summary: headSummary,
    base_summary: baseSummary,
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
    head_test_count: result.head_summary?.tests ?? null,
    base_test_count: result.base_summary?.tests ?? null,
    head_executed_count: result.head_summary?.executed ?? null,
    base_executed_count: result.base_summary?.executed ?? null,
    head_failure_count: result.head_failures.length,
    base_failure_count: result.base_failures.length,
    new_failure_count: result.new_failures.length,
    new_failures: result.new_failures.slice(0, 50),
    reason: result.reason,
  }, null, 2));
  console.log(`${CONTRACT}=${result.success ? "PASS" : "FAIL"}`);
  if (!result.success) process.exitCode = 1;
}
