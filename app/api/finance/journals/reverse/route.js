export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import createJournalReversal from "@/lib/finance/general-ledger/capabilities/createJournalReversal";

export async function POST(request) {
  try {
    const body = await request.json();

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

    const result =
      await createJournalReversal({
        organizationId: access.organizationId,
        journalEntryId: body.journalId,
        reversalReason: body.reason || "Manual reversal",
        reversedBy: body.reversedBy || body.requestedBy || "system",
      });

    return NextResponse.json(result);
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
