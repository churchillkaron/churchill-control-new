import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const clean = (value) => String(value ?? "").trim();

export async function broadcastHotelReadinessChanged({ organizationId, source = "hotel", action = "changed" } = {}) {
  const organization = clean(organizationId);
  if (!organization) return { delivered: false, skipped: true, reason: "organization_required" };

  const channel = supabaseAdmin.channel(`hotel:${organization}:readiness`, {
    config: { private: true },
  });

  try {
    const response = await channel.send({
      type: "broadcast",
      event: "readiness_changed",
      payload: {
        source: clean(source) || "hotel",
        action: clean(action) || "changed",
      },
    });

    return {
      delivered: response === "ok" || response?.status === "ok",
      skipped: false,
      response,
    };
  } catch (error) {
    console.warn("HOTEL_READINESS_BROADCAST_FAILED", {
      organizationId: organization,
      source,
      action,
      error: error?.message || String(error),
    });
    return { delivered: false, skipped: false, error: error?.message || String(error) };
  } finally {
    try {
      await supabaseAdmin.removeChannel(channel);
    } catch {
      // Broadcast is a best-effort invalidation only. Server APIs remain authority.
    }
  }
}
