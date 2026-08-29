import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { text } from "./AvantiqoVideoPodRunpod.js";

export const AVANTIQO_VIDEO_POD_LEASE_PREFIX = "pod-fallback:";
const CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "cinema-production";
const ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const TTL = 1800;

export async function acquireVideoPodLease({ organizationId, ownerRequestId }) {
  const endpointId = `${AVANTIQO_VIDEO_POD_LEASE_PREFIX}${ownerRequestId}`;
  const { data, error } = await supabaseAdmin.rpc("acquire_avantiqo_video_runpod_lease_v2", {
    p_organization_id: organizationId,
    p_lane: LANE,
    p_endpoint_id: endpointId,
    p_endpoint_name: ENDPOINT_NAME,
    p_owner_request_id: ownerRequestId,
    p_ttl_seconds: TTL,
  });
  if (error) throw new Error(`AVANTIQO_VIDEO_POD_LEASE_ACQUIRE_FAILED:${error.code || "RPC"}`);
  if (!data?.id || data?.contract !== CONTRACT || data?.state !== "ACTIVE" || text(data.endpoint_id) !== endpointId) throw new Error("AVANTIQO_VIDEO_POD_LEASE_ACQUIRE_INVALID");
  return data;
}
export async function refreshVideoPodLease({ leaseId, ownerRequestId }) {
  const { data, error } = await supabaseAdmin.rpc("refresh_avantiqo_video_runpod_lease_v2", {
    p_lease_id: leaseId,
    p_owner_request_id: ownerRequestId,
    p_ttl_seconds: TTL,
  });
  if (error) throw new Error(`AVANTIQO_VIDEO_POD_LEASE_REFRESH_FAILED:${error.code || "RPC"}`);
  if (!data?.id || data?.state !== "ACTIVE") throw new Error("AVANTIQO_VIDEO_POD_LEASE_REFRESH_INVALID");
  return data;
}
export async function releaseVideoPodLease({ leaseId, ownerRequestId, state = "RELEASED", reason = null }) {
  const { data, error } = await supabaseAdmin.rpc("release_avantiqo_video_runpod_lease_v2", {
    p_lease_id: leaseId,
    p_owner_request_id: ownerRequestId,
    p_state: state,
    p_reason: text(reason) || null,
  });
  if (error) throw new Error(`AVANTIQO_VIDEO_POD_LEASE_RELEASE_FAILED:${error.code || "RPC"}`);
  return data;
}
export async function activeVideoPodLeases({ limit = 25 } = {}) {
  const { data, error } = await supabaseAdmin
    .from("avantiqo_video_runpod_leases")
    .select("id,organization_id,endpoint_id,owner_request_id,state,acquired_at,expires_at")
    .eq("state", "ACTIVE")
    .like("endpoint_id", `${AVANTIQO_VIDEO_POD_LEASE_PREFIX}%`)
    .order("acquired_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 25, 25)));
  if (error) throw new Error(`AVANTIQO_VIDEO_POD_LEASE_LIST_FAILED:${error.code || "DB"}`);
  return Array.isArray(data) ? data : [];
}
