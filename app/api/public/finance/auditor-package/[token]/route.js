export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { resolvePublicFinanceAuditorPackageGrant } from "@/lib/finance/auditor/FinanceAuditorPackageRuntime";

export async function GET(_request, { params }) {
  const resolvedParams = await params;
  const resolved = await resolvePublicFinanceAuditorPackageGrant(resolvedParams?.token, { markViewed: true });
  if (!resolved) return NextResponse.json({ success: false, error: "Auditor package link is invalid or expired" }, { status: 404 });
  const manifest = resolved.package.manifest || {};
  return NextResponse.json({ success: true, auditor: { name: resolved.grant.auditor_name || null, email: resolved.grant.auditor_email, expires_at: resolved.grant.expires_at, last_downloaded_at: resolved.grant.last_downloaded_at, download_count: resolved.grant.download_count || 0 }, package: { id: resolved.package.id, version: resolved.package.package_version, generated_at: resolved.package.generated_at, package_digest: resolved.package.package_digest, close_fingerprint_digest: resolved.package.close_fingerprint_digest, manifest }, read_only: true, mutation_authority: false }, { headers: { "Cache-Control": "no-store" } });
}
