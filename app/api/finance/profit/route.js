export const dynamic =
  "force-dynamic";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export const GET = withApiHandler(
  "finance-profit",

  async (request) => {

    const tenantId =
      getTenantId(request);

    const {
      data,
      error,
    } = await supabaseAdmin

      .from(
        "order_profit_view"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
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
      data:
        data || [],
    };

  }
);