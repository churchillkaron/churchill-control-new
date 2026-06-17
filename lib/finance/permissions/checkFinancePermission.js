import { createServerSupabase } from "@/lib/shared/supabase/server";
export function checkFinancePermission({
  permissions = [],
  module,
  action,
}) {

  const allowed =
    permissions.some(
      permission =>
        permission.module ===
          module &&
        permission.action ===
          action
    )

  return {
    module,
    action,
    allowed,
  }
}
