import { getObjectConfigurationGroups } from "@/lib/configuration/getObjectConfigurationGroups";

export async function getDishModifierGroups(dishId) {
  return await getObjectConfigurationGroups({
    objectType: "dish",
    objectId: dishId,
  });
}
