import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  getOrganizations,
} from "@/lib/organizations/getOrganizations";

export async function loadPlatformCommandCenter() {

  const organizations =
    await getOrganizations();

  const [
    usersResult,
    staffResult,
    tenantModulesResult,
    invoicesResult,
  ] = await Promise.all([

    supabaseAdmin
      .from("organization_users")
      .select("id"),

    supabaseAdmin
      .from("staff_accounts")
      .select("id"),

    supabaseAdmin
      .from("tenant_modules")
      .select("id"),

    supabaseAdmin
      .from("invoices")
      .select("id,status,total"),

  ]);

  const invoices =
    invoicesResult.data || [];

  const openInvoices =
    invoices.filter(
      invoice =>
        invoice.status !==
        "PAID"
    );

  const outstandingValue =
    openInvoices.reduce(
      (sum, invoice) =>
        sum +
        Number(
          invoice.total || 0
        ),
      0
    );

  return {

    organizations:
      organizations.length,

    activeOrganizations:
      organizations.filter(
        org =>
          org.status ===
          "active"
      ).length,

    users:
      usersResult.data?.length || 0,

    staff:
      staffResult.data?.length || 0,

    activeModules:
      tenantModulesResult.data?.length || 0,

    openInvoices:
      openInvoices.length,

    outstandingValue,

  };

}
