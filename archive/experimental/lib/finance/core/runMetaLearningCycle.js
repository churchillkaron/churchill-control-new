import { supabase } from "@/lib/supabase";

export async function runMetaLearningCycle({
  tenantId,
}) {
  const { data: forecasts } =
    await supabase
      .from("financial_forecasts")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: true,
      });

  if (
    !forecasts ||
    forecasts.length < 2
  ) {
    return null;
  }

  const first =
    forecasts[0];

  const latest =
    forecasts[
      forecasts.length - 1
    ];

  const previous =
    Number(
      first.confidence_score ||
        0
    );

  const current =
    Number(
      latest.confidence_score ||
        0
    );

  const improvement =
    current - previous;

  const { data, error } =
    await supabase
      .from(
        "meta_learning_cycles"
      )
      .insert({
        tenant_id: tenantId,
        learning_type:
          "FORECASTING_EVOLUTION",
        previous_accuracy:
          previous,
        current_accuracy:
          current,
        learning_improvement:
          improvement,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
