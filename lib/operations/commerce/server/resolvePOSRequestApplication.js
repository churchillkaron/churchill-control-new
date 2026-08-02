import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolvePOSApplicationDefinition } from "@/lib/operations/commerce/server/POSApplicationRegistry";

function is