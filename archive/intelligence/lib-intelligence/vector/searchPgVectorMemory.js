import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import generateEmbeddings from "@/lib/intelligence/openai/generateEmbeddings";

export default async function searchPgVectorMemory({
  tenant_id,
  query,
}) {

  try {

    const embedding =
      await generateEmbeddings(
        query
      );

    if (
      !embedding.success
    ) {

      return embedding;
    }

    const vector =
      `[${embedding.embedding.join(",")}]`;

    const {
      data,
      error,
    } = await supabaseAdmin.rpc(
      "match_vector_memory",
      {

        query_embedding:
          vector,

        match_tenant_id:
          tenant_id,

        match_count: 10,
      }
    );

    if (error) {
      throw error;
    }

    return {

      success: true,

      results:
        data || [],
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
