import crypto from "node:crypto";
import { MarketingCampaignConsentRuntime } from "@/lib/marketing/campaigns/MarketingCampaignConsentRuntime";

function text(value) { return String(value ?? "").trim(); }
function base64url(value) { return Buffer.from(value, "utf8").toString("base64url"); }
function decode(value) { return Buffer.from(String(value || ""), "base64url").toString("utf8"); }

function secret() {
  return text(process.env.MARKETING_UNSUBSCRIBE_SECRET);
}

function appOrigin() {
  const value = text(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL);
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}

function signature(payload, key) {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const MarketingCampaignUnsubscribeRuntime = {
  readiness() {
    const origin = appOrigin();
    const configured = Boolean(secret() && origin);
    return {
      ready: configured,
      origin,
      blockers: [
        ...(!secret() ? ["MARKETING_UNSUBSCRIBE_SECRET_REQUIRED"] : []),
        ...(!origin ? ["APPLICATION_ORIGIN_REQUIRED"] : []),
      ],
    };
  },

  issueToken({ organizationId, partyId, channel = "email" }) {
    const key = secret();
    const origin = appOrigin();
    if (!key || !origin) throw new Error("MARKETING_UNSUBSCRIBE_RUNTIME_NOT_READY");
    const payload = base64url(JSON.stringify({
      v: 1,
      organization_id: text(organizationId),
      party_id: text(partyId),
      channel: text(channel).toLowerCase(),
      issued_at: new Date().toISOString(),
    }));
    const sig = signature(payload, key);
    const token = `${payload}.${sig}`;
    return {
      token,
      url: `${origin}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`,
    };
  },

  verifyToken(token) {
    const key = secret();
    if (!key) throw new Error("MARKETING_UNSUBSCRIBE_RUNTIME_NOT_READY");
    const [payload, provided] = String(token || "").split(".");
    if (!payload || !provided || !timingSafeEqual(signature(payload, key), provided)) throw new Error("INVALID_UNSUBSCRIBE_TOKEN");
    let data;
    try { data = JSON.parse(decode(payload)); } catch { throw new Error("INVALID_UNSUBSCRIBE_TOKEN"); }
    if (data?.v !== 1 || !text(data.organization_id) || !text(data.party_id) || text(data.channel).toLowerCase() !== "email") throw new Error("INVALID_UNSUBSCRIBE_TOKEN");
    return data;
  },

  async unsubscribe(token) {
    const data = this.verifyToken(token);
    const preference = await MarketingCampaignConsentRuntime.upsertPreference({
      organizationId: data.organization_id,
      partyId: data.party_id,
      channel: "email",
      status: "OPTED_OUT",
      source: "SELF_SERVICE_UNSUBSCRIBE",
      evidence: { token_version: 1, method: "SIGNED_LINK" },
      metadata: { unsubscribe_channel: "email" },
      actorId: null,
    });
    return { success: true, organization_id: data.organization_id, party_id: data.party_id, channel: "email", preference };
  },
};

export default MarketingCampaignUnsubscribeRuntime;
