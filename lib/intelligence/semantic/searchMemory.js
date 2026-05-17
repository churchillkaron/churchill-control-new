import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function similarity(a, b) {

  const textA =
    (a || "")
      .toLowerCase();

  const textB =
    (b || "")
      .toLowerCase();

  const wordsA =
    textA.split(" ");

  const wordsB =
    textB.split(" ");

  const overlap =
    wordsA.filter(
      (word) =>
        wordsB.includes(
          word
        )
    );

  return overlap.length;
}

export default async function searchMemory({
  tenant_id,
  query,
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
            score:
              similarity(
                query,
                item.text
              ),
          })
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        )
        .slice(0, 10);

    return {
      success: true,
      results: ranked,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
