import { useWorkspaceRuntime } from "@/app/providers/WorkspaceRuntimeProvider";

export function useOrganizationRuntime() {
  return useWorkspaceRuntime();
}
