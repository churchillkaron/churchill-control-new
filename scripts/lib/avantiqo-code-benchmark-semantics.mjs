import { createContext, Script } from "node:vm";

const GENERATED_CODE_TIMEOUT_MS = 500;
const FORBIDDEN_GENERATED_CODE_PATTERNS = [
  /\bprocess\b/,
  /\brequire\s*\(/,
  /\bimport\s*(?:\(|["'{*])/,
  /\bfetch\s*\(/,
  /\bglobalThis\b/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\.constructor\b/,
  /\bWebAssembly\b/,
  /\bsetTimeout\s*\(/,
  /\bsetInterval\s*\(/,
  /\bchild_process\b/,
  /\bnode:fs\b/,
  /\bnode:http\b/,
  /\bnode:https\b/,
  /\bnode:net\b/,
];

function text(value) {
  return String(value ?? "").trim();
}

export function normalizeGeneratedCode(value) {
  return text(value)
    .replace(/^```(?:javascript|js)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function sourceSafety(source) {
  const matched = FORBIDDEN_GENERATED_CODE_PATTERNS
    .filter((pattern) => pattern.test(source))
    .map((pattern) => pattern.source);
  return {
    passed: matched.length === 0,
    forbidden_patterns: matched,
  };
}

function finiteSumBehavior(source) {
  const safety = sourceSafety(source);
  const checks = {
    source_safety_pass: safety.passed,
    function_name_present: /\bfunction\s+sumInvoiceLines\s*\(|\b(?:const|let|var)\s+sumInvoiceLines\s*=/.test(source),
    number_is_finite_present: /\bNumber\.isFinite\s*\(/.test(source),
    non_array_returns_zero: false,
    numeric_strings_convert: false,
    invalid_totals_ignored: false,
    infinity_and_nan_ignored: false,
    zero_and_negative_values_preserved: false,
    empty_array_returns_zero: false,
  };

  if (!safety.passed || !checks.function_name_present || !checks.number_is_finite_present) {
    return {
      passed: false,
      checks,
      source_safety: safety,
      error: null,
    };
  }

  try {
    const context = createContext(Object.create(null), {
      name: "avantiqo-code-benchmark-generated-function",
      codeGeneration: {
        strings: false,
        wasm: false,
      },
    });
    new Script(
      `"use strict";\n${source}\n;globalThis.__candidate = sumInvoiceLines;`,
      { filename: "avantiqo-code-benchmark-generated.js" },
    ).runInContext(context, { timeout: GENERATED_CODE_TIMEOUT_MS });

    new Script(`
      "use strict";
      const fn = globalThis.__candidate;
      if (typeof fn !== "function") throw new Error("SUM_INVOICE_LINES_FUNCTION_REQUIRED");
      globalThis.__checks = {
        non_array_returns_zero:
          Object.is(fn(null), 0) &&
          Object.is(fn(undefined), 0) &&
          Object.is(fn({ total: 5 }), 0),
        numeric_strings_convert:
          Object.is(fn([{ total: "1.5" }, { total: 2 }, { total: "3" }]), 6.5),
        invalid_totals_ignored:
          Object.is(fn([{ total: "bad" }, { total: undefined }, { total: null }, { total: 4 }]), 4),
        infinity_and_nan_ignored:
          Object.is(fn([{ total: Infinity }, { total: -Infinity }, { total: NaN }, { total: 7 }]), 7),
        zero_and_negative_values_preserved:
          Object.is(fn([{ total: 0 }, { total: "0" }, { total: -2.5 }, { total: "1.5" }]), -1),
        empty_array_returns_zero:
          Object.is(fn([]), 0),
      };
    `, { filename: "avantiqo-code-benchmark-behavior.js" })
      .runInContext(context, { timeout: GENERATED_CODE_TIMEOUT_MS });

    Object.assign(checks, context.__checks || {});
    return {
      passed: Object.values(checks).every(Boolean),
      checks,
      source_safety: safety,
      error: null,
    };
  } catch (error) {
    return {
      passed: false,
      checks,
      source_safety: safety,
      error: text(error?.message || error).slice(0, 500),
    };
  }
}

export function validateCodeBenchmarkSemantic(caseId, result, sample = {}) {
  const source = normalizeGeneratedCode(result);
  if (caseId === "generate_finite_sum") {
    const behavioral = finiteSumBehavior(source);
    return {
      passed: behavioral.passed,
      mode: "isolated_behavioral_execution",
      ...behavioral,
    };
  }

  if (sample.plannerProtocol) {
    return {
      passed: null,
      mode: "planner_protocol_external_validator",
      checks: {},
      error: null,
    };
  }

  const lower = source.toLowerCase();
  const requiredAll = Array.isArray(sample.requiredAll) ? sample.requiredAll : [];
  const requiredAny = Array.isArray(sample.requiredAny) ? sample.requiredAny : [];
  const allPass = requiredAll.every((value) => lower.includes(String(value).toLowerCase()));
  const anyPass = !requiredAny.length || requiredAny.some((value) => lower.includes(String(value).toLowerCase()));
  return {
    passed: allPass && anyPass,
    mode: "bounded_source_contract",
    checks: {
      required_all_pass: allPass,
      required_any_pass: anyPass,
    },
    error: null,
  };
}
