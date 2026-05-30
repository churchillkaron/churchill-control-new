import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function checkDeploymentApproval({
  commit_sha,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("approval_requests")
    .select("*")
    .eq(
      "type",
      "deployment"
    )
    .eq(
      "entity_id",
      commit_sha
    )
    .eq(
      "status",
      "approved"
    )
    .limit(1);

  if (error) {
    throw error;
  }

  return {
    approved:
      data?.length > 0,
  };
}
