export const AUTH_LEGACY_REGISTRY = [

  {
    old:
      "@/lib/auth/checkPermission",
    replacement:
      "@/lib/shared/auth",
    status:
      "LEGACY",
  },

  {
    old:
      "@/lib/auth/requireRole",
    replacement:
      "@/lib/shared/auth",
    status:
      "LEGACY",
  },

  {
    old:
      "@/lib/auth/requireTenantAccess",
    replacement:
      "@/lib/shared/auth",
    status:
      "LEGACY",
  },

  {
    old:
      "@/lib/auth/rbac/checkPermission",
    replacement:
      "@/lib/shared/auth",
    status:
      "LEGACY",
  },

];
