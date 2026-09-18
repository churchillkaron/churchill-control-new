export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getPublicFinanceAuditorPackageDownload } from "@/lib/finance/auditor/FinanceAuditorPackageRuntime";

export async function GET(_request, { params }) {
  const resolvedParams = await params;
  const resolved = await getPublicFinanceAuditorPackageDownload(resolvedParams?.token);
  if (!resolved?.signed_url) return NextResponse.json({ success: false, error: "Auditor package link is invalid or expired" }, { status: 404 });
  return NextResponse.redirect(resolved.signed_url, 307);
}
