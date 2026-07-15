import checkPermission from "@/lib/permissions/checkPermission";

export * from "@/lib/auth/getCurrentUser";
export * from "@/lib/auth/getServerCurrentUser";

export {
  checkPermission,
};

export default checkPermission;
