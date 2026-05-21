import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function cosineSimilarity(
  vecA,
  vecB
) {

  if (
    !vecA ||
    !vecB
  ) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (
    let i = 0;
    i < vecA.length;
    i++
  ) {

    dot +=
      vecA[i] *
      vecB[i];

    normA +=
      vecA[i] *
      vecA[i];

    normB +=
      vecB[i] *
      vecB[i];
  }

  return (
    dot /
    (
      Math.sqrt(
        normA
      ) *
      Math.sqrt(
        normB
      )
    )
  );
}

export default async function searchMemory({
  tenant_id,
  embedding,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("vector_memory")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(100);

    if (error) {
      throw error;
    }

    const ranked =
      (data || [])
        .map(
          (item) => ({

            ...item,

            similarity:
              cosineSimilarity(
                embedding,
                item.embedding
              ),
          })
        )
        .sort(
          (a, b) =>
            b.similarity -
            a.similarity
        )
        .slice(0, 10);

    return {
      success: true,
      results:
        ranked,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
