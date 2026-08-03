import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_SESSION_STATUSES = [
  "OPEN",
  "ACTIVE",
  "READY_FOR_PAYMENT",
  "PARTIAL",
];

export class RestaurantTableRepository {
  constructor() {
    this.db = supabaseAdmin;
  }

  async getTable({ organization_id, table_number }) {
    const { data, error } = await this.db
      .from("restaurant_tables")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("table_name", table_number)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async getActiveSession({ organization_id, table_number }) {
    const { data, error } = await this.db
      .from("table_sessions")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("table_number", table_number)
      .in("status", ACTIVE_SESSION_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async openSession({ organization_id, table_number, guests = 1, waiter_id = null }) {
    const table = await this.getTable({ organization_id, table_number });

    if (!table) {
      throw new Error("table_not_found");
    }

    const existing = await this.getActiveSession({
      organization_id,
      table_number,
    });

    if (existing) {
      return existing;
    }

    const { data, error } = await this.db
      .from("table_sessions")
      .insert({
        organization_id,
        table_id: table.id,
        table_number,
        guest_count: guests,
        waiter_id,
        status: "ACTIVE",
      })
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  async seatGuests({ organization_id, table_number, guests = 1, waiter_id = null }) {
    const session = await this.getActiveSession({
      organization_id,
      table_number,
    });

    if (!session) {
      return this.openSession({
        organization_id,
        table_number,
        guests,
        waiter_id,
      });
    }

    const { data, error } = await this.db
      .from("table_sessions")
      .update({
        guest_count: guests,
        waiter_id: waiter_id || session.waiter_id || null,
      })
      .eq("id", session.id)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  async closeSession({ organization_id, table_number }) {
    const session = await this.getActiveSession({
      organization_id,
      table_number,
    });

    if (!session) {
      throw new Error("active_session_not_found");
    }

    const { data, error } = await this.db
      .from("table_sessions")
      .update({
        status: "CLOSED",
        closed_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .eq("organization_id", organization_id)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  async transferTable({ organization_id, from_table, to_table }) {
    const targetTable = await this.getTable({
      organization_id,
      table_number: to_table,
    });

    if (!targetTable) {
      throw new Error("target_table_not_found");
    }

    const session = await this.getActiveSession({
      organization_id,
      table_number: from_table,
    });

    if (!session) {
      throw new Error("active_session_not_found");
    }

    const { data: sessionData, error: sessionError } = await this.db
      .from("table_sessions")
      .update({
        table_id: targetTable.id,
        table_number: to_table,
      })
      .eq("id", session.id)
      .eq("organization_id", organization_id)
      .select("*")
      .single();

    if (sessionError) throw sessionError;

    const { error: ordersError } = await this.db
      .from("orders")
      .update({
        table_id: targetTable.id,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization_id)
      .eq("session_id", session.id);

    if (ordersError) throw ordersError;

    return sessionData;
  }

  async moveGuests({ organization_id, from_table, to_table, guests = 1 }) {
    const fromSession = await this.getActiveSession({
      organization_id,
      table_number: from_table,
    });

    if (!fromSession) {
      throw new Error("active_session_not_found");
    }

    const toSession = await this.openSession({
      organization_id,
      table_number: to_table,
      guests: 0,
    });

    const fromGuests = Math.max(Number(fromSession.guest_count || 0) - Number(guests || 1), 0);
    const toGuests = Number(toSession.guest_count || 0) + Number(guests || 1);

    const { error: fromError } = await this.db
      .from("table_sessions")
      .update({ guest_count: fromGuests })
      .eq("id", fromSession.id)
      .eq("organization_id", organization_id);

    if (fromError) throw fromError;

    const { data, error } = await this.db
      .from("table_sessions")
      .update({ guest_count: toGuests })
      .eq("id", toSession.id)
      .eq("organization_id", organization_id)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }
}
