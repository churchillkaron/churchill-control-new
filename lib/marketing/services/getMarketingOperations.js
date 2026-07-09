import { getServiceSupabase }
from "@/lib/shared/supabase/service";

const supabase =
  getServiceSupabase();

export async function getMarketingOperations({
  organizationId,
  pageId,
}) {

  // GENERATION JOBS

  const {
    data: jobs,
    error: jobsError,
  } = await supabase

    .from(
      "generation_jobs"
    )

    .select("*")

    .eq(
      "organization_id",
      organizationId
    )

    .eq(
      "page_id",
      pageId
    )

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(100);

  if (jobsError) {
    throw jobsError;
  }

  // PUBLISH QUEUE

  const {
    data: queue,
    error: queueError,
  } = await supabase

    .from(
      "campaign_publish_queue"
    )

    .select("*")

    .eq(
      "organization_id",
      organizationId
    )

    .eq(
      "page_id",
      pageId
    )

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(100);

  if (queueError) {
    throw queueError;
  }

  // CAMPAIGNS

  const {
    data: campaigns,
    error: campaignsError,
  } = await supabase

    .from(
      "marketing_campaigns"
    )

    .select("*")

    .eq(
      "organization_id",
      organizationId
    )

    .eq(
      "page_id",
      pageId
    )

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(50);

  if (campaignsError) {
    throw campaignsError;
  }

  // ASSETS

  const {
    data: assets,
    error: assetsError,
  } = await supabase

    .from(
      "creative_assets"
    )

    .select("*")

    .eq(
      "organization_id",
      organizationId
    )

    .eq(
      "page_id",
      pageId
    )

    .order(
      "score",
      {
        ascending: false,
      }
    )

    .limit(20);

  if (assetsError) {
    throw assetsError;
  }

  return {

    jobs:
      jobs || [],

    queue:
      queue || [],

    campaigns:
      campaigns || [],

    assets:
      assets || [],

  };

}