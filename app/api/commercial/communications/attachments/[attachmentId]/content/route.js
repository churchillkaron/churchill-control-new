export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rows(value) {
  return Array.isArray(value?.data) ? value.data : Array.isArray(value) ? value : [];
}

function metaAttachmentUrl(payload, wantedType) {
  const attachments = rows(payload?.attachments);
  const wanted = text(wantedType).toLowerCase();
  const matching = attachments.find((entry) => {
    const image = object(entry?.image_data);
    const video = object(entry?.video_data);
    const type = text(entry?.type || (image.url ? "image" : video.url ? "video" : "file")).toLowerCase();
    return !wanted || type === wanted || (wanted === "sticker" && image.render_as_sticker === true);
  }) || attachments[0];
  if (matching) {
    const image = object(matching.image_data);
    const video = object(matching.video_data);
    const url = text(matching.file_url || matching.image_url || matching.video_url || image.url || video.url || matching.url);
    if (url) return { url, mimeType: text(matching.mime_type) || null };
  }
  const sticker = text(payload?.sticker);
  return sticker ? { url: sticker, mimeType: "image/png" } : null;
}

async function refreshMetaAttachment({ organizationId, attachment, message }) {
  if (!message?.external_message_id) return null;
  const { data: connection, error } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("credentials_reference")
    .eq("organization_id", organizationId)
    .eq("id", message.connection_id)
    .maybeSingle();
  if (error) throw error;
  if (!connection?.credentials_reference) return null;

  const credential = await CredentialRuntime.resolve(connection.credentials_reference, {
    organization_id: organizationId,
  });
  if (!credential?.secret_reference) return null;

  const version = text(process.env.META_GRAPH_API_VERSION || process.env.META_GRAPH_VERSION || "v24.0");
  const url = new URL(`https://graph.facebook.com/${version.startsWith("v") ? version : `v${version}`}/${encodeURIComponent(message.external_message_id)}`);
  url.searchParams.set("fields", "attachments,sticker");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${credential.secret_reference}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) return null;

  const wantedType = object(attachment.metadata).provider_attachment_type;
  const refreshed = metaAttachmentUrl(payload, wantedType);
  if (!refreshed?.url) return null;

  const updated = await supabaseAdmin
    .from("communication_attachments")
    .update({
      external_url: refreshed.url,
      mime_type: attachment.mime_type || refreshed.mimeType || null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", attachment.id);
  if (updated.error) throw updated.error;
  return refreshed;
}

async function fetchMedia(url) {
  if (!url) return null;
  const response = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  const bytes = await response.arrayBuffer();
  return {
    bytes,
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function GET(request, { params }) {
  try {
    const attachmentId = text(params?.attachmentId);
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }
    if (!attachmentId) return NextResponse.json({ success: false, error: "ATTACHMENT_REQUIRED" }, { status: 400 });

    const { data: attachment, error: attachmentError } = await supabaseAdmin
      .from("communication_attachments")
      .select("id,organization_id,message_id,external_url,mime_type,metadata")
      .eq("organization_id", access.organizationId)
      .eq("id", attachmentId)
      .maybeSingle();
    if (attachmentError) throw attachmentError;
    if (!attachment) return NextResponse.json({ success: false, error: "ATTACHMENT_NOT_FOUND" }, { status: 404 });

    let media = await fetchMedia(attachment.external_url);
    if (!media) {
      const { data: message, error: messageError } = await supabaseAdmin
        .from("communication_messages")
        .select("id,provider,connection_id,external_message_id")
        .eq("organization_id", access.organizationId)
        .eq("id", attachment.message_id)
        .maybeSingle();
      if (messageError) throw messageError;

      if (["facebook_messenger", "instagram_messaging"].includes(text(message?.provider).toLowerCase())) {
        const refreshed = await refreshMetaAttachment({ organizationId: access.organizationId, attachment, message });
        media = await fetchMedia(refreshed?.url);
      }
    }

    if (!media) return NextResponse.json({ success: false, error: "ATTACHMENT_MEDIA_UNAVAILABLE" }, { status: 404 });

    return new NextResponse(media.bytes, {
      status: 200,
      headers: {
        "Content-Type": attachment.mime_type || media.contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Attachment unavailable" }, { status: 500 });
  }
}
