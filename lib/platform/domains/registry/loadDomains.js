import { getRegisteredDomains } from "./registerDomain";

export function loadDomains() {
  return getRegisteredDomains();
}
