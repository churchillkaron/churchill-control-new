import { discoverPlatform } from "@/lib/platform/discovery";

class PlatformRuntime {

  constructor() {
    this.platform = null;
    this.started = false;
  }

  boot() {
    if (this.started) {
      return this.platform;
    }

    this.platform = discoverPlatform();
    this.started = true;

    return this.platform;
  }

  reload() {
    this.started = false;
    return this.boot();
  }

  isStarted() {
    return this.started;
  }

  getPlatform() {
    return this.boot();
  }
}

export const platformRuntime =
  new PlatformRuntime();
