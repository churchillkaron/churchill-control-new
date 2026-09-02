export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  createSignatureRequest,
  updateSignatureRequest,
} from "@/lib/documents/runtime/DocumentControlRuntime";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

function clean(value) {
  return String(value ?? "").trim();
}

export async function POST(request, { params }) {
  try {
    const resolvedParams = await params;
    const documentId = clean(resolvedParams?.documentId);
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const context = await resolveAuthenticatedStaffContext({ request, organizationId });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    }

    const signature = await createSignatureRequest({
      organizationId: context.organizationId,
      documentId,
      entityId: clean(body.entityId || body.entity_id) || null,
      actor: context,
      signerPartyId: clean(body.signerPartyId || body.signer_party_id) || null,
      signerName: clean(body.signerName || body.signer_name) || null,
      signerEmail: clean(body.signerEmail || body.signer_email) || null,
      signingOrder: body.signingOrder || body.signing_order || 1,
      expiresAt: body.expiresAt || body.expires_at || null,
      provider: body.provider || null,
    });

    return NextResponse.json({ success: true, signature }, { status: 201 });
  } catch (error) {
    console.error("DOCUMENT_SIGNATURE_CREATE_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to create signature request", code: error?.code || null }, { status: error?.status || 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    await params;
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const context = await resolveAuthenticatedStaffContext({ request, organizationId });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    }

    const signature = await updateSignatureRequest({
      organizationId: context.organizationId,
      signatureRequestId: clean(body.signatureRequestId || body.signature_request_id),
      actor: context,
      status: body.status,
      providerReference: body.providerReference || body.provider_reference || null,
      evidence: body.evidence || {},
    });

    return NextResponse.json({ success: true, signature });
  } catch (error) {
    console.error("DOCUMENT_SIGNATURE_UPDATE_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to update signature request", code: error?.code || null }, { status: error?.status || 500 });
  }
}
