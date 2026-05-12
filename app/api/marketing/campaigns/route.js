import { supabase }
from "@/lib/shared/supabase/client";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

import { requireFields }
from "@/lib/shared/validation/required";

export const POST = withApiHandler(
  "marketing-campaigns",

  async (request) => {

    const body =
      await request.json();

    requireFields(body, [
      "pageId",
    ]);

    const tenantId =
      getTenantId(request);

    const {

      pageId,

    } = body;

    const {
      data,
      error,
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

    if (error) {
      throw error;
    }

    return {
      campaigns:
        data || [],
    };

  }
);