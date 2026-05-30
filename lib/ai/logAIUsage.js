import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function logAIUsage({

  tenantId = null,

  organizationId = null,

  userId = null,

  userEmail = null,

  module = "GENERAL",

  operation = "UNKNOWN",

  provider = "openai",

  model,

  promptTokens = 0,

  completionTokens = 0,

  requestId = null,

}) {

  try {

    const { data: pricing } =
      await supabaseAdmin
        .from("ai_model_pricing")
        .select("*")
        .eq("provider", provider)
        .eq("model", model)
        .eq("active", true)
        .maybeSingle();

    const totalTokens =
      Number(promptTokens || 0) +
      Number(completionTokens || 0);

    let rawCost = 0;
    let billedCost = 0;

    if (pricing) {

      rawCost =
        (
          (
            Number(promptTokens || 0) *
            Number(pricing.input_cost_per_1m)
          ) / 1000000
        ) +
        (
          (
            Number(completionTokens || 0) *
            Number(pricing.output_cost_per_1m)
          ) / 1000000
        );

      billedCost =
        rawCost *
        (
          1 +
          (
            Number(
              pricing.markup_percent || 0
            ) / 100
          )
        );

    }

    const { error } =
      await supabaseAdmin
        .from("ai_usage_logs")
        .insert({

          tenant_id:
            tenantId,

          organization_id:
            organizationId,

          user_id:
            userId,

          user_email:
            userEmail,

          module,

          operation,

          provider,

          model,

          prompt_tokens:
            promptTokens,

          completion_tokens:
            completionTokens,

          total_tokens:
            totalTokens,

          raw_cost:
            rawCost,

          billed_cost:
            billedCost,

          estimated_cost:
            billedCost,

          request_id:
            requestId,

        });

    if (error) {

      console.error(
        "AI_USAGE_LOG_ERROR_FULL",
        JSON.stringify(
          error,
          null,
          2
        )
      );

    }

  } catch (error) {

    console.error(
      "AI_USAGE_LOG_FATAL",
      error
    );

  }

}
