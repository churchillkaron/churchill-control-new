import { createServerSupabase } from "@/lib/shared/supabase/server";
export async function getGroupStructure() {
  return {
    parent: "Avantiqo Holdings",
    subsidiaries: [
      "Churchill Restaurant",
      "Beach Club Group",
      "Pest Control Phuket",
      "Cole Ley Entertainment",
    ],
  };
}
