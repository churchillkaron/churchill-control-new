import {
  CreativeTemporalSemanticRepairRuntime,
} from "@/lib/creative/quality/runtime/CreativeTemporalSemanticRepairRuntime";
import {
  CreativeTemporalChannelDeliveryRuntime,
} from "./CreativeTemporalChannelDeliveryRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.temporal-channel-delivery-bootstrap.v1",
);

if (!CreativeTemporalSemanticRepairRuntime[FLAG]) {
  const evaluate = CreativeTemporalSemanticRepairRuntime.evaluate.bind(
    CreativeTemporalSemanticRepairRuntime,
  );

  Object.defineProperty(CreativeTemporalSemanticRepairRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeTemporalSemanticRepairRuntime.evaluate =
    async function evaluateWithChannelDelivery(input = {}) {
      const result = await evaluate(input);
      if (result?.status !== "READY_FOR_APPROVAL") return result;

      const delivery = await CreativeTemporalChannelDeliveryRuntime.deliver({
        organization_id: input.organization_id,
        creative_project_id: input.creative_project_id,
        post_production: result,
      });

      if (!delivery.passed) {
        return {
          ...result,
          success: false,
          passed: false,
          status: "REVIEW_REQUIRED",
          temporal_channel_delivery: delivery,
          release_readiness: null,
        };
      }

      return {
        ...result,
        temporal_channel_delivery: delivery,
        channel_delivery_complete: true,
      };
    };
}

export const CreativeTemporalChannelDeliveryBootstrap = Object.freeze({
  installed: true,
  contract: CreativeTemporalChannelDeliveryRuntime.contract,
});
