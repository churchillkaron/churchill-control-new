import crypto from "node:crypto";
import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function text(value, limit = 500) { return String(value ?? "").trim().slice(0, limit); }
function secret() {
  const value = text(process.env.AVANTIQO_STAFF_OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY, 20000);
  if (!value) throw new Error("AVANTIQO_STAFF_OTP_SECRET_REQUIRED");
  return value;
}
function normalizePhone(value) {
  const raw = text(value, 80).replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(raw)) return null;
  return raw;
}
function digest(label, value) {
  return crypto.createHmac("sha256", secret()).update(`${label}:${value}`, "utf8").digest("hex");
}
function phoneHash(phone) { return digest("phone", phone); }
function otpHash({ organizationId, staffId, phone, code }) { return digest("otp", `${organizationId}:${staffId}:${phone}:${code}`); }
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function masked(phone) { return phone ? `••••${phone.slice(-4)}` : null; }

function publicDeliveryFailure({ code, message } = {}) {
  const normalizedCode = text(code, 80);
  if (normalizedCode === "131042") {
    return "WhatsApp delivery is temporarily unavailable for this employer. Ask an administrator to enable WhatsApp billing or configure the SMS fallback.";
  }
  if (text(message, 300)) {
    return "WhatsApp could not deliver the verification code. Request a new code or contact your employer if the problem continues.";
  }
  return null;
}

async function canonicalPhone({ organizationId, staff }) {
  if (!staff?.party_id) return { phone: null, partyId: null, reason: "STAFF_PARTY_REQUIRED" };
  const result = await supabaseAdmin.from("parties")
    .select("id,phone")
    .eq("organization_id", organizationId)
    .eq("id", staff.party_id)
    .maybeSingle();
  if (result.error) throw result.error;
  const phone = normalizePhone(result.data?.phone);
  return { phone, partyId: result.data?.id || staff.party_id, reason: phone ? null : "CANONICAL_PHONE_E164_REQUIRED" };
}

