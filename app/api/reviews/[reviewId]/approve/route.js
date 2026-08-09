export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { publishApprovedReview } from "@/lib/commercial/reputation/ReputationAutomationRuntime";
import { canApproveReviewResponses } from "@/lib/commercial/reputation/reviewAuthorization";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

export async function POST(request, { params }) {
  try {
    const body = await request.json().catch(() => ({}));
    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId:
        body?.organizationId || body?.organization_id || null,
    });

    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 }
      );
    }
    if (!canApproveReviewResponses(context)) {
      return NextResponse.json(
        {
          success: false,
          error: "Manager or owner approval is required",
          code: "REVIEW_APPROVAL_REQUIRED",
        },
        { status: 403 }
      );
    }

    const review = await publishApprovedReview({
      organizationId: context.organizationId,
      reviewId: params.reviewId,
      responseText: body?.responseText || body?.response_text || null,
    });

    return NextResponse.json({ success: true, review });
  } catch (error) {
    const message = error?.message || "Unable to publish review response";
    const notFound = message === "Review not found";
    const conflict = message === "Review is not awaiting approval";
    const invalid =
      message === "A response is required" ||
      message.startsWith("Response cannot exceed");
    return NextResponse.json(
      { success: false, error: message },
      { status: notFound ? 404 : conflict ? 409 : invalid ? 400 : 500 }
    );
  }
}
