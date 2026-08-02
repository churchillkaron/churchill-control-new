import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_STATUSES = ["OPEN", "ACTIVE"];

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function actorFromAccess(access) {
  return {
    user_id: access.user?.id || null,
    staff_id: access.access?.staffAccountId || access.staff?.id || null,
    staff_name:
      access.staff?.name ||
      access.staff?.display_name ||
      access.user?.email ||
      null,
  };
}

function normalizeSession(row) {
  if (!row) return null;

  return {
    ...row,
    session_id: row.id,
    opening_float: numeric(row.opening_cash),
    closing_count: numeric(row.closing_cash),
    opened_at: row.opened_at || row.created_at || null,
    closed_at: row.closed_at || null,
  };
}

export async function loadCashSessions({ access, organizationId }) {
  const result = await supabaseAdmin
    .from("pos_shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (result.error) throw result.error;

  const sessions = (result.data || []).map(normalizeSession);
  const activeSession =
    sessions.find((session) =>
      ACTIVE_STATUSES.includes(String(session.status || "").toUpperCase())
    ) || null;

  return {
    actor: actorFromAccess(access),
    sessions,
    active_session: activeSession,

    // Compatibility aliases for existing POS clients.
    shifts: sessions,
    activeShift: activeSession,
  };
}

export async function executeCashSession({ body, access, organizationId }) {
  const action = String(body.action || "").trim().toUpperCase();
  const actor = actorFromAccess(access);
  const now = new Date().toISOString();

  if (action === "OPEN") {
    const existing = await supabaseAdmin
      .from("pos_shifts")
      .select("*")
      .eq("organization_id", organizationId)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.error && existing.error.code !== "PGRST116") {
      throw existing.error;
    }

    if (existing.data) {
      const session = normalizeSession(existing.data);
      return {
        duplicate: true,
        session,
        shift: session,
      };
    }

    const result = await supabaseAdmin
      .from("pos_shifts")
      .insert({
        organization_id: organizationId,
        staff_id: actor.staff_id,
        staff_name: actor.staff_name || "Authenticated staff",
        opening_cash: numeric(
          body.openingFloat ??
            body.opening_float ??
            body.openingCash ??
            body.opening_cash
        ),
        status: "OPEN",
        opened_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (result.error) throw result.error;
    const session = normalizeSession(result.data);

    return {
      session,
      shift: session,
    };
  }

  if (action === "CLOSE") {
    const sessionId =
      body.sessionId || body.session_id || body.shiftId || body.shift_id;

    if (!sessionId) {
      const error = new Error("sessionId required");
      error.status = 400;
      throw error;
    }

    const result = await supabaseAdmin
      .from("pos_shifts")
      .update({
        closing_cash: numeric(
          body.closingCount ??
            body.closing_count ??
            body.closingCash ??
            body.closing_cash
        ),
        status: "CLOSED",
        closed_at: now,
        updated_at: now,
      })
      .eq("organization_id", organizationId)
      .eq("id", sessionId)
      .in("status", ACTIVE_STATUSES)
      .select("*")
      .maybeSingle();

    if (result.error) throw result.error;
    if (!result.data) {
      const error = new Error("Active cash session not found");
      error.status = 404;
      throw error;
    }

    const session = normalizeSession(result.data);
    return {
      session,
      shift: session,
    };
  }

  const error = new Error("Unsupported cash session action");
  error.status = 400;
  throw error;
}

const POSCashSessionAdapter = Object.freeze({
  load: loadCashSessions,
  execute: executeCashSession,
});

export default POSCashSessionAdapter;
