import {
  getProvider,
} from "./ProviderRegistry.js";
import {
  resolveProviderCredential,
} from "./ProviderCredentialRuntime";

const RUNTIME_LOADERS = {
  linkedin: () => import("./linkedin/LinkedInProvider").then((module) => module.LinkedInProvider),
  line: () => import("./line/LINEProvider").then((module) => module.LINEProvider),
  whatsapp: () => import("./whatsapp