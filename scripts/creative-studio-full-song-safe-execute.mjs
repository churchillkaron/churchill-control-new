#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

const minimumInputTokens = positive(
  process.env.CREATIVE_DIRECTION_RESERVATION_INPUT_TOKENS,
  96000,
);
const minimumOutputTokens = positive(
  process.env.CREATIVE_DIRECTION_RESERVATION_OUTPUT_TOKENS,
  48000,
);

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

const { data: rows, error } = await supabaseAdmin
  .from("provider_pricing")
  .select("*")
  .eq("capability", "ai.reasoning.execute")
  .eq("active", true);

if (error) throw error;
if (!rows?.length) {
  throw new Error("ACTIVE_REASONING_PROVIDER_PRICING_REQUIRED");
}

let tokenPricedCount = 0;
let repairedCount = 0;

for (const row of rows) {
  const inputCost = Number(row.input_cost_per_1m || 0);
  const outputCost = Number(row.output_cost_per_1m || 0);
  if (inputCost <= 0 && outputCost <= 0) continue;

  tokenPricedCount += 1;

  const metadata = object(row.metadata);
  const currentInput = Number(
    metadata.estimated_input_tokens_per_request || 0,
  );
  const currentOutput = Number(
    metadata.estimated_output_tokens_per_request || 0,
  );
  const estimatedInput = Math.max(currentInput, minimumInputTokens);
  const estimatedOutput = Math.max(currentOutput, minimumOutputTokens);

  if (
    currentInput >= minimumInputTokens &&
    currentOutput >= minimumOutputTokens
  ) {
    console.log(
      [
        "RESERVATION_READY",
        row.id,
        row.provider || "",
        row.model || "",
        currentInput,
        currentOutput,
      ].join("|"),
    );
    continue;
  }

  const { error: updateError } = await supabaseAdmin
    .from("provider_pricing")
    .update({
      metadata: {
        ...metadata,
        estimated_input_tokens_per_request: estimatedInput,
        estimated_output_tokens_per_request: estimatedOutput,
        reservation_policy: "CONFIGURED_TOKEN_CEILING_ACTUAL_SETTLEMENT",
        reservation_policy_version: "creative-direction-full-song-v1",
        reservation_configuration_source: "provider_pricing",
        reservation_reason: "FULL_SONG_MASTER_PLAN_CONSERVATIVE_ENVELOPE",
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (updateError) throw updateError;

  repairedCount += 1;
  console.log(
    [
      "RESERVATION_REPAIRED",
      row.id,
      row.provider || "",
      row.model || "",
      estimatedInput,
      estimatedOutput,
    ].join("|"),
  );
}

if (!tokenPricedCount) {
  throw new Error("TOKEN_PRICED_REASONING_PROVIDER_REQUIRED");
}

console.log(`REASONING_TOKEN_PRICING_COUNT=${tokenPricedCount}`);
console.log(`REASONING_RESERVATION_REPAIRED_COUNT=${repairedCount}`);
console.log(`DIRECTION_RESERVATION_INPUT_TOKENS=${minimumInputTokens}`);
console.log(`DIRECTION_RESERVATION_OUTPUT_TOKENS=${minimumOutputTokens}`);
console.log("DIRECTION_RESERVATION_PREFLIGHT=PASS");

await import("./creative-studio-full-song-execute.mjs");
