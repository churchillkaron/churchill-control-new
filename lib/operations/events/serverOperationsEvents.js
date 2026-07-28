import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createOperationsEventDelivery } from "./OperationsEventDelivery";

export const serverOperationsEvents = createOperationsEventDelivery({
  client: supabaseAdmin,
});

export default serverOperationsEvents;
