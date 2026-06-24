import dynamic from "next/dynamic";

/**
 * PLATFORM MODULE RESOLVER
 */

const modules = {

  /* OPERATIONS */

  pos: () => import("@/app/(system)/pos/page"),
  inventory: () => import("@/app/(system)/inventory/page"),
  procurement: () => import("@/app/(system)/procurement/page"),
  kitchen: () => import("@/app/(system)/kitchen/page"),
  production: () => import("@/app/(system)/production/page"),
  tables: () => import("@/app/(system)/tables/page"),

  /* FINANCE */

  finance: () =>
    import("@/app/(system)/workspace/[organizationId]/finance/page"),

  accounting: () =>
    import("@/app/(system)/workspace/[organizationId]/finance/accounting/page"),

  /* PEOPLE */

  payroll: () =>
    import("@/app/(system)/payroll/page"),

  schedule: () =>
    import("@/app/(system)/schedule/page"),

  hr: () =>
    import("@/app/(system)/schedule/page"),

  /* GROWTH */

  crm: () =>
    import("@/app/(system)/customers/page"),

  customer_portal: () =>
    import("@/app/(system)/customers/page"),

  marketing_ai: () =>
    import("@/app/(system)/marketing/dashboard/page"),

  /* INTELLIGENCE */

  analytics: () =>
    import("@/app/(system)/dashboard/page"),

  monitoring: () =>
    import("@/app/(system)/monitoring/dashboard/page"),

  owner_ai: () =>
    import("@/app/(system)/dashboard/page"),

  /* PLATFORM */

  settings: () =>
    import("@/app/(system)/settings/page"),

};

export function getWorkspaceComponent(moduleId) {

  const loader =
    modules[
      String(moduleId || "").toLowerCase()
    ];

  if (!loader) {
    return null;
  }

  return dynamic(loader);
}
