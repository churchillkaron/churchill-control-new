/**
 * SAFE BOOT STATE FOR AVANTIQO OS
 * Prevents runtime crashes during initialization
 */

export function createSafeWorkspaceState() {
  return {
    organization: {
      id: null,
      name: "Loading Workspace...",
    },
    navigation: {},
    ready: false,
  };
}
