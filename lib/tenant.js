import { supabase } from "@/lib/supabase";

export async function getCurrentTenant() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", profile.client_id)
    .single();

  return {
    user,
    client,
  };
}