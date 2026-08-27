import assert from "node:assert/strict";
import {
  CODE_AI_CERTIFICATION_SUPABASE_SAFE_READ_CONTRACT,
  createCodeCertificationSupabaseSafeReadFetch,
} from "../lib/code/runtime/CodeAICertificationSupabaseReadResilience.js";

const SUPABASE_URL = "https://example.supabase.co";

let getAttempts = 0;
const getRetries = [];
const flakyGet = createCodeCertificationSupabaseSafeReadFetch({
  supabase_url: SUPABASE_URL,
  on_retry: (entry) => getRetries.push(entry),
  base_fetch: async () => {
    getAttempts += 1;
    if (getAttempts === 1) throw new TypeError("fetch failed");
    if (getAttempts === 2) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  },
});
const getResponse = await flakyGet(`${SUPABASE_URL}/rest/v1/organization_services?select=*`, { method: "GET" });
assert.equal(getResponse.status, 200);
assert.equal(getAttempts, 3);
assert.equal(getRetries.length, 2);
assert.ok(getRetries.every((entry) => entry.provider_execution_submitted === false));
assert.ok(getRetries.every((entry) => entry.wallet_mutation_performed === false));
assert.ok(getRetries.every((entry) => entry.usage_write_performed === false));

let postAttempts = 0;
const noPostRetry = createCodeCertificationSupabaseSafeReadFetch({
  supabase_url: SUPABASE_URL,
  base_fetch: async () => {
    postAttempts += 1;
    throw new TypeError("fetch failed");
  },
});
await assert.rejects(
  () => noPostRetry(`${SUPABASE_URL}/rest/v1/platform_service_usage`, { method: "POST" }),
  /fetch failed/,
);
assert.equal(postAttempts, 1);

let patchAttempts = 0;
const noPatchRetry = createCodeCertificationSupabaseSafeReadFetch({
  supabase_url: SUPABASE_URL,
  base_fetch: async () => {
    patchAttempts += 1;
    throw new TypeError("fetch failed");
  },
});
await assert.rejects(
  () => noPatchRetry(`${SUPABASE_URL}/rest/v1/organization_wallets?id=eq.1`, { method: "PATCH" }),
  /fetch failed/,
);
assert.equal(patchAttempts, 1);

let otherOriginAttempts = 0;
const otherOrigin = createCodeCertificationSupabaseSafeReadFetch({
  supabase_url: SUPABASE_URL,
  base_fetch: async () => {
    otherOriginAttempts += 1;
    throw new TypeError("fetch failed");
  },
});
await assert.rejects(
  () => otherOrigin("https://other.example/rest/v1/x", { method: "GET" }),
  /fetch failed/,
);
assert.equal(otherOriginAttempts, 1);

console.log(JSON.stringify({
  success: true,
  contract: CODE_AI_CERTIFICATION_SUPABASE_SAFE_READ_CONTRACT,
  verified: {
    transient_supabase_get_retried: true,
    retryable_supabase_get_http_retried: true,
    supabase_post_not_retried: true,
    supabase_patch_not_retried: true,
    non_supabase_origin_not_retried: true,
    provider_submission_retry_forbidden: true,
    wallet_write_retry_forbidden: true,
    usage_write_retry_forbidden: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CODE_AI_CERTIFICATION_SUPABASE_SAFE_READ_CONTRACT}=PASS`);
