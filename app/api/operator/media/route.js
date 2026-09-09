import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value) {
  return String(value ?? "").trim();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
    );
    const reference = text(url.searchParams.get("reference"));

    if (!organizationId || !reference) {
      return Response.json(
        { success: false, error: "organizationId and reference required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });
    if (!access.success) {
      return Response.json(access, { status: access.status || 403 });
    }

    if (!reference.startsWith("storage://")) {
      return Response.json(
        { success: false, error: "Unsupported media reference" },
        { status: 400 },
      );
    }

    const signedUrl = await signCreativeStorageReference({
      organization_id: access.organizationId || organizationId,
      reference,
      expires_in: 15 * 60,
    });

    return Response.redirect(signedUrl, 307);
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: text(error?.message || error) || "Media could not be opened",
      },
      { status: 500 },
    );
  }
}
