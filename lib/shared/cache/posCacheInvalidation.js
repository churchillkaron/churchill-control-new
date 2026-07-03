import { clearCache } from "./memoryCache";

export function invalidatePOSCache() {
  clearCache();
}

export function invalidatePOSOrderCache() {
  clearCache();
}

export function invalidateKitchenCache() {
  clearCache();
}
