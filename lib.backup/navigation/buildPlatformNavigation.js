import { SYSTEM_REGISTRY }
from "@/lib/shared/architecture/systemRegistry";

export function buildPlatformNavigation() {

  const navigation = {};

  Object.entries(
    SYSTEM_REGISTRY
  ).forEach(

    ([groupKey, group]) => {

      navigation[group.title] =
        (group.domains || [])

          .filter(
            (domain) =>
              domain.keep !== false
          )

          .map((domain) => ({

            name:
              domain.name,

            title:
              domain.name
                .replaceAll("-", " ")
                .replace(/\b\w/g, (l) =>
                  l.toUpperCase()
                ),

            route:
              domain.name.startsWith("/")
                ? domain.name
                : `/${domain.name}`,

            type:
              domain.type,

            status:
              domain.status,

          }));

    }

  );

  return navigation;

}