export async function loadStaffPhoneVerification({ organizationId, staff } = {}) {
  const canonical = await canonicalPhone({ organizationId, staff });
  const [verificationResult, challengeResult] = await Promise.all([
    canonical.phone
      ? supabaseAdmin.from("staff_phone_verifications")
          .select("phone_hash,phone_last4,verified_channel,verified_at")
          .eq("organization_id", organizationId)
          .eq("staff_id", staff.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin.from("staff_phone_verification_challenges")
      .select("status,delivery_channel,delivery_status,delivery_error_code,delivery_error_message,phone_last4,expires_at,resend_after,created_at")
      .eq("organization_id", organizationId)
      .eq("staff_id", staff.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (verificationResult.error) throw verificationResult.error;
  if (challengeResult.error) throw challengeResult.error;

  const latestChallenge = challengeResult.data
    ? {
        status: text(challengeResult.data.status, 40) || null,
        deliveryChannel: text(challengeResult.data.delivery_channel, 40) || null,
        deliveryStatus: text(challengeResult.data.delivery_status, 40) || null,
        deliveryFailure: publicDeliveryFailure({
          code: challengeResult.data.delivery_error_code,
          message: challengeResult.data.delivery_error_message,
        }),
        phoneMasked: challengeResult.data.phone_last4 ? `••••${text(challengeResult.data.phone_last4, 4)}` : null,
        expiresAt: challengeResult.data.expires_at || null,
        resendAfter: challengeResult.data.resend_after || null,
        createdAt: challengeResult.data.created_at || null,
      }
    : null;

  if (!canonical.phone) {
    return {
      status: canonical.partyId ? "PHONE_FORMAT_REQUIRED" : "PHONE_MISSING",
      verified: false,
      phoneMasked: latestChallenge?.phoneMasked || null,
      channel: null,
      verifiedAt: null,
      challenge: latestChallenge,
    };
  }

  const currentHash = phoneHash(canonical.phone);
  const verified = Boolean(
    verificationResult.data?.phone_hash &&
    safeEqual(verificationResult.data.phone_hash, currentHash)
  );
  return {
    status: verified ? "VERIFIED" : verificationResult.data ? "PHONE_CHANGED" : "UNVERIFIED",
    verified,
    phoneMasked: masked(canonical.phone),
    channel: verified ? verificationResult.data.verified_channel : null,
    verifiedAt: verified ? verificationResult.data.verified_at : null,
    challenge: latestChallenge,
  };
}

async function staffVerificationWhatsAppTransport() {
  const result = await supabaseAdmin.from("provider_credentials")
    .select("id,metadata,status,updated_at")
    .eq("provider_id", "whatsapp")
    .eq("status", "ACTIVE")
    .eq("metadata->>staff_verification_transport", "true")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("STAFF_VERIFICATION_WHATSAPP_TRANSPORT_NOT_CONFIGURED");
  const metadata = result.data.metadata || {};
  const transportOrganizationId = text(metadata.organization_id, 80);
  const templateName = text(metadata.staff_verification_template, 160) || "avantiqo_staff_verification";
  const language = text(metadata.staff_verification_language, 40) || "en_US";
  const credentialId = text(result.data.id, 80);
  if (!transportOrganizationId || !credentialId) throw new Error("STAFF_VERIFICATION_WHATSAPP_TRANSPORT_INCOMPLETE");
  return { transportOrganizationId, credentialId, templateName, language };
}

async function deliverOtp({ organizationId, phone, code }) {
  const message = `Your Avantiqo staff verification code is ${code}. It expires in 10 minutes. Do not share this code.`;
  try {
    const transport = await staffVerificationWhatsAppTransport();
    const wallet = await WalletRepository.getByOrganization(transport.transportOrganizationId);
    const currency = wallet?.currency || wallet?.default_currency;
    if (!currency) throw new Error("STAFF_VERIFICATION_WHATSAPP_WALLET_REQUIRED");
    const result = await executeService({
      organization_id: transport.transportOrganizationId,
      credential_id: transport.credentialId,
      service_id: "whatsapp",
      provider_id: "whatsapp",
      capability: "communication.whatsapp.template",
      currency,
      input: {
        recipient: phone.replace(/^\+/, ""),
        template: {
          name: transport.templateName,
          language: { code: transport.language },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
        quantity: 1,
        currency,
      },
      metadata: { source: "STAFF_PHONE_VERIFICATION", sensitive_body_transient: true, verification_channel: "WHATSAPP", staff_organization_id: organizationId },
    });
    return { delivered: true, channel: "WHATSAPP", status: "ACCEPTED", result };
  } catch (whatsappError) {
    try {
      const wallet = await WalletRepository.getByOrganization(organizationId);
      const currency = wallet?.currency || wallet?.default_currency;
      if (!currency) throw new Error("ORGANIZATION_WALLET_CURRENCY_REQUIRED");
      const result = await executeService({
        organization_id: organizationId,
        service_id: "sms",
        provider_id: "sms",
        capability: "communication.sms.send",
        currency,
        input: { recipient: phone, message, quantity: 1, currency },
        metadata: { source: "STAFF_PHONE_VERIFICATION", sensitive_body_transient: true, verification_channel: "SMS", fallback_from: "WHATSAPP" },
      });
      return { delivered: true, channel: "SMS", status: "SENT", result };
    } catch (smsError) {
      return { delivered: false, channel: null, status: "DELIVERY_FAILED", whatsappError, smsError };
    }
  }
}

export async function requestStaffPhoneVerification({ organizationId, staff, phone = null } = {}) {
  const canonical = await canonicalPhone({ organizationId, staff });
  const requestedPhone = normalizePhone(phone);
  const verificationPhone = requestedPhone || canonical.phone;
  if (!verificationPhone) {
    const error = new Error("Enter a phone number in international format, for example +66812345678");
    error.status = 400; error.code = "PHONE_E164_REQUIRED"; throw error;
  }
  const now = new Date();
  const existing = await supabaseAdmin.from("staff_phone_verification_challenges")
    .select("id,resend_after,status")
    .eq("organization_id", organizationId).eq("staff_id", staff.id).eq("status", "PENDING")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.resend_after && Date.parse(existing.data.resend_after) > now.getTime()) {
    const error = new Error("Please wait before requesting another verification code");
    error.status = 429; error.code = "PHONE_VERIFICATION_RESEND_COOLDOWN"; throw error;
  }
  await supabaseAdmin.from("staff_phone_verification_challenges").update({ status: "CANCELLED", updated_at: now.toISOString() })
    .eq("organization_id", organizationId).eq("staff_id", staff.id).eq("status", "PENDING");

  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
  const resendAfter = new Date(now.getTime() + RESEND_COOLDOWN_MS).toISOString();
  const inserted = await supabaseAdmin.from("staff_phone_verification_challenges").insert({
    organization_id: organizationId,
    staff_id: staff.id,
    party_id: canonical.partyId,
    phone_hash: phoneHash(verificationPhone),
    phone_last4: verificationPhone.slice(-4),
    code_hmac: otpHash({ organizationId, staffId: staff.id, phone: verificationPhone, code }),
    status: "PENDING",
    attempt_count: 0,
    max_attempts: MAX_ATTEMPTS,
    expires_at: expiresAt,
    resend_after: resendAfter,
  }).select("id").single();
  if (inserted.error) throw inserted.error;

  const delivery = await deliverOtp({ organizationId, phone: verificationPhone, code });
  const providerOutput = delivery.result?.output?.output || delivery.result?.output || {};
  const externalMessageId = providerOutput?.messages?.[0]?.id || providerOutput?.message_id || providerOutput?.id || null;
  await supabaseAdmin.from("staff_phone_verification_challenges").update({
    status: delivery.delivered ? "PENDING" : "DELIVERY_FAILED",
    delivery_channel: delivery.channel,
    delivery_status: delivery.status,
    external_message_id: externalMessageId,
    updated_at: new Date().toISOString(),
  }).eq("id", inserted.data.id).eq("organization_id", organizationId);
  if (!delivery.delivered) {
    const error = new Error("Phone verification transport is not ready. Connect a production WhatsApp Business phone number for this organization, or configure the SMS fallback.");
    error.status = 503; error.code = "PHONE_VERIFICATION_TRANSPORT_NOT_READY"; throw error;
  }
  return { status: delivery.status, channel: delivery.channel, phoneMasked: masked(verificationPhone), expiresAt, resendAfter };
}

export async function applyStaffPhoneVerificationDeliveryStatus({
  externalMessageId,
  status,
} = {}) {
  const providerMessageId = text(externalMessageId, 512);
  const normalizedStatus = text(status, 32).toUpperCase();
  if (!providerMessageId || !["SENT", "DELIVERED", "READ", "FAILED"].includes(normalizedStatus)) {
    return { matched: false };
  }

  const patch = {
    delivery_status: normalizedStatus,
    updated_at: new Date().toISOString(),
  };
  if (normalizedStatus === "FAILED") patch.status = "DELIVERY_FAILED";

  const result = await supabaseAdmin
    .from("staff_phone_verification_challenges")
    .update(patch)
    .eq("external_message_id", providerMessageId)
    .eq("status", "PENDING")
    .select("id,status,delivery_status")
    .limit(1);
  if (result.error) throw result.error;
  return { matched: Boolean(result.data?.length), challenge: result.data?.[0] || null };
}

export async function verifyStaffPhoneCode({ organizationId, staff, code, phone = null } = {}) {
  const canonical = await canonicalPhone({ organizationId, staff });
  const requestedPhone = normalizePhone(phone);
  const verificationPhone = requestedPhone || canonical.phone;
  if (!verificationPhone) { const error = new Error("Enter the same international phone number used to request the code"); error.status = 400; error.code = "PHONE_E164_REQUIRED"; throw error; }
  const challenge = await supabaseAdmin.from("staff_phone_verification_challenges")
    .select("*").eq("organization_id", organizationId).eq("staff_id", staff.id).eq("status", "PENDING")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (challenge.error) throw challenge.error;
  if (!challenge.data) { const error = new Error("No active phone verification challenge"); error.status = 409; error.code = "PHONE_VERIFICATION_CHALLENGE_REQUIRED"; throw error; }
  const now = new Date();
  if (Date.parse(challenge.data.expires_at) <= now.getTime()) {
    await supabaseAdmin.from("staff_phone_verification_challenges").update({ status: "EXPIRED", updated_at: now.toISOString() }).eq("id", challenge.data.id);
    const error = new Error("Verification code expired"); error.status = 410; error.code = "PHONE_VERIFICATION_EXPIRED"; throw error;
  }
  const currentPhoneHash = phoneHash(verificationPhone);
  if (!safeEqual(challenge.data.phone_hash, currentPhoneHash)) {
    await supabaseAdmin.from("staff_phone_verification_challenges").update({ status: "CANCELLED", updated_at: now.toISOString() }).eq("id", challenge.data.id);
    const error = new Error("Staff phone changed. Request a new verification code"); error.status = 409; error.code = "PHONE_VERIFICATION_PHONE_CHANGED"; throw error;
  }
  const normalizedCode = text(code, 12).replace(/\D/g, "");
  const candidateHash = otpHash({ organizationId, staffId: staff.id, phone: verificationPhone, code: normalizedCode });
  if (!safeEqual(challenge.data.code_hmac, candidateHash)) {
    const attempts = Number(challenge.data.attempt_count || 0) + 1;
    const locked = attempts >= Number(challenge.data.max_attempts || MAX_ATTEMPTS);
    await supabaseAdmin.from("staff_phone_verification_challenges").update({ attempt_count: attempts, status: locked ? "LOCKED" : "PENDING", updated_at: now.toISOString() }).eq("id", challenge.data.id);
    const error = new Error(locked ? "Too many incorrect verification attempts" : "Incorrect verification code");
    error.status = locked ? 423 : 400; error.code = locked ? "PHONE_VERIFICATION_LOCKED" : "PHONE_VERIFICATION_CODE_INVALID"; throw error;
  }
  if (canonical.phone !== verificationPhone) {
    const promoted = await supabaseAdmin.from("parties")
      .update({ phone: verificationPhone, updated_at: now.toISOString() })
      .eq("organization_id", organizationId)
      .eq("id", canonical.partyId)
      .select("id,phone")
      .maybeSingle();
    if (promoted.error) throw promoted.error;
    if (!promoted.data) { const error = new Error("Canonical staff Party could not be updated"); error.status = 409; error.code = "STAFF_PARTY_PHONE_UPDATE_FAILED"; throw error; }
  }

  await supabaseAdmin.from("staff_phone_verifications").upsert({
    organization_id: organizationId,
    staff_id: staff.id,
    party_id: canonical.partyId,
    phone_hash: currentPhoneHash,
    phone_last4: verificationPhone.slice(-4),
    verified_channel: challenge.data.delivery_channel || "WHATSAPP",
    verified_at: now.toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: "organization_id,staff_id" });
  await supabaseAdmin.from("staff_phone_verification_challenges").update({ status: "VERIFIED", verified_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", challenge.data.id);
  return loadStaffPhoneVerification({ organizationId, staff });
}
