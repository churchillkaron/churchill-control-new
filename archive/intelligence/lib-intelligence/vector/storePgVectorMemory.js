import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import generateEmbeddings from "@/lib/intelligence/openai/generateEmbeddings";

export default async function storePgVectorMemory({
  tenant_id,
  category,
  text,
}) {

  try {

    const embedding =
      await generateEmbeddings(
        text
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
    } = await supabaseAdmin
      .from("vector_memory")
      .insert([
        {

          tenant_id,

          category,

          text,

          embedding:
            embedding.embedding,

          embedding_vector:
            vector,

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      memory: data,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
