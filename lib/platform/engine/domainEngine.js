import {
  DOMAIN_REGISTRY,
} from "@/lib/platform/domains/domainRegistry";

import {
  SYSTEM_REGISTRY,
} from "@/lib/shared/architecture/systemRegistry";

export function getDomain(
  domainId
) {

  return DOMAIN_REGISTRY[
    domainId
  ];

}

export function getDomainsByCategory(
  category
) {

  return Object.values(
    DOMAIN_REGISTRY
  ).filter(
    domain =>

      domain.category ===
      category
  );

}

export function getActiveDomains() {

  const activeDomainIds =

    Object.values(
      SYSTEM_REGISTRY
    )

    .flatMap(
      section =>

        section.domains
    )

    .filter(
      domain =>

        domain.keep
    )

    .map(
      domain =>

        domain.name
          .split("/")[0]
    );

  return activeDomainIds

    .map(
      domainId =>

        DOMAIN_REGISTRY[
          domainId
        ]
    )

    .filter(Boolean);

}

export function getDomainsByIndustry(
  industry
) {

  return Object.values(
    DOMAIN_REGISTRY
  ).filter(
    domain =>

      domain.industries?.includes(
        "all"
      ) ||

      domain.industries?.includes(
        industry
      )
  );

}

export function getDomainsByPermission(
  permission
) {

  return Object.values(
    DOMAIN_REGISTRY
  ).filter(
    domain =>

      domain.permissions?.includes(
        permission
      )
  );

}
