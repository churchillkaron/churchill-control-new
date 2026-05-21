import {
  isCourseCompleted,
  getNextCourse,
} from "./courseEngine";

export async function processCourseFlow(
  supabase,
  order
) {

  const currentCourse =
    Number(
      order.current_course || 1
    );

  const completed =
    isCourseCompleted(
      order,
      currentCourse
    );

  if (!completed) {

    return {
      advanced: false,
    };

  }

  const nextCourse =
    getNextCourse(order);

  if (
    !nextCourse
  ) {

    return {
      advanced: false,
      finished: true,
    };

  }

  await supabase

    .from("orders")

    .update({

      current_course:
        nextCourse,

    })

    .eq(
      "id",
      order.id
    );

  await supabase

    .from("order_items")

    .update({

      hold: false,

      fire: true,

      status: "NEW",

      fire_at:
        new Date().toISOString(),

    })

    .eq(
      "order_id",
      order.id
    )

    .eq(
      "course",
      nextCourse
    );

  return {

    advanced: true,

    nextCourse,

  };

}
