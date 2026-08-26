import { readFile, writeFile } from "node:fs/promises";

const CODE_CERT_LEASE_TTL_MS = 3_600_000;

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  return source.replace(before, after);
}

const safeLeasePath = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
let safeLease = await readFile(safeLeasePath, "utf8");
safeLease = replaceRequired(
  safeLease,
  `const ttlMs = args.ttlMs ?? finite(policy.default_lease_ttl_ms, 900_000);\nif (ttlMs < 60_000 || ttlMs > finite(policy.max_lease_ttl_ms, 1_800_000)) throw new Error(\`${"${CONTRACT}"}_TTL_INVALID:${"${ttlMs}"}\`);`,
  `const ttlMs = args.ttlMs ?? finite(policy.default_lease_ttl_ms, 900_000);\nconst maxLeaseTtlMs = finite(\n  policy?.lane_max_lease_ttl_ms?.[args.lane],\n  finite(policy.max_lease_ttl_ms, 1_800_000),\n);\nif (ttlMs < 60_000 || ttlMs > maxLeaseTtlMs) throw new Error(\`${"${CONTRACT}"}_TTL_INVALID:${"${ttlMs}"}:max=${"${maxLeaseTtlMs}"}\`);`,
  "safe-lease-lane-ttl",
);
await writeFile(safeLeasePath, safeLease, "utf8");

const distributedPath = "scripts/avantiqo-code-runpod-distributed-lease.mjs";
let distributed = await readFile(distributedPath, "utf8");
distributed = replaceRequired(
  distributed,
  `const MAX_CAS_ATTEMPTS = 4;`,
  `const MAX_CAS_ATTEMPTS = 4;\nconst MAX_CODE_DISTRIBUTED_LEASE_TTL_MS = ${CODE_CERT_LEASE_TTL_MS.toLocaleString("en-US").replace(/,/g, "_")};`,
  "distributed-max-ttl-constant",
);
distributed = replaceRequired(
  distributed,
  `const ttl = Math.max(60_000, Math.min(Number(ttlMs || 900_000), 1_800_000));`,
  `const ttl = Math.max(60_000, Math.min(Number(ttlMs || 900_000), MAX_CODE_DISTRIBUTED_LEASE_TTL_MS));`,
  "distributed-max-ttl-clamp",
);
await writeFile(distributedPath, distributed, "utf8");

const policyPath = "config/avantiqo-runpod-safe-lease-policy.json";
const policy = JSON.parse(await readFile(policyPath, "utf8"));
policy.max_lease_ttl_ms = 1_800_000;
policy.lane_max_lease_ttl_ms = {
  ...(policy.lane_max_lease_ttl_ms || {}),
  code: CODE_CERT_LEASE_TTL_MS,
};
await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

const packagePath = "package.json";
let packageJson = await readFile(packagePath, "utf8");npackageJson = replaceRequired(
  packageJson,
  `--lane=code --ttl-ms=1800000 -- node scripts/certify-code-ai-autonomous-planner-service-runtime-live.mjs`,
  `--lane=code --ttl-ms=${CODE_CERT_LEASE_TTL_MS} -- node scripts/certify-code-ai-autonomous-planner-service-runtime-live.mjs`,
  "package-code-cert-ttl",
);
await writeFile(packagePath, packageJson, "utf8");

const selftestPath = "scripts/code-ai-certification-resilience-selftest.mjs";
let selftest = await readFile(selftestPath, "utf8");
if (!selftest.includes("code_certification_lease_budget_exceeds_observed_30_minute_cutoff")) {
  selftest = replaceRequired(
    selftest,
    `assert.match(packageJson, /code-ai-certification-resilience-selftest\\.mjs/);`,
    `assert.match(packageJson, /code-ai-certification-resilience-selftest\\.mjs/);\nassert.match(packageJson, /--lane=code --ttl-ms=3600000 --/);\nconst safeLeasePolicy = JSON.parse(await readFile("config/avantiqo-runpod-safe-lease-policy.json", "utf8"));\nassert.equal(safeLeasePolicy.max_lease_ttl_ms, 1_800_000);\nassert.equal(safeLeasePolicy.lane_max_lease_ttl_ms?.code, 3_600_000);\nassert.match(sharedLease, /lane_max_lease_ttl_ms/);\nassert.match(sharedLease, /maxLeaseTtlMs/);\nassert.match(codeDistributedLease, /MAX_CODE_DISTRIBUTED_LEASE_TTL_MS = 3_600_000/);`,
    "selftest-code-ttl-assertions",
  );
  selftest = replaceRequired(
    selftest,
    `    code_distributed_lease_does_not_mutate_endpoint_directly: true,`,
    `    code_distributed_lease_does_not_mutate_endpoint_directly: true,\n    code_certification_lease_budget_exceeds_observed_30_minute_cutoff: true,\n    non_code_default_max_lease_ttl_remains_30_minutes: true,\n    code_distributed_lease_matches_code_safe_lease_budget: true,`,
    "selftest-code-ttl-evidence",
  );
}
await writeFile(selftestPath, selftest, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_CERTIFICATION_LEASE_BUDGET_CONVERGENCE_V1",
  code_certification_lease_ttl_ms: CODE_CERT_LEASE_TTL_MS,
  non_code_default_max_lease_ttl_ms: 1_800_000,
  workers_min_one_allowed: false,
  provider_execution_submitted: false,
  runpod_lease_opened: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
