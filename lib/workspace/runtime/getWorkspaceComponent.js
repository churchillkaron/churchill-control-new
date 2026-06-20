import dynamic from "next/dynamic";

/**
 * ================================
 * CORE PLATFORM MODULES (GLOBAL)
 * ================================
 * These run in ALL industries
 */

const coreModules = {
  pos: () => import("@/app/(system)/pos/page"),
  inventory: () => import("@/app/(system)/inventory/page"),
  finance: () => import("@/app/(system)/workspace/platform/accounting/page"),
  payroll: () => import("@/app/(system)/payroll/page"),
  crm: () => import("@/app/(system)/customers/page"),
  analytics: () => import("@/app/(system)/dashboard/page"),
  procurement: () => import("@/app/(system)/procurement/page"),
};

/**
 * ================================
 * INDUSTRY MODULES (VERTICALS)
 * ================================
 * These define experience layer only
 */

const industryModules = {
  restaurant: () => import("@/app/(system)/production/page"),
  hotel: () =>
    import("@/app/(system)/workspace/[organizationId]/hotel/page"),
  healthcare: () =>
    import("@/app/(system)/workspace/[organizationId]/healthcare/page"),
  retail: () =>
    import("@/app/(system)/workspace/[organizationId]/retail/page"),
  construction: () =>
    import("@/app/(system)/workspace/[organizationId]/construction/page"),
  entertainment: () =>
    import("@/app/(system)/workspace/[organizationId]/entertainment/page"),
};

/**
 * ================================
 * SPECIALIZED MODULES
 * ================================
 */

const specializedModules = {
  bar: () => import("@/app/(system)/bar/page"),
  tables: () => import("@/app/(system)/tables/page"),
  production: () => import("@/app/(system)/production/page"),
  kitchen: () => import("@/app/(system)/kitchen/page"),
};

/**
 * ================================
 * RESOLVER
 * ================================
 */

export function getWorkspaceComponent(moduleId) {
  const loader =
    coreModules[moduleId] ||
    industryModules[moduleId] ||
    specializedModules[moduleId];

  if (!loader) return null;

  return dynamic(loader);
}
