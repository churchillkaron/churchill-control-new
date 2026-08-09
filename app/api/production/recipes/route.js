import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {
  try {
    const body =
      await req.json();

    const organizationId =
      body.organizationId ||
      body.organization_id;

    const access =
      await requireOrganizationAccess({
        organizationId,
        request: req,
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

    const { data, error } = await supabaseAdmin
      .from("recipes")
      .select(`
        *,
        recipe_components (*)
      `)
      .eq(
        "organization_id",
        access.organizationId
      );

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
}
