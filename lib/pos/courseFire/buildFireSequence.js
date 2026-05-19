export function buildFireSequence(
  groupedCourses = {}
) {

  return Object.entries(
    groupedCourses
  ).map(
    ([
      course,
      items,
    ]) => ({
      course,
      totalItems:
        items.length,
      items,
      fired: false,
    })
  )
}
