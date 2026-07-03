export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { createCogsEntry } from "@/lib/finance/createCogsEntry";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const body = await req.json();

    const access =
      await requireOrganizationAccess({
        organizationId: body.organizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const organizationId = access.organizationId;

    const { data: batch, error: batchError } =
      await supabaseAdmin
        .from("production_batches")
        .select("*")
        .eq("id", body.batchId)
        .single();

    if (batchError) {
      throw batchError;
    }

    const { data: usage, error: usageError } =
      await supabaseAdmin
        .from("inventory_movements")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("reference_id", body.batchId)
        .eq("type", "CONSUMPTION");

    if (usageError) {
      throw usageError;
    }

    const totalCost =
      (usage || []).reduce(
        (sum, item) =>
          sum + Math.abs(Number(item.cost || 0)),
        0
      );

    const event =
      await createCogsEntry({
        organization_id: organizationId,
        entity_id: body.entityId,
        batch_id: body.batchId,
        production_id: batch.production_id,
        amount: totalCost,
        revenue: batch.revenue || 0,
        sourceModule: "production",
        sourceId: body.batchId,
      });

    return NextResponse.json({
      success: true,
      accountingEvent: event,
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }
}
