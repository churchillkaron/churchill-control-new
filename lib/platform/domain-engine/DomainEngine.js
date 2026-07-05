import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * SINGLE ERP DOMAIN ENGINE
 * replaces Finance / Inventory / Creative runtimes
 */

export const DomainEngine = {

  async list({
    table,
    organization_id,
    filters = {},
    orderBy = "created_at",
  }) {

    let query = supabaseAdmin
      .from(table)
      .select("*");

    if (organization_id) {
      query = query.eq("organization_id", organization_id);
    }

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });

    query = query.order(orderBy, { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  },

  async get({
    table,
    id,
  }) {

    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;

    return data;
  },

  async create({
    table,
    data,
  }) {

    const { data: result, error } = await supabaseAdmin
      .from(table)
      .insert(data)
      .select("*")
      .single();

    if (error) throw error;

    return result;
  },

  async update({
    table,
    id,
    data,
  }) {

    const { data: result, error } = await supabaseAdmin
      .from(table)
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return result;
  },

  async remove({
    table,
    id,
  }) {

    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq("id", id);

    if (error) throw error;

    return true;
  },

};
