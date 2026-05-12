import { supabase }
from "@/lib/shared/supabase/client";

export async function getMarketingOperations({
  tenantId,
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
      "tenant_id",
      tenantId
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
      "tenant_id",
      tenantId
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
      "tenant_id",
      tenantId
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
      "marketing_assets"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
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