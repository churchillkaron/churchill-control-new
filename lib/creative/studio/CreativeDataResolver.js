import {
  getCreativeDocument,
} from "./CreativeDocumentRegistry";

export async function resolveCreativeWorkspaceData({

  workspace,

  organizationId,

}) {

  const document =
    getCreativeDocument(
      workspace.document
    );

  if (!document) {

    return {

      rows: [],

      loading: false,

      error:
        "Unknown document",

    };

  }

  const runtime =
    document.runtime;

  if (
    runtime &&
    typeof runtime.list === "function"
  ) {

    try {

      const rows =
        await runtime.list(
          organizationId
        );

      return {

        rows,

        loading: false,

        error: null,

      };

    } catch (e) {

      return {

        rows: [],

        loading: false,

        error:
          e.message,

      };

    }

  }

  return {

    rows: [],

    loading: false,

    error: null,

  };

}
