import toggleCostCenter from "../capabilities/toggleCostCenter";

export async function toggleCostCenterCommand(input) {
  return await toggleCostCenter(input);
}
