const metadata = new Map();

export function registerCapability(manifest) {
  const key =
    `${manifest.domain}.${manifest.capability}.${manifest.action}`;

  metadata.set(key, manifest);

  return manifest;
}

export function getCapabilityMetadata(key) {
  return metadata.get(key);
}

export function getAllCapabilities() {
  return [...metadata.values()];
}
