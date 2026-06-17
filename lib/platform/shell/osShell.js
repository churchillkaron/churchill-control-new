/**
 * AVANTIQO OS SHELL STATE
 * Controls Platform vs Workspace mode
 */

export const OS_MODE = {
  PLATFORM: "platform",
  WORKSPACE: "workspace",
};

let currentMode = OS_MODE.WORKSPACE;

export function setOSMode(mode) {
  currentMode = mode;
}

export function getOSMode() {
  return currentMode;
}
