export function isCourseCompleted(
  order,
  course
) {

  const courseItems =
    order.order_items.filter(
      item =>
        item.course === course
    );

  if (
    courseItems.length === 0
  ) {

    return false;

  }

  return courseItems.every(
    item =>

      [
        "SERVED",
        "CLOSED",
      ].includes(
        item.status
      )
  );

}

export function getNextCourse(
  order
) {

  const courses =
    order.order_items.map(
      item => item.course
    );

  const maxCourse =
    Math.max(...courses);

  for (
    let i = 1;
    i <= maxCourse;
    i++
  ) {

    const completed =
      isCourseCompleted(
        order,
        i
      );

    if (!completed) {

      return i;

    }

  }

  return null;

}
