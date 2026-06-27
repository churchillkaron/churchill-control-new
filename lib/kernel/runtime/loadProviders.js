import {
  DocumentProviderRegistry,
} from "../providers/DocumentProviderRegistry";

import {
  DocumentTypeRegistry,
} from "../registry/DocumentTypeRegistry";

export function loadProviders() {

  DocumentTypeRegistry.clear();

  for (const provider of DocumentProviderRegistry.all()) {

    for (const document of provider.documents || []) {

      DocumentTypeRegistry.register(document);

    }

  }

}
