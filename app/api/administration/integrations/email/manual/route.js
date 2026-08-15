export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyManualMailbox } from "@/lib/platform/channels/email/EmailServerProbe";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { requestEmailSync } from "@/lib/commercial/communications/CommunicationEmailSubscriptionRuntime";

async function ensureEmailService(organizationId) {
  const existing = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: "email",
  }).catch(() => null);

  if (existing && String(existing.status || "").toUpperCase() === "ACTIVE") {
    return existing;
  }

  return OrganizationServiceRuntime.save({
    ...(existing || {}),
    organization_id: organizationId,
    service_category_id: existing?.service_category_id || "communication",
    service_id: "email",
    package_id: existing?.package_id || "core",
    status: "ACTIVE",
    managed_by: existing?.managed_by || "organization",
    authorization_required: true,
    usage_enabled: true,
    billing_enabled: true,
    billing_mode: existing?.billing_mode || "USAGE",
    pricing_mode: existing?.pricing_mode || "PROVIDER",
    fallback_enabled: false,
    activated_at: existing?.activated_at || new Date().toISOString(),
    metadata: {
      ...(existing?.metadata || {}),
      connection_model: "ORGANIZATION_MAILBOX",
    },
    configuration: existing?.configuration || {},
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body?.organizationId || body?.organization_id;
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error || "Organization access denied",
        },
        { status: access.status || 403 },
      );
    }

    const settings = {
      email: String(body?.email || "").trim().toLowerCase(),
      username: String(body?.username || body?.email || "").trim(),
      password: String(body?.password || ""),
      imapHost: String(body?.imapHost || "").trim(),
      imapPort: Number(body?.imapPort || 993),
      smtpHost: String(body?.smtpHost || "").trim(),
      smtpPort: Number(body?.smtpPort || 465),
      smtpSecurity: String(body?.smtpSecurity || "TLS").trim().toUpperCase(),
    };

    if (!["TLS", "STARTTLS"].includes(settings.smtpSecurity)) {
      return NextResponse.json(
        {
          success: false,
          error: "Outgoing mail security must be TLS or STARTTLS",
        },
        { status: 400 },
      );
    }

    if (!Number.isInteger(settings.imapPort) || !Number.isInteger(settings.smtpPort)) {
      return NextResponse.json(
        { success: false, error: "Mail server ports are invalid" },
        { status: 400 },
      );
    }

    const verified = await verifyManualMailbox(settings);
    const credential = await CredentialRuntime.store({
      provider_id: "email_imap",
      credential_type: "mailbox_password",
      secret_reference: JSON.stringify({
        username: verified.username,
        password: settings.password,
        imap: {
          host: settings.imapHost,
          port: settings.imapPort,
          security: "TLS",
        },
        smtp: {
          host: settings.smtpHost,
          port: settings.smtpPort,
          security: settings.smtpSecurity,
        },
      }),
      metadata: {
        organization_id: access.organizationId,
        purpose: "ORGANIZATION_IMAP_SMTP_MAILBOX",
        email: verified.email,
        enabled: true,
      },
    });

    const connection = await ChannelConnectionRuntime.connect({
      organization_id: access.organizationId,
      provider: "email_imap",
      channel_type: "email",
      credentials_reference: credential.id,
      metadata: {
        email: verified.email,
        account_name: verified.email,
        connection_model: "ORGANIZATION_IMAP_SMTP",
        connected_at: new Date().toISOString(),
      },
    });

    await ChannelAssetRuntime.register({
      organization_id: access.organizationId,
      connection_id: connection.id,
      provider: "email_imap",
      asset_type: "business_mailbox",
      external_id: verified.email,
      name: verified.email,
      metadata: {
        email: verified.email,
        incoming_host: settings.imapHost,
        outgoing_host: settings.smtpHost,
      },
    });

    await ensureEmailService(access.organizationId);

    let queued = false;
    try {
      const requested = await requestEmailSync({
        provider: "email_imap",
        connectionId: connection.id,
      });
      queued = requested?.matched === true;
    } catch {
      queued = false;
    }

    return NextResponse.json({
      success: true,
      mailbox: { email: verified.email },
      incoming: {
        ready: false,
        queued,
        mode: "IMAP_POLLING",
        detail: queued
          ? "Mailbox connected. Avantiqo has started incoming-mail synchronization automatically."
          : "Mailbox connected. Avantiqo will retry incoming-mail synchronization automatically.",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Mailbox connection failed",
      },
      { status: 500 },
    );
  }
}
