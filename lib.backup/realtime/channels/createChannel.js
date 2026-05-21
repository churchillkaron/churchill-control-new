import { supabase } from "@/lib/shared/supabase/client";

export default function createChannel(
  channelName
) {

  return supabase.channel(
    channelName
  );
}
