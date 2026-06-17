import { startUBTE } from "@/lib/shared/ubte/startup";

/**
 * UBTE MAIN ENTRY POINT
 * Use this to initialize system safely
 */

let initialized = false;

export function initUBTE() {
  if (initialized) {
    return { status: "ALREADY_INITIALIZED" };
  }

  initialized = true;

  return startUBTE();
}
