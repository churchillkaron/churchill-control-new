import { createServerSupabase } from "@/lib/shared/supabase/server";
export async function getTreasuryPositions() {
  return [
    {
      bank: "Kasikorn",
      currency: "THB",
      balance: 4800000,
    },
    {
      bank: "SCB",
      currency: "USD",
      balance: 210000,
    },
  ];
}
