import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";

export async function createCreativeMission(input = {}) {
  return CreativeMissionRuntime.create(input);
}
