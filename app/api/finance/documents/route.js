export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import {
  listFinanceDocuments,
} from "@/lib/finance/documents";

export async function GET() {
  return NextResponse.json({
    success: true,
    documents: listFinanceDocuments(),
  });
}
