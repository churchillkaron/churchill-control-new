import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runFraudDetection({
  organizationId,
}) {
  const logs = [
    {
      organization_id: organizationId,
      transaction_reference: "TX-001",
      fraud_score: 12.5,
      status: "safe",
      notes: "No unusual transaction patterns",
    },
    {
      organization_id: organizationId,
      transaction_reference: "TX-002",
      fraud_score: 82.7,
      status: "review",
      notes: "High-value unusual payment detected",
    },
  ];

  const { data, error } = await supabase
    .from("fraud_detection_logs")
    .insert(logs)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
