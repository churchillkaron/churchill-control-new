import {
  LEGACY_REGISTRY,
} from "@/lib/platform/legacy/legacyRegistry";

export function getLegacySystems() {

  return Object.values(
    LEGACY_REGISTRY
  ).flat();

}

export function getLegacySystem(
  name
) {

  return getLegacySystems()

    .find(
      system =>

        system.name ===
        name
    );

}

export function getLegacyRedirect(
  name
) {

  const system =
    getLegacySystem(
      name
    );

  if (!system)
    return null;

  return `/${
    system.mergeInto
  }`;

}

export function isLegacySystem(
  name
) {

  return !!getLegacySystem(
    name
  );

}
