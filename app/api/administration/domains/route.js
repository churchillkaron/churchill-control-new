export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createHash, randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { normalizePlatformHostname } from "@/lib/platform/context/resolvePlatformHostContext";
import { buildOrganizationHostnameBrandMetadata } from "@/lib/platform/context/OrganizationHostnameBrandRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER = "avantiqo";
const ASSET_TYPE = "platform_hostname";
const MANAGE_ROLES = new Set(["OWNER", "ORGANIZATION_OWNER", "ORG_OWNER", "PLATFORM_OWNER", "SUPER_ADMIN", "ADMIN"]);
const TRUSTED_STATUSES = new Set(["ACTIVE", "READY", "VERIFIED", "LIVE"]);

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function roleOf(value) { return text(value).toUpperCase(); }
function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }

function validHostname(value) {
  if (!value || value.length > 253 || !value.includes(".")) return false;
  if (value === "localhost" || value.endsWith(".localhost")) return false;
  if (value === "avantiqo.ai" || value.endsWith(".avantiqo.ai") || value.endsWith(".vercel.app")) return false;
  return value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

async function domainContext(request, requestedOrganizationId = null) {
  const context = await resolveAuthenticatedStaffContext({ request, organizationId: requestedOrganizationId || null });
  if (!context.success) {
    const error = new Error(context.error || "Organization access denied");
    error.status = context.status || 403;
    throw error;
  }
  if (!MANAGE_ROLES.has(roleOf(context.role || context.staff?.role))) {
    const error = new Error("Owner or administrator authority is required to manage organization hostnames");
    error.status = 403;
    throw error;
  }
  return context;
}

async function hostnameRows(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,organization_id,external_id,name,metadata,selected_at,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("channel_provider", PROVIDER)
    .eq("asset_type", ASSET_TYPE)
    .order("updated_at", { ascending:false });
  if (error) throw error;
  return data || [];
}

function publicHostname(row) {
  const metadata = object(row?.metadata);
  const status = text(metadata.status).toUpperCase() || "ACTIVE";
  return {
    id: row.id,
    hostname: row.external_id,
    name: row.name || row.external_id,
    status,
    trusted: TRUSTED_STATUSES.has(status),
    staffPortal: metadata.staff_portal !== false,
    verifiedAt: metadata.verified_at || null,
    revokedAt: metadata.revoked_at || null,
    verificationRecordName: metadata.verification_record_name || `_avantiqo.${row.external_id}`,
    verificationRequestedAt: metadata.verification_requested_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function snapshot(organizationId) {
  const rows = await hostnameRows(organizationId);
  return { organizationId, hostnames: rows.map(publicHostname) };
}

async function exactHostname(hostname) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,organization_id,external_id,name,metadata,selected_at,created_at,updated_at")
    .eq("channel_provider", PROVIDER)
    .eq("external_id", hostname)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const context = await domainContext(request, organizationId);
    return NextResponse.json({ success:true, ...(await snapshot(context.organizationId)) });
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Unable to load organization hostnames" }, { status:Number(error?.status) || 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedOrganizationId = text(body.organizationId || body.organization_id);
    const context = await domainContext(request, requestedOrganizationId);
    const action = text(body.action || "register").toLowerCase();
    const hostname = normalizePlatformHostname(body.hostname);
    if (!validHostname(hostname)) {
      return NextResponse.json({ success:false, error:"Enter a valid customer-owned hostname, for example staff.example.com" }, { status:400 });
    }

    const existing = await exactHostname(hostname);
    if (existing && String(existing.organization_id) !== String(context.organizationId)) {
      return NextResponse.json({ success:false, error:"This hostname is already registered to another organization" }, { status:409 });
    }

    if (action === "register" || action === "regenerate") {
      const existingMetadata = object(existing?.metadata);
      const existingStatus = text(existingMetadata.status).toUpperCase();
      if (TRUSTED_STATUSES.has(existingStatus) && action !== "regenerate") {
        return NextResponse.json({ success:false, error:"This hostname is already verified. Revoke it before starting a new ownership challenge." }, { status:409 });
      }
      if (TRUSTED_STATUSES.has(existingStatus) && action === "regenerate") {
        return NextResponse.json({ success:false, error:"Verified hostnames cannot regenerate ownership proof until they are revoked." }, { status:409 });
      }

      const token = randomBytes(24).toString("base64url");
      const now = new Date().toISOString();
      const metadata = await buildOrganizationHostnameBrandMetadata({ organizationId:context.organizationId, existingMetadata:{
        ...existingMetadata,
        status:"PENDING_VERIFICATION",
        staff_portal:action === "regenerate" ? existingMetadata.staff_portal !== false : body.staffPortal !== false,
        verification_method:"DNS_TXT",
        verification_record_name:`_avantiqo.${hostname}`,
        verification_token_hash:hash(token),
        verification_requested_at:now,
        verified_at:null,
        revoked_at:null,
      }});
      const record = {
        organization_id:context.organizationId,
        connection_id:null,
        channel_provider:PROVIDER,
        asset_type:ASSET_TYPE,
        external_id:hostname,
        name:text(body.name) || `${metadata.display_name} hostname`,
        metadata,
        selected_by_party_id:context.staff?.party_id || null,
        selected_at:null,
        updated_at:now,
      };
      const query = existing?.id
        ? supabaseAdmin.from("organization_channel_assets").update(record).eq("id", existing.id).eq("organization_id", context.organizationId)
        : supabaseAdmin.from("organization_channel_assets").insert(record);
      const { data, error } = await query.select("id,external_id,name,metadata,selected_at,created_at,updated_at").single();
      if (error) throw error;
      return NextResponse.json({
        success:true,
        ...(await snapshot(context.organizationId)),
        verification:{
          hostname,
          recordName:`_avantiqo.${hostname}`,
          recordType:"TXT",
          recordValue:`avantiqo-verification=${token}`,
          requestedAt:now,
          asset:publicHostname(data),
        },
      });
    }

    if (!existing || String(existing.organization_id) !== String(context.organizationId)) {
      return NextResponse.json({ success:false, error:"Hostname registration was not found for this organization" }, { status:404 });
    }

    if (action === "verify") {
      const metadata = object(existing.metadata);
      const expectedHash = text(metadata.verification_token_hash);
      const recordName = text(metadata.verification_record_name) || `_avantiqo.${hostname}`;
      if (!expectedHash) {
        return NextResponse.json({ success:false, error:"Generate a DNS ownership challenge before verification" }, { status:409 });
      }
      let records = [];
      try {
        records = await resolveTxt(recordName);
      } catch (dnsError) {
        return NextResponse.json({ success:false, error:"DNS TXT verification record was not found yet", code:dnsError?.code || "DNS_VERIFICATION_PENDING" }, { status:409 });
      }
      const values = records.map((parts) => parts.join("")).filter(Boolean);
      const matched = values.some((value) => {
        const match = /^avantiqo-verification=(.+)$/.exec(value.trim());
        return match ? hash(match[1]) === expectedHash : false;
      });
      if (!matched) {
        return NextResponse.json({ success:false, error:"DNS TXT record exists, but the Avantiqo verification value does not match" }, { status:409 });
      }
      const now = new Date().toISOString();
      const nextMetadata = { ...metadata, status:"VERIFIED", verified_at:now, verification_method:"DNS_TXT" };
      delete nextMetadata.verification_token_hash;
      const { error } = await supabaseAdmin.from("organization_channel_assets").update({ metadata:nextMetadata, selected_at:now, selected_by_party_id:context.staff?.party_id || null, updated_at:now }).eq("id", existing.id).eq("organization_id", context.organizationId);
      if (error) throw error;
      return NextResponse.json({ success:true, ...(await snapshot(context.organizationId)) });
    }

    if (action === "revoke") {
      const metadata = object(existing.metadata);
      const now = new Date().toISOString();
      const nextMetadata = { ...metadata, status:"REVOKED", revoked_at:now };
      delete nextMetadata.verification_token_hash;
      const { error } = await supabaseAdmin.from("organization_channel_assets").update({ metadata:nextMetadata, updated_at:now }).eq("id", existing.id).eq("organization_id", context.organizationId);
      if (error) throw error;
      return NextResponse.json({ success:true, ...(await snapshot(context.organizationId)) });
    }

    return NextResponse.json({ success:false, error:"Unsupported hostname action" }, { status:400 });
  } catch (error) {
    const status = error?.code === "23505" ? 409 : Number(error?.status) || 500;
    const message = error?.code === "23505" ? "This hostname is already registered" : error?.message || "Unable to update organization hostname";
    return NextResponse.json({ success:false, error:message }, { status });
  }
}
