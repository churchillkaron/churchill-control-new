export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  executeFinancePortalSignature,
  getFinancePortalSignature,
} from "@/lib/finance/practice/FinancePortalSignatureRuntime";

const clean = (value) => String(value ?? "").trim();
function jsonError(error, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request, { params }) {
  try {
    const resolved = await params;
    const portalToken = clean(resolved?.token);
    const signatureRequestId = clean(resolved?.signatureRequestId);
    if (!portalToken || !signatureRequestId) return jsonError("Signature request is required", 400);
    const result = await getFinancePortalSignature({ portalToken, signatureRequestId, headers: request.headers });
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error?.message || "Unable to load signature request", error?.status || 500);
  }
}

export async function POST(request, { params }) {
  try {
    const resolved = await params;
    const portalToken = clean(resolved?.token);
    const signatureRequestId = clean(resolved?.signatureRequestId);
    if (!portalToken || !signatureRequestId) return jsonError("Signature request is required", 400);
    const body = await request.json().catch(() => ({}));
    const result = await executeFinancePortalSignature({
      portalToken,
      signatureRequestId,
      action: body.action,
      signerName: body.signerName || body.signer_name || null,
      consent: body.consent === true,
      headers: request.headers,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error?.message || "Unable to complete signature action", error?.status || 500);
  }
}
