import { providerRuntime } from "../providers";
import { businessNetwork } from "../network";

import {
  PlatformServicesRuntime,
} from "@/lib/platform/service-runtime/runtime/PlatformServicesRuntime";

export class PlatformRuntime {
  constructor() {
    this.providers = providerRuntime;
    this.network = businessNetwork;
    this.services = PlatformServicesRuntime;
  }

  getProvider(id) {
    return this.providers.get(id);
  }

  getBusiness(id) {
    return this.network.getBusiness(id);
  }

  execute(input) {
    return this.services.execute(input);
  }

  reload() {
    return {
      success: true,
      runtime: "platform",
      status: "reloaded",
    };
  }
}

export const platformRuntime =
  new PlatformRuntime();
