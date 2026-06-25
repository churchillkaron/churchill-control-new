import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const cache = new Map();

export async function loadWorkCenters(
  organizationId
) {

  if (!organizationId) {
    throw new Error(
      "organizationId required"
    );
  }

  if (cache.has(organizationId)) {
    return cache.get(
      organizationId
    );
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("organization_work_centers")
    .select("*")
    .eq(
      "organization_id",
      organizationId
    )
    .eq(
      "active",
      true
    )
    .order(
      "display_order",
      {
        ascending:true,
      }
    );

  if (error) throw error;

  if (!data?.length) {
    throw new Error(
      "No Work Centers configured."
    );
  }

  cache.set(
    organizationId,
    data
  );

  return data;

}

export async function getWorkCenter(
  organizationId,
  id
){

  const centers =
    await loadWorkCenters(
      organizationId
    );

  const center =
    centers.find(
      c=>c.id===id
    );

  if(!center){
    throw new Error(
      `Unknown Work Center ${id}`
    );
  }

  return center;

}

export function clearWorkCenterCache(
  organizationId
){

  if(organizationId){
    cache.delete(
      organizationId
    );
  }else{
    cache.clear();
  }

}
